import { Worker } from 'bullmq';
import { format } from 'date-fns';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../db';
import { events, reminders, tasks, users } from '../db/schema';
import { reminderNotificationEmail } from '../emails/reminder-notification';
import { sendEmail } from '../lib/email';
import { logger } from '../lib/logger';
import { bullmqConnection, QUEUE_NAMES, registerWorker } from '../lib/queue';

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
  time: Date;
  isDeleted: boolean;
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
    if (!task || !task.dueAt) return null;
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
  itemInfo: ItemInfo,
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

// ─── Helper: Send push notification (stub for Phase 6.4) ──────────

async function sendReminderPush(userId: string, itemInfo: ItemInfo): Promise<void> {
  // TODO: Implement in Phase 6.4 (Web Push Notifications)
  // Will use the web-push library to send to all user's push subscriptions
  // from the user_push_subscriptions table.
  logger.info(
    { userId, title: itemInfo.title },
    'Push notification stub — will be implemented in Phase 6.4',
  );
}

// ─── Worker ────────────────────────────────────────────────────────

export function startReminderWorker(): Worker {
  const worker = new Worker<ReminderJobData>(
    QUEUE_NAMES.REMINDERS,
    async (job) => {
      const { reminderId, userId, itemType, itemId, method } = job.data;

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

      // 3. Send notification based on method
      if (method === 'email' || method === 'both') {
        await sendReminderEmail(userId, itemType, itemInfo, reminder.minutesBefore);
      }

      if (method === 'push' || method === 'both') {
        await sendReminderPush(userId, itemInfo);
      }

      // 4. TODO: Emit reminder:fired on SSE (Phase 6.3)
      // sseService.emit(userId, 'reminder:fired', {
      //   reminderId, itemType, itemId, title: itemInfo.title
      // });

      // 5. Mark reminder as sent
      await db.update(reminders).set({ sentAt: new Date() }).where(eq(reminders.id, reminderId));

      logger.info({ reminderId, method }, 'Reminder sent successfully');
    },
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
