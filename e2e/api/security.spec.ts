import { API_BASE, CSRF_COOKIE, errorBody, makeCredentials, SESSION_COOKIE } from '../support/api';
import { ANCHOR, isoPlusHours } from '../support/dates';
import { expect, test } from '../support/fixtures';

/**
 * Cross-cutting security behaviour: CSRF, cookies, headers, CORS,
 * body limits and authentication boundaries (SPECS.md §4).
 */

test.describe('API — CSRF protection', () => {
  test('accepts a write when the header matches the cookie', async ({ api, category }) => {
    const res = await api.post('/events', {
      title: 'With CSRF',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    expect(res.status()).toBe(201);
  });

  test('rejects a POST with no CSRF header', async ({ api, category }) => {
    const res = await api.ctx.post(API_BASE + '/events', {
      headers: { 'content-type': 'application/json' },
      data: {
        title: 'No CSRF',
        startAt: ANCHOR,
        endAt: isoPlusHours(ANCHOR, 1),
        categoryId: category.id,
      },
    });

    expect(res.status()).toBe(403);
    expect((await errorBody(res)).code).toBe('FORBIDDEN');
  });

  test('rejects a POST whose CSRF header does not match the cookie', async ({ api, category }) => {
    const res = await api.ctx.post(API_BASE + '/events', {
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'wrong-token' },
      data: {
        title: 'Bad CSRF',
        startAt: ANCHOR,
        endAt: isoPlusHours(ANCHOR, 1),
        categoryId: category.id,
      },
    });

    expect(res.status()).toBe(403);
  });

  test('rejects a PATCH with no CSRF header', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Target',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const res = await api.ctx.patch(API_BASE + `/events/${event.id}`, {
      headers: { 'content-type': 'application/json' },
      data: { title: 'Hijacked' },
    });

    expect(res.status()).toBe(403);
  });

  test('rejects a DELETE with no CSRF header', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Target',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    const res = await api.ctx.delete(API_BASE + `/events/${event.id}`);
    expect(res.status()).toBe(403);
  });

  test('a rejected write leaves the data unchanged', async ({ api, category }) => {
    const event = await api.createEvent({
      title: 'Original',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    await api.ctx.patch(API_BASE + `/events/${event.id}`, {
      headers: { 'content-type': 'application/json' },
      data: { title: 'Hijacked' },
    });

    const after = (await (await api.get(`/events/${event.id}`)).json()) as { title: string };
    expect(after.title).toBe('Original');
  });

  test('GET requests do not require a CSRF header', async ({ api }) => {
    const res = await api.ctx.get(API_BASE + '/auth/me');
    expect(res.status()).toBe(200);
  });

  test('logout requires a CSRF header', async ({ api }) => {
    const res = await api.ctx.post(API_BASE + '/auth/logout', {
      headers: { 'content-type': 'application/json' },
      data: {},
    });

    expect(res.status()).toBe(403);
  });

  test('a pre-session signup works without any CSRF cookie', async ({ anonApi }) => {
    const res = await anonApi.ctx.post(API_BASE + '/auth/signup', {
      headers: { 'content-type': 'application/json' },
      data: makeCredentials(),
    });

    expect(res.status()).toBe(201);
  });
});

test.describe('API — cookies', () => {
  test('the session cookie is HttpOnly', async ({ api }) => {
    const cookies = await api.cookies();
    const session = cookies.find((c) => c.name === SESSION_COOKIE)!;

    expect(session.httpOnly).toBe(true);
  });

  test('the session cookie uses SameSite=Lax', async ({ api }) => {
    const cookies = await api.cookies();
    const session = cookies.find((c) => c.name === SESSION_COOKIE)!;

    expect(session.sameSite).toBe('Lax');
  });

  test('the CSRF cookie is readable by scripts (double-submit pattern)', async ({ api }) => {
    const cookies = await api.cookies();
    const csrf = cookies.find((c) => c.name === CSRF_COOKIE)!;

    expect(csrf.httpOnly).toBe(false);
  });

  test('the CSRF cookie uses SameSite=Strict', async ({ api }) => {
    const cookies = await api.cookies();
    const csrf = cookies.find((c) => c.name === CSRF_COOKIE)!;

    expect(csrf.sameSite).toBe('Strict');
  });

  test('both cookies are scoped to the root path', async ({ api }) => {
    const cookies = await api.cookies();

    expect(cookies.find((c) => c.name === SESSION_COOKIE)!.path).toBe('/');
    expect(cookies.find((c) => c.name === CSRF_COOKIE)!.path).toBe('/');
  });

  test('the CSRF token is long and random', async ({ api }) => {
    const token = await api.csrfToken();

    expect(token).toBeTruthy();
    expect(token!.length).toBeGreaterThanOrEqual(32);
  });

  test('two accounts get different CSRF tokens', async ({ api, otherApi }) => {
    expect(await api.csrfToken()).not.toBe(await otherApi.csrfToken());
  });
});

