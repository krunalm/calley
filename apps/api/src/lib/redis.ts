import Redis from 'ioredis';

import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  /**
   * Linear ramp to a 5s ceiling, plus jitter.
   *
   * The jitter matters once more than one API instance is running: without it
   * every instance that lost the same Redis reconnects on an identical
   * schedule and they hammer it back in lockstep. ioredis 6 added jitter to
   * its own default strategy for this reason; overriding the strategy opts out
   * of that, so it is reproduced here rather than lost.
   */
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay + Math.floor(Math.random() * 200);
  },
  lazyConnect: true,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis');
    throw err;
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
