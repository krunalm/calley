import { redis } from '../lib/redis';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  keyPrefix: string;
  keyFn?: (c: Parameters<MiddlewareHandler>[0]) => string;
}

export function rateLimit(
  options: RateLimitOptions,
): MiddlewareHandler<{ Variables: AppVariables }> {
  const { limit, windowSeconds, keyPrefix, keyFn } = options;

  return async (c, next) => {
    if (process.env.RATE_LIMIT_ENABLED === 'false') {
      await next();
      return;
    }

    const identifier = keyFn
      ? keyFn(c)
      : c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
        c.req.header('x-real-ip') ||
        'unknown';

    const key = `rl:${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now, `${now}:${Math.random()}`);
    multi.zcard(key);
    multi.expire(key, windowSeconds);

    const results = await multi.exec();
    const count = results?.[2]?.[1] as number;

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

    if (count > limit) {
      const retryAfter = Math.ceil(windowSeconds);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Remaining', '0');

      return c.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
          },
        },
        429,
      );
    }

    await next();
  };
}
