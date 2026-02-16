import { Queue } from 'bullmq';

import { logger } from './logger';

import type { Worker } from 'bullmq';

// ─── Constants ─────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  REMINDERS: 'reminders',
  CLEANUP: 'cleanup',
} as const;

// ─── Connection ────────────────────────────────────────────────────

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Parse a Redis URL into a BullMQ-compatible connection object.
 * BullMQ requires { host, port, password } — it does not accept URL strings.
 */
function parseRedisConnection(): { host: string; port: number; password?: string; db?: number } {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
  };
}

export const bullmqConnection = parseRedisConnection();

// ─── Queues ────────────────────────────────────────────────────────

export const reminderQueue = new Queue(QUEUE_NAMES.REMINDERS, {
  connection: bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60_000, // 1 min → ~5 min → ~25 min
    },
  },
});

export const cleanupQueue = new Queue(QUEUE_NAMES.CLEANUP, {
  connection: bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

// ─── Worker Registry (for graceful shutdown) ───────────────────────

const workers: Worker[] = [];

export function registerWorker(worker: Worker): void {
  workers.push(worker);
}

// ─── Lifecycle ─────────────────────────────────────────────────────

export async function closeQueues(): Promise<void> {
  logger.info('Closing BullMQ workers and queues...');

  // Close workers first (stop processing)
  await Promise.all(workers.map((w) => w.close()));

  // Then close queues
  await Promise.all([reminderQueue.close(), cleanupQueue.close()]);

  logger.info('BullMQ shutdown complete');
}
