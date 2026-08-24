import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '../db';
import { redis } from '../lib/redis';

const HEALTH_CHECK_TIMEOUT_MS = 1000;

/**
 * Race a probe against a deadline, always clearing the timer.
 *
 * Readiness is polled continuously by orchestrators, so an uncleared timer per
 * probe keeps the event loop busy for a second at a time forever and delays a
 * clean process exit by the same margin.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Health check timed out')), ms);
  });

  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

const health = new Hono();

health.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

health.get('/health/ready', async (c) => {
  const [dbResult, redisResult] = await Promise.allSettled([
    withTimeout(db.execute(sql`SELECT 1`), HEALTH_CHECK_TIMEOUT_MS),
    withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT_MS),
  ]);

  const dbStatus = dbResult.status === 'fulfilled' ? 'ok' : 'error';
  const redisStatus = redisResult.status === 'fulfilled' ? 'ok' : 'error';
  const allOk = dbStatus === 'ok' && redisStatus === 'ok';

  return c.json(
    {
      status: allOk ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    },
    allOk ? 200 : 503,
  );
});

export default health;
