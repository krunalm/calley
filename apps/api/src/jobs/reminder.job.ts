import { Worker } from 'bullmq';
import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../db';
import { events, reminders, tasks, users } from '../db/schema';
import { reminderNotificationEmail } from '../emails/reminder-notification';
import { sendEmail } from '../lib/email';
import { logger } from '../lib/logger';
import { bullmqConnection, QUEUE_NAMES, registerWorker } from '../lib/queue';
import { pushSubscriptionService } from '../services/push-subscription.service';
import { sseService } from '../services/sse.service';

// ─── Job Payload Type ──────────────────────────────────────────────

interface ReminderJobData {
  reminderId: string;
  userId: string;
  itemType: 'event' | 'task';
  itemId: string;
  method: 'push' | 'email' | 'both';
}

// ─── Helper: Resolve parent item info ──────────────────────────────

interface ItemInfo {
  title: string;
  /**
   * The item's reference time. Null when the item still exists but currently has
   * nothing to fire against — a task whose due date was cleared.
   */
  time: Date | null;
  isDeleted: boolean;
}

/** An ItemInfo that is known to have a reference time. */
interface ResolvedItemInfo extends ItemInfo {
  time: Date;
}

async function getItemInfo(
  userId: string,
  itemType: string,
  itemId: string,
): Promise<ItemInfo | null> {
  if (itemType === 'event') {
    const event = await db.query.events.findFirst({
      where: and(eq(events.id, itemId), eq(events.userId, userId)),
      columns: { title: true, startAt: true, deletedAt: true },
    });
    if (!event) return null;
    return {
      title: event.title,
      time: event.startAt,
      isDeleted: event.deletedAt !== null,
    };
  }

  if (itemType === 'task') {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, itemId), eq(tasks.userId, userId)),
      columns: { title: true, dueAt: true, deletedAt: true },
    });
    if (!task) return null;
    // A cleared due date is NOT the same as a missing task: the reminder must
    // survive so restoring the due date can resynchronise it.
    return {
      title: task.title,
      time: task.dueAt,
      isDeleted: task.deletedAt !== null,
    };
  }

  return null;
}

// ─── Helper: Send email notification ───────────────────────────────

async function sendReminderEmail(
  user: { email: string; timezone: string | null },
  itemType: 'event' | 'task',
  itemInfo: ResolvedItemInfo,
  minutesBefore: number,
): Promise<void> {
  const timezone = user.timezone || 'UTC';

  const appBaseUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
  // The link points at the item's day on the user's own calendar. Formatting the
  // UTC instant on the server (UTC in every deployed container) sent users in
  // other timezones to the wrong — often previous — day.
  const dateParam = formatInTimeZone(itemInfo.time, timezone, 'yyyy-MM-dd');
  const appUrl = `${appBaseUrl}/calendar?date=${dateParam}&view=day`;

  const timeFormatted = formatInTimeZone(itemInfo.time, timezone, "EEE, MMM d 'at' h:mm a");

  const { html, text } = reminderNotificationEmail({
    itemType,
    title: itemInfo.title,
    time: timeFormatted,
    minutesBefore,
    appUrl,
  });

  await sendEmail({
    to: user.email,
    subject: `Reminder: ${itemInfo.title}`,
    html,
    text,
  });
}

// ─── Helper: Send push notification via Web Push ────────────────────

async function sendReminderPush(
  userId: string,
  timezone: string | null,
  itemType: 'event' | 'task',
  itemInfo: ResolvedItemInfo,
): Promise<void> {
  const appBaseUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const dateParam = formatInTimeZone(itemInfo.time, timezone || 'UTC', 'yyyy-MM-dd');
  const url = `${appBaseUrl}/calendar?date=${dateParam}&view=day`;

  await pushSubscriptionService.sendPushToUser(userId, {
    title: `Reminder: ${itemInfo.title}`,
    body: itemType === 'event' ? 'Upcoming event' : 'Task due soon',
    url,
  });
}

// ─── Job Processor ─────────────────────────────────────────────────

/**
 * Process a single reminder job. Exported so the delivery rules can be unit
 * tested without standing up a BullMQ worker and a Redis connection.
 */
