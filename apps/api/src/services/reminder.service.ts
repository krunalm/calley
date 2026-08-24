import { and, count, eq, gt, gte, isNull, or } from 'drizzle-orm';

import { db } from '../db';
import { events, reminders, tasks } from '../db/schema';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { reminderQueue } from '../lib/queue';

import type { CreateReminderInput, ListRemindersQuery } from '@calley/shared';

// ─── Types ──────────────────────────────────────────────────────────

interface ReminderRow {
  id: string;
  userId: string;
  itemType: string;
  itemId: string;
  minutesBefore: number;
  method: string;
  triggerAt: Date;
  sentAt: Date | null;
  createdAt: Date;
}

interface ReminderResponse {
  id: string;
  userId: string;
  itemType: string;
  itemId: string;
  minutesBefore: number;
  method: string;
  triggerAt: string;
  sentAt: string | null;
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toReminderResponse(row: ReminderRow): ReminderResponse {
  return {
    id: row.id,
    userId: row.userId,
    itemType: row.itemType,
    itemId: row.itemId,
    minutesBefore: row.minutesBefore,
    method: row.method,
    triggerAt: row.triggerAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Constants ──────────────────────────────────────────────────────

/** Reminders pulled per page when rebuilding the queue after a restart. */
const REENQUEUE_PAGE_SIZE = 500;

/**
 * Reminders one item may carry.
 *
 * Each one is a durable row plus a delayed queue job, so an unbounded count is
 * an unbounded amount of scheduled work an authenticated caller can create
 * against a single event.
 */
const MAX_REMINDERS_PER_ITEM = 10;

// ─── Service ────────────────────────────────────────────────────────

export class ReminderService {
  /**
   * Create a reminder for an event or task.
   * Computes triggerAt, inserts the reminder record, and enqueues a BullMQ delayed job.
   */
  async createReminder(userId: string, data: CreateReminderInput): Promise<ReminderResponse> {
    // 1. Resolve the parent item's reference time (startAt for events, dueAt for tasks)
    const referenceTime = await this.getItemReferenceTime(userId, data.itemType, data.itemId);

    // 2. Cap how many reminders one item can carry
    const [{ value: existingCount }] = await db
      .select({ value: count() })
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          eq(reminders.itemType, data.itemType),
          eq(reminders.itemId, data.itemId),
        ),
      );

    if (existingCount >= MAX_REMINDERS_PER_ITEM) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        `An item can have at most ${MAX_REMINDERS_PER_ITEM} reminders`,
      );
    }

    // 3. Compute triggerAt
    const triggerAt = new Date(referenceTime.getTime() - data.minutesBefore * 60 * 1000);

    // 4. Insert reminder record
    const [reminder] = await db
      .insert(reminders)
      .values({
        userId,
        itemType: data.itemType,
        itemId: data.itemId,
        minutesBefore: data.minutesBefore,
        method: data.method,
        triggerAt,
      })
      .returning();

    // 5. Enqueue BullMQ delayed job
    await this.enqueueReminderJob(reminder as ReminderRow);

    logger.info(
      { userId, reminderId: reminder.id, itemType: data.itemType, itemId: data.itemId, triggerAt },
      'Reminder created',
    );