test.describe('API — security headers', () => {
  test('sets X-Content-Type-Options', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('sets X-Frame-Options to DENY', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });

  test('sets a Referrer-Policy', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('sets a restrictive Permissions-Policy', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    const policy = res.headers()['permissions-policy'];

    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
  });

  test('sets a Content-Security-Policy that blocks framing', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    const csp = res.headers()['content-security-policy'];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test('disables the legacy XSS auditor', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    expect(res.headers()['x-xss-protection']).toBe('0');
  });

  test('applies security headers to API routes too', async ({ api }) => {
    const res = await api.get('/auth/me');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('attaches a request id to responses', async ({ anonApi }) => {
    const res = await anonApi.get('/health');
    expect(res.headers()['x-request-id']).toBeTruthy();
  });
});

test.describe('API — CORS', () => {
  test('allows the configured origin with credentials', async ({ anonApi }) => {
    const res = await anonApi.ctx.get(API_BASE + '/health', {
      headers: { origin: 'http://localhost:5173' },
    });

    expect(res.headers()['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers()['access-control-allow-credentials']).toBe('true');
  });

  test('does not echo an unapproved origin', async ({ anonApi }) => {
    const res = await anonApi.ctx.get(API_BASE + '/health', {
      headers: { origin: 'https://evil.example.com' },
    });

    expect(res.headers()['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });

  test('answers preflight with the allowed methods', async ({ anonApi }) => {
    const res = await anonApi.ctx.fetch(API_BASE + '/events', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-csrf-token',
      },
    });

    const allowed = res.headers()['access-control-allow-methods'] ?? '';
    expect(allowed).toContain('POST');
    expect(allowed).toContain('PATCH');
    expect(allowed).toContain('DELETE');
  });

  test('advertises the CSRF header as allowed', async ({ anonApi }) => {
    const res = await anonApi.ctx.fetch(API_BASE + '/events', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-csrf-token',
      },
    });

    expect((res.headers()['access-control-allow-headers'] ?? '').toLowerCase()).toContain(
      'x-csrf-token',
    );
  });
});

test.describe('API — request limits and hardening', () => {
  test('rejects a body larger than the 1MB limit', async ({ api, category }) => {
    const res = await api.post('/events', {
      title: 'Huge',
      description: 'x'.repeat(1_200_000),
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    expect([400, 413]).toContain(res.status());
  });

  test('rejects malformed JSON', async ({ api }) => {
    const token = await api.csrfToken();
    const res = await api.ctx.post(API_BASE + '/events', {
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      data: '{ not valid json',
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('an error response never leaks a stack trace', async ({ api }) => {
    const res = await api.get('/events/not-a-cuid');
    const body = await res.text();

    expect(body).not.toContain('at ');
    expect(body).not.toContain('.ts:');
  });

  test('unknown fields in a payload do not become columns', async ({ api, category }) => {
    const res = await api.post('/events', {
      title: 'Extra fields',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
      userId: 'someone-else',
      isAdmin: true,
    });

    expect(res.status()).toBe(201);
    const created = (await res.json()) as { userId: string };
    expect(created.userId).toBe(api.user!.id);
  });

  test('a client cannot set another user as the owner', async ({ api, category, otherApi }) => {
    const created = await api.createEvent({
      title: 'Ownership',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
      userId: otherApi.user!.id,
    });

    expect(created.userId).toBe(api.user!.id);
    expect((await otherApi.get(`/events/${created.id}`)).status()).toBe(404);
  });

  test('a client cannot forge the record id', async ({ api, category }) => {
    const forged = 'a'.repeat(24);
    const created = await api.createEvent({
      id: forged,
      title: 'Forged id',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    expect(created.id).not.toBe(forged);
  });
});

test.describe('API — authentication boundaries', () => {
  const protectedRoutes: [string, string][] = [
    ['GET', '/auth/me'],
    ['GET', '/auth/sessions'],
    ['GET', '/categories'],
    ['GET', '/tasks'],
    ['GET', '/reminders'],
    ['GET', '/push-subscriptions'],
    ['GET', '/stream'],
  ];

  for (const [method, path] of protectedRoutes) {
    test(`${method} ${path} requires a session`, async ({ anonApi }) => {
      const res = await anonApi.get(path);
      expect(res.status()).toBe(401);
    });
  }

  test('a logged-out session cannot read data', async ({ api, category }) => {
    await api.createEvent({
      title: 'Before logout',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: category.id,
    });

    await api.post('/auth/logout');

    expect((await api.get('/categories')).status()).toBe(401);
  });

  test('a revoked session cannot read data', async ({ api, credentials }) => {
    const { newApiSession } = await import('../support/api');
    const second = await newApiSession();
    await second.login(credentials);

    await api.delete('/auth/sessions');

    expect((await second.get('/categories')).status()).toBe(401);
    await second.dispose();
  });
});
