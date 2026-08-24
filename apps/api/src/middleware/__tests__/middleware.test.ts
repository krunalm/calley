import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../lib/lucia', () => ({
  lucia: { sessionCookieName: 'calley_session' },
}));

import { z } from 'zod';

import { AppError } from '../../lib/errors';
import { bodyLimit } from '../body-limit.middleware';
import { doubleSubmitCsrf } from '../csrf.middleware';
import { errorHandler } from '../error-handler.middleware';
import { requestId } from '../request-id.middleware';
import { requestTimeout } from '../request-timeout.middleware';
import { securityHeaders } from '../security-headers.middleware';
import { validate } from '../validate.middleware';

import type { AppVariables } from '../../types/hono';

interface ApiErrorBody {
  error: { code: string; message: string; details?: { path: string[] }[] };
}

/** Read a Hono error response with the project's documented error shape. */
async function errorBody(res: Response): Promise<ApiErrorBody> {
  return (await res.json()) as ApiErrorBody;
}

function makeApp() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.onError(errorHandler);
  return app;
}

// ─── bodyLimit ──────────────────────────────────────────────────────

describe('bodyLimit', () => {
  function app(maxBytes: number) {
    const a = makeApp();
    a.use('*', bodyLimit(maxBytes));
    a.post('/', (c) => c.json({ ok: true }));
    return a;
  }

  it('passes a body inside the limit', async () => {
    const res = await app(1000).request('/', {
      method: 'POST',
      headers: { 'content-length': '500' },
      body: 'x',
    });
    expect(res.status).toBe(200);
  });

  it('rejects a body over the limit with 413', async () => {
    const res = await app(1000).request('/', {
      method: 'POST',
      headers: { 'content-length': '5000' },
      body: 'x',
    });
    expect(res.status).toBe(413);
    expect((await errorBody(res)).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  /**
   * A non-numeric Content-Length would make `parseInt` return NaN, and every
   * comparison against NaN is false — so the size check would pass and an
   * arbitrarily large body would be accepted.
   */
  it('rejects a malformed Content-Length rather than skipping the check', async () => {
    const res = await app(1000).request('/', {
      method: 'POST',
      headers: { 'content-length': 'not-a-number' },
      body: 'x',
    });
    expect(res.status).toBe(400);
  });

  it('allows a request that declares no length', async () => {
    const res = await app(1000).request('/', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

// ─── doubleSubmitCsrf ───────────────────────────────────────────────

describe('doubleSubmitCsrf', () => {
  function app() {
    const a = makeApp();
    a.use('*', doubleSubmitCsrf);
    a.get('/', (c) => c.json({ ok: true }));
    a.post('/', (c) => c.json({ ok: true }));
    return a;
  }

  it('exempts safe methods', async () => {
    expect((await app().request('/')).status).toBe(200);
  });

  it('allows a genuinely pre-session request', async () => {
    const res = await app().request('/', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('accepts a matching cookie and header', async () => {
    const res = await app().request('/', {
      method: 'POST',
      headers: { cookie: 'csrf_token=abc', 'x-csrf-token': 'abc' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a mismatched pair', async () => {
    const res = await app().request('/', {
      method: 'POST',
      headers: { cookie: 'csrf_token=abc', 'x-csrf-token': 'xyz' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects a header with no cookie', async () => {
    const res = await app().request('/', {
      method: 'POST',
      headers: { 'x-csrf-token': 'abc' },
    });
    expect(res.status).toBe(403);
  });

  /**
   * The pre-session exemption exists for requests that cannot yet have a token.
   * An authenticated caller is never in that position, so a session cookie must
   * force the check — otherwise dropping the CSRF header would opt straight out
   * of CSRF protection.
   */
  it('enforces the check whenever a session cookie is present', async () => {
    const res = await app().request('/', {
      method: 'POST',
      headers: { cookie: 'calley_session=sess-1' },
    });
    expect(res.status).toBe(403);
  });
});

// ─── securityHeaders ────────────────────────────────────────────────

describe('securityHeaders', () => {
  async function headersFor(env: string | undefined) {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = env as string;
    try {
      const a = new Hono();
      a.use('*', securityHeaders);
      a.get('/', (c) => c.json({ ok: true }));
      return (await a.request('/')).headers;
    } finally {
      process.env.NODE_ENV = previous;
    }
  }

  it('sets the baseline hardening headers', async () => {
    const headers = await headersFor('test');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('adds HSTS only in production', async () => {
    expect((await headersFor('test')).get('Strict-Transport-Security')).toBeNull();
    expect((await headersFor('production')).get('Strict-Transport-Security')).toContain('max-age=');
  });
});

// ─── requestId ──────────────────────────────────────────────────────

describe('requestId', () => {
  it('stamps a unique id on every response', async () => {
    const a = new Hono<{ Variables: AppVariables }>();
    a.use('*', requestId);
    a.get('/', (c) => c.json({ id: c.get('requestId') }));

    const first = await a.request('/');
    const second = await a.request('/');

    const firstId = first.headers.get('X-Request-ID');
    expect(firstId).toBeTruthy();
    expect(((await first.json()) as { id: string }).id).toBe(firstId);
    expect(second.headers.get('X-Request-ID')).not.toBe(firstId);
  });
});

// ─── requestTimeout ─────────────────────────────────────────────────

describe('requestTimeout', () => {
  it('lets a fast handler through', async () => {
    const a = makeApp();
    a.use('*', requestTimeout(1000));
    a.get('/', (c) => c.json({ ok: true }));

    expect((await a.request('/')).status).toBe(200);
  });

  it('aborts a handler that overruns the deadline', async () => {
    const a = makeApp();
    a.use('*', requestTimeout(10));
    a.get('/', async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return c.json({ ok: true });
    });

    const res = await a.request('/');
    expect(res.status).toBe(408);
    expect((await errorBody(res)).error.code).toBe('REQUEST_TIMEOUT');
  });

  it('propagates a handler error unchanged', async () => {
    const a = makeApp();
    a.use('*', requestTimeout(1000));
    a.get('/', () => {
      throw new AppError(404, 'NOT_FOUND', 'nope');
    });

    const res = await a.request('/');
    expect(res.status).toBe(404);
    expect((await errorBody(res)).error.code).toBe('NOT_FOUND');
  });
});

// ─── validate ───────────────────────────────────────────────────────

describe('validate', () => {
  const bodySchema = z.object({ title: z.string().min(1) });

  it('stores the parsed body on the context', async () => {
    const a = makeApp();
    a.post('/', validate('json', bodySchema), (c) => c.json(c.get('validatedBody')));

    const res = await a.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'hi', extra: 'dropped' }),
    });

    expect(await res.json()).toEqual({ title: 'hi' });
  });

  it('reports a schema failure as VALIDATION_ERROR with paths', async () => {
    const a = makeApp();
    a.post('/', validate('json', bodySchema), (c) => c.json({ ok: true }));

    const res = await a.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });

    expect(res.status).toBe(400);
    const body = await errorBody(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0].path).toEqual(['title']);
  });

  it('reports an unparseable body distinctly from a schema failure', async () => {
    const a = makeApp();
    a.post('/', validate('json', bodySchema), (c) => c.json({ ok: true }));

    const res = await a.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });

    expect(res.status).toBe(400);
    expect((await errorBody(res)).error.message).toBe('Invalid JSON');
  });

  it('validates query parameters', async () => {
    const a = makeApp();
    a.get('/', validate('query', z.object({ q: z.string().min(2) })), (c) =>
      c.json(c.get('validatedQuery')),
    );

    expect((await a.request('/?q=a')).status).toBe(400);
    expect(await (await a.request('/?q=abc')).json()).toEqual({ q: 'abc' });
  });

  it('validates path parameters', async () => {
    const a = makeApp();
    a.get('/:id', validate('param', z.object({ id: z.string().length(3) })), (c) =>
      c.json(c.get('validatedParam')),
    );

    expect((await a.request('/abcd')).status).toBe(400);
    expect(await (await a.request('/abc')).json()).toEqual({ id: 'abc' });
  });
});

// ─── errorHandler ───────────────────────────────────────────────────

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an AppError with its code, status and details', async () => {
    const a = makeApp();
    a.get('/', () => {
      throw new AppError(422, 'INVALID_RRULE', 'bad rule', [{ path: ['rrule'] }]);
    });

    const res = await a.request('/');
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: { code: 'INVALID_RRULE', message: 'bad rule', details: [{ path: ['rrule'] }] },
    });
  });

  it('renders a raw ZodError as a validation failure', async () => {
    const a = makeApp();
    a.get('/', () => {
      z.object({ n: z.number() }).parse({ n: 'x' });
      return new Response();
    });

    const res = await a.request('/');
    expect(res.status).toBe(400);
    expect((await errorBody(res)).error.code).toBe('VALIDATION_ERROR');
  });

  /**
   * An unexpected failure must not leak its message: stack traces and driver
   * errors routinely carry table names, queries and connection strings.
   */
  it('hides the detail of an unexpected error', async () => {
    const a = makeApp();
    a.get('/', () => {
      throw new Error('connection to postgres://user:secret@db failed');
    });

    const res = await a.request('/');
    expect(res.status).toBe(500);
    const body = await errorBody(res);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
