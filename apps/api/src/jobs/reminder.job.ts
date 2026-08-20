import { Worker } from 'bullmq';
import { format } from 'date-fns';
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
  userId: string,
  itemType: 'event' | 'task',
  itemInfo: ResolvedItemInfo,
  minutesBefore: number,
): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });

  if (!user) {
    logger.warn({ userId }, 'User not found for reminder email');
    return;
  }

  const appBaseUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const dateParam = format(itemInfo.time, 'yyyy-MM-dd');
  const appUrl =
    itemType === 'event'
      ? `${appBaseUrl}/calendar?date=${dateParam}&view=day`
      : `${appBaseUrl}/calendar?date=${dateParam}&view=day`;

  const timeFormatted = format(itemInfo.time, "EEE, MMM d 'at' h:mm a");

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
  itemType: 'event' | 'task',
  itemInfo: ResolvedItemInfo,
): Promise<void> {
  const appBaseUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const dateParam = format(itemInfo.time, 'yyyy-MM-dd');
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

  // 1. Verify reminder exists and hasn't been sent (idempotency)
  const reminder = await db.query.reminders.findFirst({
    where: and(eq(reminders.id, reminderId), isNull(reminders.sentAt)),
  });

  if (!reminder) {
    logger.info({ reminderId }, 'Reminder already sent or deleted, skipping');
    return;
  }

  // 2. Verify parent event/task exists and is not deleted
  const itemInfo = await getItemInfo(userId, itemType, itemId);

  if (!itemInfo || itemInfo.isDeleted) {
    logger.info({ reminderId, itemType, itemId }, 'Parent item deleted, skipping reminder');
    // Mark as sent so it's not retried
    await db.update(reminders).set({ sentAt: new Date() }).where(eq(reminders.id, reminderId));
    return;
  }

  const referenceTime = itemInfo.time;

  // The item is still there but currently has no time to fire against — a task
  // whose due date was cleared. Leave the reminder unsent: marking it sent here
  // would retire it permanently, so restoring the due date could never bring it
  // back (resyncItemReminders only considers unsent reminders).
  if (!referenceTime) {
    logger.info(
      { reminderId, itemType, itemId },
      'Item has no due date, leaving reminder pending until one is set',
    );
    return;
  }

  const resolvedInfo: ResolvedItemInfo = { ...itemInfo, time: referenceTime };

  // 3. Send notification(s) in parallel when both channels are needed
  const notifications: Promise<void>[] = [];
  if (method === 'email' || method === 'both') {
    notifications.push(sendReminderEmail(userId, itemType, resolvedInfo, reminder.minutesBefore));
  }
  if (method === 'push' || method === 'both') {
    notifications.push(sendReminderPush(userId, itemType, resolvedInfo));
  }
  await Promise.all(notifications);

  // 4. Emit reminder:fired on SSE for in-app toast
  sseService.emit(userId, 'reminder:fired', {
    reminderId,
    itemType,
    itemId,
    title: resolvedInfo.title,
  });

  // 5. Mark reminder as sent
  await db.update(reminders).set({ sentAt: new Date() }).where(eq(reminders.id, reminderId));

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
