import Redis from 'ioredis';

import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
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
