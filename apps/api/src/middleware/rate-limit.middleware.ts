import { getClientIp } from '../lib/client-ip';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';

import type { AppVariables } from '../types/hono';
import type { Context, MiddlewareHandler } from 'hono';

interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  keyPrefix: string;
  keyFn?: (c: Parameters<MiddlewareHandler>[0]) => string;
}

/**
 * Bucket identifier for a request that carries no explicit `keyFn`.
 *
 * Falls back to the socket address rather than a shared constant: keying every
 * anonymous caller as `unknown` would put the whole deployment in one bucket,
 * so a single client could exhaust the limit for everybody. `unknown` remains
 * only for runtimes that expose neither a trusted proxy header nor a socket.
 */
function defaultIdentifier(c: Context): string {
  return getClientIp(c) ?? 'unknown';
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

    const identifier = keyFn ? keyFn(c) : defaultIdentifier(c);

    const key = `rl:${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    let count: number;

    try {
      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, `${now}:${Math.random()}`);
      multi.zcard(key);
      multi.expire(key, windowSeconds);

      const results = await multi.exec();
      const rawCount = results?.[2]?.[1];

      if (typeof rawCount !== 'number') {
        // Redis returned unexpected result — allow request through
        c.header('X-RateLimit-Limit', String(limit));
        c.header('X-RateLimit-Remaining', String(limit));
        await next();
        return;
      }

      count = rawCount;
    } catch (err) {
      // Redis unavailable — degrade gracefully, allow request through
      logger.warn({ err, keyPrefix }, 'Rate limit check failed, allowing request');
      c.header('X-RateLimit-Limit', String(limit));
      c.header('X-RateLimit-Remaining', String(limit));
      await next();
      return;
    }

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
