import { Worker } from 'bullmq';
import { and, getTableName, inArray, isNotNull, lt, or } from 'drizzle-orm';

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

import type { SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

// ─── Constants ─────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Rows removed per statement.
 *
 * A single unqualified `DELETE` over months of retention takes row locks on
 * everything it touches and holds them until it commits, which on a busy table
 * blocks writers for the duration. Chunking keeps each transaction short; the
 * loop simply runs until a pass comes back short.
 */
const DELETE_BATCH_SIZE = 5_000;

/** Guard against an unbounded loop if a delete silently stops making progress. */
const MAX_DELETE_BATCHES = 200;

// ─── Cleanup Task Functions ────────────────────────────────────────

/**
 * Delete every row matching `where`, in bounded batches.
 *
 * Only the primary keys of the current batch are materialised, so memory stays
 * flat no matter how much backlog has accumulated — the previous
 * `.returning({ id })` over the whole predicate pulled every deleted id into
 * the worker at once.
 */
async function deleteInBatches(
  table: PgTable,
  idColumn: PgColumn,
  where: SQL | undefined,
): Promise<number> {
  let total = 0;
  let exhausted = false;

  for (let batch = 0; batch < MAX_DELETE_BATCHES; batch++) {
    const doomed = await db
      .select({ id: idColumn })
      .from(table)
      .where(where)
      .limit(DELETE_BATCH_SIZE);

    if (doomed.length === 0) {
      exhausted = true;
      break;
    }

    const ids = doomed.map((row) => row.id);
    await db.delete(table).where(inArray(idColumn, ids));
    total += ids.length;

    if (doomed.length < DELETE_BATCH_SIZE) {
      exhausted = true;
      break;
    }
  }

  if (!exhausted) {
    // Hitting the ceiling is not an error — the next daily run picks up where
    // this one stopped — but it must be visible, or a table growing faster than
    // cleanup drains it looks exactly like a table being fully cleaned.
    logger.warn(
      { table: getTableName(table), deleted: total },
      'Cleanup hit its per-run batch ceiling; the remainder is left for the next run',
    );
  }

  return total;
}

/**
 * Delete sessions that have expired.
 */
async function cleanupExpiredSessions(): Promise<number> {
  return deleteInBatches(sessions, sessions.id, lt(sessions.expiresAt, new Date()));
}

/**
 * Delete password reset tokens that are used or expired.
 */
async function cleanupPasswordResetTokens(): Promise<number> {
  return deleteInBatches(
    passwordResetTokens,
    passwordResetTokens.id,
    or(isNotNull(passwordResetTokens.usedAt), lt(passwordResetTokens.expiresAt, new Date())),
  );
}

/**
 * Hard delete soft-deleted events older than 30 days.
 * Deletes event exceptions first to satisfy FK constraints.
 */
async function cleanupDeletedEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  // First delete related exception overrides
  const deletedExceptions = await deleteInBatches(
    eventExceptions,
    eventExceptions.id,
    and(isNotNull(eventExceptions.deletedAt), lt(eventExceptions.deletedAt, cutoff)),
  );

  // Then delete the events themselves
  const deletedEvents = await deleteInBatches(
    events,
    events.id,
    and(isNotNull(events.deletedAt), lt(events.deletedAt, cutoff)),
  );

  return deletedEvents + deletedExceptions;
}

/**
 * Hard delete soft-deleted tasks older than 30 days.
 */
async function cleanupDeletedTasks(): Promise<number> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  return deleteInBatches(
    tasks,
    tasks.id,
    and(isNotNull(tasks.deletedAt), lt(tasks.deletedAt, cutoff)),
  );
}

/**
 * Delete sent reminders older than 30 days.
 */
async function cleanupSentReminders(): Promise<number> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  return deleteInBatches(
    reminders,
    reminders.id,
    and(isNotNull(reminders.sentAt), lt(reminders.sentAt, cutoff)),
  );
}

/**
 * Delete audit logs older than 90 days.
 */
async function cleanupAuditLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);

  return deleteInBatches(auditLogs, auditLogs.id, lt(auditLogs.createdAt, cutoff));
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

const CLEANUP_SCHEDULER_ID = 'daily-cleanup';

/**
 * Register the cleanup job as a BullMQ job scheduler.
 * Runs daily at 3:00 AM UTC.
 *
 * BullMQ 6 dropped the `repeat` option on `Queue.add` — repeating work is
 * declared via `upsertJobScheduler`, which is idempotent across restarts.
 */
export async function scheduleCleanupJob(): Promise<void> {
  await cleanupQueue.upsertJobScheduler(
    CLEANUP_SCHEDULER_ID,
    { pattern: '0 3 * * *', tz: 'UTC' },
    { name: CLEANUP_SCHEDULER_ID },
  );

  await removeStaleCleanupSchedulers();

  logger.info('Scheduled daily cleanup job at 3:00 AM UTC');
}

/**
 * Drop any cleanup scheduler other than the current one.
 *
 * Repeatables registered by BullMQ 5 carry a generated key, so an upgraded
 * deployment would otherwise keep firing the old schedule alongside the new
 * one. Failures here are non-critical — the current schedule is already set.
 */
async function removeStaleCleanupSchedulers(): Promise<void> {
  try {
    const schedulers = await cleanupQueue.getJobSchedulers();

    for (const scheduler of schedulers) {
      if (scheduler.key === CLEANUP_SCHEDULER_ID) continue;

      await cleanupQueue.removeJobScheduler(scheduler.key);
      logger.info({ schedulerKey: scheduler.key }, 'Removed stale cleanup scheduler');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to prune stale cleanup schedulers');
  }
}