export async function processReminderJob(data: ReminderJobData): Promise<void> {
  const { reminderId, userId, itemType, itemId, method } = data;

  logger.info({ reminderId, userId, itemType, itemId, method }, 'Processing reminder job');

  // 1. Atomically claim the reminder BEFORE delivering it. The previous flow —
  //    read where sentAt IS NULL, deliver, then mark sent — let two workers
  //    observe the same unsent reminder (duplicate jobs after a restart, a
  //    stalled job retried) and both deliver. The conditional update is the
  //    claim: exactly one worker's write lands, and only that worker proceeds.
  //    Marking sentAt up front also means a worker crash mid-delivery can no
  //    longer double-send on the retry; the trade-off — a crash losing one
  //    reminder — is the safer side of at-most-once for notifications.
  const [claimed] = await db
    .update(reminders)
    .set({ sentAt: new Date() })
    .where(and(eq(reminders.id, reminderId), isNull(reminders.sentAt)))
    .returning();

  if (!claimed) {
    logger.info({ reminderId }, 'Reminder already sent or deleted, skipping');
    return;
  }

  // Release the claim when this attempt cannot deliver, so a later attempt
  // still can. Failure to release is logged but not fatal: throwing while the
  // claim stands would burn the reminder permanently on a transient error, so
  // a failed release falls back to at-most-once.
  const releaseClaim = async () => {
    try {
      await db.update(reminders).set({ sentAt: null }).where(eq(reminders.id, reminderId));
    } catch (err) {
      logger.error({ err, reminderId }, 'Failed to release reminder claim after error');
    }
  };

  // 2. Verify parent event/task exists and is not deleted
  const itemInfo = await getItemInfo(userId, itemType, itemId);

  if (!itemInfo || itemInfo.isDeleted) {
    logger.info({ reminderId, itemType, itemId }, 'Parent item deleted, skipping reminder');
    // The claim stands: the reminder is retired, which is the point.
    return;
  }

  // The item is still there but currently has no time to fire against — a task
  // whose due date was cleared. Release the claim so the reminder stays
  // pending: restoring the due date resynchronises it
  // (resyncItemReminders only considers unsent reminders).
  if (!itemInfo.time) {
    logger.info(
      { reminderId, itemType, itemId },
      'Item has no due date, leaving reminder pending until one is set',
    );
    await releaseClaim();
    return;
  }

  const resolvedInfo: ResolvedItemInfo = { ...itemInfo, time: itemInfo.time };

  // 3. Load the recipient's email + timezone once, for both channels.
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true, timezone: true },
  });

  if (!user) {
    logger.warn({ userId }, 'User not found for reminder delivery');
    return;
  }

  // 4. Send notification(s) in parallel when both channels are needed
  try {
    const notifications: Promise<void>[] = [];
    if (method === 'email' || method === 'both') {
      notifications.push(sendReminderEmail(user, itemType, resolvedInfo, claimed.minutesBefore));
    }
    if (method === 'push' || method === 'both') {
      notifications.push(sendReminderPush(userId, user.timezone, itemType, resolvedInfo));
    }
    await Promise.all(notifications);
  } catch (err) {
    // Delivery failed — hand the reminder back so BullMQ's retry (this rethrow)
    // can try again, instead of a transient error permanently consuming it.
    await releaseClaim();
    throw err;
  }

  // 5. Emit reminder:fired on SSE for in-app toast
  sseService.emit(userId, 'reminder:fired', {
    reminderId,
    itemType,
    itemId,
    title: resolvedInfo.title,
  });

  logger.info({ reminderId, method }, 'Reminder sent successfully');
}

// ─── Worker ────────────────────────────────────────────────────────

export function startReminderWorker(): Worker {
  const worker = new Worker<ReminderJobData>(
    QUEUE_NAMES.REMINDERS,
    async (job) => processReminderJob(job.data),
    {
      connection: bullmqConnection,
      concurrency: 10,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Reminder job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message, attemptsMade: job?.attemptsMade },
      'Reminder job failed',
    );
  });

  registerWorker(worker);
  return worker;
}
