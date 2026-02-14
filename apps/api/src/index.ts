import { serve } from '@hono/node-server';

import { app } from './app';
import { logger } from './lib/logger';
import { connectRedis, disconnectRedis } from './lib/redis';

const port = Number(process.env.PORT) || 4000;

let server: ReturnType<typeof serve>;

async function start() {
  try {
    await connectRedis();
  } catch {
    logger.warn('Redis not available — rate limiting will be disabled');
  }

  server = serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, 'Calley API running');
  });
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received, closing gracefully');

  // Stop accepting new connections
  server?.close(() => {
    logger.info('HTTP server closed');
  });

  // Wait for in-flight requests (max 30s)
  const forceTimeout = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30_000);

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
