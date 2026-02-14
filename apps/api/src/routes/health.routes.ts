import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '../db';
import { redis } from '../lib/redis';

const health = new Hono();

health.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

health.get('/health/ready', async (c) => {
  let dbStatus = 'ok';
  let redisStatus = 'ok';

  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    dbStatus = 'error';
  }

  try {
    await redis.ping();
  } catch {
    redisStatus = 'error';
  }

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
