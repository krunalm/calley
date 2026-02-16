import { serve } from '@hono/node-server';

import { app } from './app';
import { initializeJobProcessing } from './jobs';
import { logger } from './lib/logger';
import { closeQueues } from './lib/queue';
import { connectRedis, disconnectRedis } from './lib/redis';

const port = Number(process.env.PORT) || 4000;

let server: ReturnType<typeof serve>;

async function start() {
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

async function shutdown(signal: string) {
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

  clearTimeout(forceTimeout);
  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
