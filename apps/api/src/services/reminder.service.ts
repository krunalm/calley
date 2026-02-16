import { and, eq, gte, isNull } from 'drizzle-orm';

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

// ─── Service ────────────────────────────────────────────────────────

export class ReminderService {
  /**
   * Create a reminder for an event or task.
   * Computes triggerAt, inserts the reminder record, and enqueues a BullMQ delayed job.
   */
  async createReminder(userId: string, data: CreateReminderInput): Promise<ReminderResponse> {
    // 1. Resolve the parent item's reference time (startAt for events, dueAt for tasks)
    const referenceTime = await this.getItemReferenceTime(userId, data.itemType, data.itemId);

    // 2. Compute triggerAt
    const triggerAt = new Date(referenceTime.getTime() - data.minutesBefore * 60 * 1000);

    // 3. Insert reminder record
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

    // 4. Enqueue BullMQ delayed job
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
    try {
      const job = await reminderQueue.getJob(reminderId);
      if (job) {
        await job.remove();
      }
    } catch (err) {
      // Non-critical: job may have already been processed or removed
      logger.warn({ err, reminderId }, 'Failed to remove BullMQ job for reminder');
    }

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
   * Re-enqueue all unsent reminders on server startup.
   * Finds reminders where sentAt IS NULL and triggerAt >= (now - 5 minutes).
   * Reminders with triggerAt in the past (within the 5-min grace window) get
   * delay=0 so they process immediately.
   */
  async reEnqueueMissedReminders(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const missed = await db.query.reminders.findMany({
      where: and(isNull(reminders.sentAt), gte(reminders.triggerAt, fiveMinutesAgo)),
    });

    if (missed.length === 0) {
      logger.info('No missed reminders to re-enqueue');
      return;
    }

    let enqueued = 0;
    for (const reminder of missed) {
      try {
        await this.enqueueReminderJob(reminder as ReminderRow);
        enqueued++;
      } catch (err) {
        logger.error({ err, reminderId: reminder.id }, 'Failed to re-enqueue reminder');
      }
    }

    logger.info({ total: missed.length, enqueued }, 'Re-enqueued missed reminders');
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