    return toReminderResponse(reminder as ReminderRow);
  }

  /**
   * Delete a reminder by ID with ownership check.
   * Removes the BullMQ job as well.
   */
  async deleteReminder(userId: string, reminderId: string): Promise<void> {
    const reminder = await db.query.reminders.findFirst({
      where: and(eq(reminders.id, reminderId), eq(reminders.userId, userId)),
    });

    if (!reminder) {
      throw new AppError(404, 'NOT_FOUND', 'Reminder not found');
    }

    // Remove the BullMQ job (use reminder ID as job ID)
    await this.removeReminderJob(reminderId);

    // Delete the reminder record
    await db
      .delete(reminders)
      .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));

    logger.info({ userId, reminderId }, 'Reminder deleted');
  }

  /**
   * List reminders for a specific event or task.
   */
  async listReminders(userId: string, query: ListRemindersQuery): Promise<ReminderResponse[]> {
    // Verify the parent item exists and belongs to the user
    await this.getItemReferenceTime(userId, query.itemType, query.itemId);

    const result = await db.query.reminders.findMany({
      where: and(
        eq(reminders.userId, userId),
        eq(reminders.itemType, query.itemType),
        eq(reminders.itemId, query.itemId),
      ),
      orderBy: (r, { asc }) => [asc(r.triggerAt)],
    });

    return result.map((r) => toReminderResponse(r as ReminderRow));
  }

  /**
   * Re-synchronise an item's pending reminders after its reference time moved.
   *
   * `triggerAt` is derived state — SPECS §6.7 defines it as
   * `item start/due - minutesBefore` — so rescheduling an event or task has to
   * recompute it and re-arm the delayed job. Without this the reminder keeps
   * firing at the old absolute time while the notification itself is rendered
   * from the item's new time.
   *
   * Reminders that have already been sent are left untouched. Passing a null
   * reference time (a task that lost its due date) cancels the queued job and
   * leaves the record in place.
   *
   * The database write is the durable part and happens first; queue failures are
   * logged and swallowed, since `reEnqueueMissedReminders` re-arms from the
   * stored `triggerAt` on the next startup.
   */
  async resyncItemReminders(
    userId: string,
    itemType: 'event' | 'task',
    itemId: string,
    referenceTime: Date | null,
  ): Promise<void> {
    const pending = await db.query.reminders.findMany({
      where: and(
        eq(reminders.userId, userId),
        eq(reminders.itemType, itemType),
        eq(reminders.itemId, itemId),
        isNull(reminders.sentAt),
      ),
    });

    if (pending.length === 0) return;

    for (const row of pending) {
      const reminder = row as ReminderRow;

      if (!referenceTime) {
        await this.removeReminderJob(reminder.id);
        continue;
      }

      const triggerAt = new Date(referenceTime.getTime() - reminder.minutesBefore * 60 * 1000);
      if (triggerAt.getTime() === reminder.triggerAt.getTime()) continue;

      await db.update(reminders).set({ triggerAt }).where(eq(reminders.id, reminder.id));

      // BullMQ ignores `add` for an existing jobId, so the stale job has to go
      // before the new delay can take effect. If removal failed, adding would be
      // a silent no-op that leaves the old trigger time armed — report it
      // instead of pretending the reminder was re-armed.
      const removed = await this.removeReminderJob(reminder.id);
      if (!removed) {
        logger.error(
          { reminderId: reminder.id, itemType, itemId, triggerAt },
          'Could not clear the previous reminder job; the queue still holds the old trigger time',
        );
        continue;
      }

      try {
        await this.enqueueReminderJob({ ...reminder, triggerAt });
      } catch (err) {
        logger.warn({ err, reminderId: reminder.id }, 'Failed to re-enqueue rescheduled reminder');
      }
    }

    logger.info(
      { userId, itemType, itemId, count: pending.length },
      'Reminders resynced after item reschedule',
    );
  }

  /**
   * Re-enqueue all unsent reminders on server startup.
   * Finds reminders where sentAt IS NULL and triggerAt >= (now - 5 minutes).
   * Reminders with triggerAt in the past (within the 5-min grace window) get
   * delay=0 so they process immediately.
   */
  async reEnqueueMissedReminders(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    let total = 0;
    let enqueued = 0;
    let cursor: { triggerAt: Date; id: string } | null = null;

    // Paged by (triggerAt, id) rather than fetched in one go: this runs on
    // every boot across every user's pending reminders, and an instance
    // restarting into a large backlog would otherwise materialise the whole
    // table before enqueuing anything.
    for (;;) {
      const page: ReminderRow[] = (await db.query.reminders.findMany({
        where: and(
          isNull(reminders.sentAt),
          gte(reminders.triggerAt, fiveMinutesAgo),
          ...(cursor
            ? [
                or(
                  gt(reminders.triggerAt, cursor.triggerAt),
                  and(eq(reminders.triggerAt, cursor.triggerAt), gt(reminders.id, cursor.id)),
                )!,
              ]
            : []),
        ),
        orderBy: (r, { asc }) => [asc(r.triggerAt), asc(r.id)],
        limit: REENQUEUE_PAGE_SIZE,
      })) as ReminderRow[];

      if (page.length === 0) break;

      for (const reminder of page) {
        total++;
        try {
          await this.enqueueReminderJob(reminder);
          enqueued++;
        } catch (err) {
          logger.error({ err, reminderId: reminder.id }, 'Failed to re-enqueue reminder');
        }
      }

      if (page.length < REENQUEUE_PAGE_SIZE) break;
      const last = page[page.length - 1];
      cursor = { triggerAt: last.triggerAt, id: last.id };
    }

    if (total === 0) {
      logger.info('No missed reminders to re-enqueue');
      return;
    }

    logger.info({ total, enqueued }, 'Re-enqueued missed reminders');
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Resolve the reference time for a parent event or task.
   * For events: startAt. For tasks: dueAt (must exist).
   * Also serves as the ownership check for the parent item.
   */
  private async getItemReferenceTime(
    userId: string,
    itemType: string,
    itemId: string,
  ): Promise<Date> {
    if (itemType === 'event') {
      const event = await db.query.events.findFirst({
        where: and(eq(events.id, itemId), eq(events.userId, userId), isNull(events.deletedAt)),
        columns: { startAt: true },
      });
      if (!event) {
        throw new AppError(404, 'NOT_FOUND', 'Event not found');
      }
      return event.startAt;
    }

    if (itemType === 'task') {
      const task = await db.query.tasks.findFirst({
        where: and(eq(tasks.id, itemId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
        columns: { dueAt: true },
      });
      if (!task) {
        throw new AppError(404, 'NOT_FOUND', 'Task not found');
      }
      if (!task.dueAt) {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'Cannot create reminder for a task without a due date',
        );
      }
      return task.dueAt;
    }

    throw new AppError(400, 'VALIDATION_ERROR', `Invalid item type: ${itemType}`);
  }

  /**
   * Remove a reminder's BullMQ job.
   *
   * Returns whether the queue is now known to be free of a job under this id.
   * Callers that intend to re-arm the reminder must check it: the job id is the
   * reminder id, and BullMQ ignores `add` for an id that still exists, so
   * re-adding after a failed removal would silently leave the old schedule in
   * place. Failures are logged rather than propagated — the caller decides
   * whether they are fatal.
   */
  private async removeReminderJob(reminderId: string): Promise<boolean> {
    try {
      const job = await reminderQueue.getJob(reminderId);
      if (job) {
        await job.remove();
      }
      return true;
    } catch (err) {
      logger.warn({ err, reminderId }, 'Failed to remove BullMQ job for reminder');
      return false;
    }
  }

  /**
   * Enqueue a BullMQ delayed job for a reminder.
   * Uses the reminder's database ID as the BullMQ job ID for easy cancellation.
   */
  private async enqueueReminderJob(reminder: ReminderRow): Promise<void> {
    const now = Date.now();
    const triggerMs = reminder.triggerAt.getTime();
    const delay = Math.max(0, triggerMs - now);

    await reminderQueue.add(
      'send-reminder',
      {
        reminderId: reminder.id,
        userId: reminder.userId,
        itemType: reminder.itemType,
        itemId: reminder.itemId,
        method: reminder.method,
      },
      {
        jobId: reminder.id,
        delay,
      },
    );
  }
}

export const reminderService = new ReminderService();
