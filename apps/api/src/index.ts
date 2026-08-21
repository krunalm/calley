import { serve } from '@hono/node-server';

import { app } from './app';
import { closeDb } from './db';
import { initializeJobProcessing } from './jobs';
import { validateEnv } from './lib/env';
import { logger } from './lib/logger';
import { closeQueues } from './lib/queue';
import { connectRedis, disconnectRedis } from './lib/redis';
import { sseService } from './services/sse.service';

const port = Number(process.env.PORT) || 4000;

let server: ReturnType<typeof serve>;

async function start() {
  // Validate environment variables before starting
  if (!validateEnv()) {
    process.exit(1);
  }

  try {
    await connectRedis();
  } catch {
    logger.warn('Redis not available — rate limiting and reminders will be disabled');
  }

  // Initialize BullMQ workers and re-enqueue missed reminders
  try {
    await initializeJobProcessing();
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize job processing — reminders will be disabled');
  }

  server = serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, 'Calley API running');
  });
}

let shuttingDown = false;

async function shutdown(signal: string) {
  // Orchestrators routinely send SIGTERM and then SIGINT, and a second pass
  // would close an already-closing server and race the forced-exit timer.
  if (shuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, 'Shutdown signal received, closing gracefully');

  // Wait for in-flight requests (max 30s)
  const forceTimeout = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30_000);

  // Stop accepting new connections and wait for in-flight requests
  try {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    logger.info('HTTP server closed');
  } catch (err) {
    logger.error({ err }, 'Error closing HTTP server');
  }

  // Close all SSE connections
  sseService.closeAll();

  // Close BullMQ workers and queues (before Redis disconnect)
  try {
    await closeQueues();
    logger.info('BullMQ shut down');
  } catch (err) {
    logger.error({ err }, 'Error shutting down BullMQ');
  }

  try {
    await disconnectRedis();
    logger.info('Redis disconnected');
  } catch (err) {
    logger.error({ err }, 'Error disconnecting Redis');
  }

  // Postgres last: the shutdown steps above may still write (BullMQ draining a
  // job, a final audit entry), so the pool has to outlive them.
  try {
    await closeDb();
    logger.info('Database pool drained');
  } catch (err) {
    logger.error({ err }, 'Error draining database pool');
  }

  clearTimeout(forceTimeout);
  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Node terminates on an unhandled rejection by default and prints only the
// bare reason. Logging through pino first keeps the failure in the same
// structured stream as everything else, so it is actually discoverable in
// production.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection — shutting down');
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  void shutdown('uncaughtException');
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start Calley API');
  process.exit(1);
});
