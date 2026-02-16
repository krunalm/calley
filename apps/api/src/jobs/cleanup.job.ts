import { Worker } from 'bullmq';
import { and, isNotNull, lt, or } from 'drizzle-orm';

import { db } from '../db';
import {
  auditLogs,
  eventExceptions,
  events,
  passwordResetTokens,
  reminders,
  sessions,
  tasks,
} from '../db/schema';
import { logger } from '../lib/logger';
import { bullmqConnection, cleanupQueue, QUEUE_NAMES, registerWorker } from '../lib/queue';

// ─── Cleanup Task Functions ────────────────────────────────────────

/**
 * Delete sessions that have expired.
 */
async function cleanupExpiredSessions(): Promise<number> {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return result.length;
}

/**
 * Delete password reset tokens that are used or expired.
 */
async function cleanupPasswordResetTokens(): Promise<number> {
  const result = await db
    .delete(passwordResetTokens)
    .where(or(isNotNull(passwordResetTokens.usedAt), lt(passwordResetTokens.expiresAt, new Date())))
    .returning({ id: passwordResetTokens.id });
  return result.length;
}

/**
 * Hard delete soft-deleted events older than 30 days.
 * Deletes event exceptions first to satisfy FK constraints.
 */
async function cleanupDeletedEvents(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // First delete related exception overrides
  const deletedExceptions = await db
    .delete(eventExceptions)
    .where(and(isNotNull(eventExceptions.deletedAt), lt(eventExceptions.deletedAt, thirtyDaysAgo)))
    .returning({ id: eventExceptions.id });

  // Then delete the events themselves
  const deletedEvents = await db
    .delete(events)
    .where(and(isNotNull(events.deletedAt), lt(events.deletedAt, thirtyDaysAgo)))
    .returning({ id: events.id });

  return deletedEvents.length + deletedExceptions.length;
}

/**
 * Hard delete soft-deleted tasks older than 30 days.
 */
async function cleanupDeletedTasks(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(tasks)
    .where(and(isNotNull(tasks.deletedAt), lt(tasks.deletedAt, thirtyDaysAgo)))
    .returning({ id: tasks.id });
  return result.length;
}

/**
 * Delete sent reminders older than 30 days.
 */
async function cleanupSentReminders(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(reminders)
    .where(and(isNotNull(reminders.sentAt), lt(reminders.sentAt, thirtyDaysAgo)))
    .returning({ id: reminders.id });
  return result.length;
}

/**
 * Delete audit logs older than 90 days.
 */
async function cleanupAuditLogs(): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, ninetyDaysAgo))
    .returning({ id: auditLogs.id });
  return result.length;
}

// ─── Worker ────────────────────────────────────────────────────────

export function startCleanupWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.CLEANUP,
    async (job) => {
      logger.info({ jobId: job.id }, 'Starting cleanup job');

      const results = {
        sessions: 0,
        resetTokens: 0,
        events: 0,
        tasks: 0,
        reminders: 0,
        auditLogs: 0,
      };

      try {
        results.sessions = await cleanupExpiredSessions();
      } catch (err) {
        logger.error({ err }, 'Failed to cleanup expired sessions');
      }

      try {
        results.resetTokens = await cleanupPasswordResetTokens();
      } catch (err) {
        logger.error({ err }, 'Failed to cleanup password reset tokens');
      }

      try {
        results.events = await cleanupDeletedEvents();
      } catch (err) {
        logger.error({ err }, 'Failed to cleanup deleted events');
      }

      try {
        results.tasks = await cleanupDeletedTasks();
      } catch (err) {
        logger.error({ err }, 'Failed to cleanup deleted tasks');
      }

      try {
        results.reminders = await cleanupSentReminders();
      } catch (err) {
        logger.error({ err }, 'Failed to cleanup sent reminders');
      }

      try {
        results.auditLogs = await cleanupAuditLogs();
      } catch (err) {
        logger.error({ err }, 'Failed to cleanup audit logs');
      }

      logger.info({ results }, 'Cleanup job completed');
      return results;
    },
    {
      connection: bullmqConnection,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Cleanup job failed');
  });

  registerWorker(worker);
  return worker;
}

// ─── Schedule ──────────────────────────────────────────────────────

/**
 * Register the cleanup job as a BullMQ repeatable cron job.
 * Runs daily at 3:00 AM UTC.
 */
export async function scheduleCleanupJob(): Promise<void> {
  await cleanupQueue.add(
    'daily-cleanup',
    {},
    {
      repeat: {
        pattern: '0 3 * * *',
      },
    },
  );

  logger.info('Scheduled daily cleanup job at 3:00 AM UTC');
}
