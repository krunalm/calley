import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const multi = {
  zremrangebyscore: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

vi.mock('../../lib/redis', () => ({
  redis: { multi: vi.fn(() => multi) },
}));

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { redis } from '../../lib/redis';
import { rateLimit } from '../rate-limit.middleware';

import type { AppVariables } from '../../types/hono';

/** Make the pipeline report `count` requests inside the current window. */
function windowContains(count: number) {
  multi.exec.mockResolvedValue([
    [null, 0],
    [null, 1],
    [null, count],
    [null, 1],
  ]);
}

function keysUsed(): string[] {
  return multi.zremrangebyscore.mock.calls.map((call) => call[0] as string);
}

/** Read a Hono error response with the project's documented error shape. */
async function errorBody(res: Response): Promise<{ error: { code: string; message: string } }> {
  return (await res.json()) as { error: { code: string; message: string } };
}

function makeApp(options: Parameters<typeof rateLimit>[0]) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use('*', rateLimit(options));
  app.get('/', (c) => c.json({ ok: true }));
  return app;
}

const BASE = { limit: 2, windowSeconds: 60, keyPrefix: 'test' };

const socketBindings = (address: string) => ({
  incoming: { socket: { remoteAddress: address, remoteFamily: 'IPv4' } },
});

describe('rateLimit', () => {
  const previousEnabled = process.env.RATE_LIMIT_ENABLED;
  const previousProxies = process.env.TRUSTED_PROXIES;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.TRUSTED_PROXIES;
    windowContains(1);
  });

  afterEach(() => {
    if (previousEnabled === undefined) delete process.env.RATE_LIMIT_ENABLED;
    else process.env.RATE_LIMIT_ENABLED = previousEnabled;
    if (previousProxies === undefined) delete process.env.TRUSTED_PROXIES;
    else process.env.TRUSTED_PROXIES = previousProxies;
  });

  it('allows a request inside the limit and reports what is left', async () => {
    const res = await makeApp(BASE).request('/', {}, socketBindings('198.51.100.1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('2');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('1');
  });

  it('rejects with 429 and Retry-After once the limit is exceeded', async () => {
    windowContains(3);

    const res = await makeApp(BASE).request('/', {}, socketBindings('198.51.100.1'));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect((await errorBody(res)).error.code).toBe('RATE_LIMITED');
  });

  /**
   * Regression: the anonymous identifier used to be the constant 'unknown'
   * whenever TRUSTED_PROXIES was unset — which is the default. Every caller
   * therefore shared one bucket, so a single busy client could exhaust the
   * limit for the entire deployment.
   */
  it('gives each client its own bucket without a configured proxy', async () => {
    const app = makeApp(BASE);

    await app.request('/', {}, socketBindings('198.51.100.1'));
    await app.request('/', {}, socketBindings('198.51.100.2'));

    const [first, second] = keysUsed();
    expect(first).not.toBe(second);
    expect(first).toContain('198.51.100.1');
    expect(second).toContain('198.51.100.2');
  });

  it('ignores a forged forwarded header when no proxy is configured', async () => {
    const app = makeApp(BASE);

    await app.request(
      '/',
      { headers: { 'x-forwarded-for': '203.0.113.1' } },
      socketBindings('198.51.100.1'),
    );
    await app.request(
      '/',
      { headers: { 'x-forwarded-for': '203.0.113.2' } },
      socketBindings('198.51.100.1'),
    );

    // Rotating the header must not move the caller between buckets.
    const [first, second] = keysUsed();
    expect(first).toBe(second);
    expect(first).toContain('198.51.100.1');
  });

  it('honours the forwarded header once a proxy is configured', async () => {
    process.env.TRUSTED_PROXIES = '*';

    await makeApp(BASE).request(
      '/',
      { headers: { 'x-forwarded-for': '203.0.113.1' } },
      socketBindings('10.0.0.1'),
    );

    expect(keysUsed()[0]).toContain('203.0.113.1');
  });

  it('uses an explicit key function when one is supplied', async () => {
    const app = new Hono<{ Variables: AppVariables }>();
    app.use('*', async (c, next) => {
      c.set('userId', 'user-42');
      await next();
    });
    app.use('*', rateLimit({ ...BASE, keyFn: (c) => c.get('userId') ?? 'anon' }));
    app.get('/', (c) => c.json({ ok: true }));

    await app.request('/', {}, socketBindings('198.51.100.1'));

    expect(keysUsed()[0]).toBe('rl:test:user-42');
  });

  it('is a no-op when rate limiting is switched off', async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';

    const res = await makeApp(BASE).request('/', {}, socketBindings('198.51.100.1'));

    expect(res.status).toBe(200);
    expect(redis.multi).not.toHaveBeenCalled();
  });

  /**
   * Redis backs the counter but is not on the critical path for correctness of
   * the API itself — failing closed would turn a cache outage into a total
   * outage.
   */
  it('lets requests through when Redis is unreachable', async () => {
    multi.exec.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await makeApp(BASE).request('/', {}, socketBindings('198.51.100.1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');
  });

  it('lets requests through when Redis returns an unexpected shape', async () => {
    multi.exec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 'not-a-number'],
      [null, 1],
    ]);

    const res = await makeApp(BASE).request('/', {}, socketBindings('198.51.100.1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');
  });
});
