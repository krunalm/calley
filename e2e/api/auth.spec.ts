import {
  API_BASE,
  CSRF_COOKIE,
  errorBody,
  makeCredentials,
  newApiSession,
  SESSION_COOKIE,
} from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * Authentication contract: signup, login, session lifecycle, profile,
 * password management and account deletion.
 */

test.describe('API — signup', () => {
  test('creates an account and returns the user', async ({ anonApi }) => {
    const creds = makeCredentials();
    const res = await anonApi.post('/auth/signup', creds);

    expect(res.status()).toBe(201);
    const user = (await res.json()) as Record<string, unknown>;
    expect(user.email).toBe(creds.email.toLowerCase());
    expect(user.name).toBe(creds.name);
    expect(typeof user.id).toBe('string');
  });

  test('never leaks the password hash', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/signup', makeCredentials());
    const user = (await res.json()) as Record<string, unknown>;

    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password');
  });

  test('sets both the session and CSRF cookies', async ({ anonApi }) => {
    await anonApi.post('/auth/signup', makeCredentials());

    expect(await anonApi.sessionCookie()).toBeTruthy();
    expect(await anonApi.csrfToken()).toBeTruthy();
  });

  test('normalises the email to lowercase', async ({ anonApi }) => {
    const creds = makeCredentials();
    creds.email = creds.email.toUpperCase();

    const res = await anonApi.post('/auth/signup', creds);
    const user = (await res.json()) as { email: string };

    expect(user.email).toBe(creds.email.toLowerCase());
  });

  test('trims whitespace from the name', async ({ anonApi }) => {
    const creds = makeCredentials();
    const res = await anonApi.post('/auth/signup', { ...creds, name: '  Spaced Out  ' });

    const user = (await res.json()) as { name: string };
    expect(user.name).toBe('Spaced Out');
  });

  test('rejects a duplicate email with 409', async ({ anonApi }) => {
    const creds = makeCredentials();
    await anonApi.post('/auth/signup', creds);

    const second = await newApiSession();
    const res = await second.post('/auth/signup', creds);
    expect(res.status()).toBe(409);
    expect((await errorBody(res)).code).toBe('CONFLICT');
    await second.dispose();
  });

  test('rejects a duplicate email that differs only in case', async ({ anonApi }) => {
    const creds = makeCredentials();
    await anonApi.post('/auth/signup', creds);

    const second = await newApiSession();
    const res = await second.post('/auth/signup', {
      ...creds,
      email: creds.email.toUpperCase(),
    });
    expect(res.status()).toBe(409);
    await second.dispose();
  });

  test('rejects an invalid email address', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/signup', {
      ...makeCredentials(),
      email: 'not-an-email',
    });

    expect(res.status()).toBe(400);
    expect((await errorBody(res)).code).toBe('VALIDATION_ERROR');
  });

  test('rejects a password shorter than 8 characters', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/signup', { ...makeCredentials(), password: 'short7c' });

    expect(res.status()).toBe(400);
    expect((await errorBody(res)).code).toBe('VALIDATION_ERROR');
  });

  test('rejects an empty name', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/signup', { ...makeCredentials(), name: '   ' });

    expect(res.status()).toBe(400);
  });

  test('rejects a name longer than 100 characters', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/signup', {
      ...makeCredentials(),
      name: 'n'.repeat(101),
    });

    expect(res.status()).toBe(400);
  });

  test('rejects a password longer than 128 characters', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/signup', {
      ...makeCredentials(),
      password: 'p'.repeat(129),
    });

    expect(res.status()).toBe(400);
  });

  test('rejects a request with no body fields at all', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/signup', {});
    expect(res.status()).toBe(400);
  });

  test('provisions exactly one default category for the new user', async ({ api }) => {
    const categories = await api.categories();

    expect(categories).toHaveLength(1);
    expect(categories[0].isDefault).toBe(true);
    expect(categories[0].name).toBe('Personal');
  });
});

test.describe('API — login', () => {
  test('authenticates with valid credentials', async ({ api, credentials }) => {
    const fresh = await newApiSession();
    const res = await fresh.post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });

    expect(res.status()).toBe(200);
    const user = (await res.json()) as { id: string };
    expect(user.id).toBe(api.user!.id);
    await fresh.dispose();
  });

  test('is case-insensitive on the email', async ({ credentials, api }) => {
    expect(api.user).toBeTruthy();
    const fresh = await newApiSession();
    const res = await fresh.post('/auth/login', {
      email: credentials.email.toUpperCase(),
      password: credentials.password,
    });

    expect(res.status()).toBe(200);
    await fresh.dispose();
  });

  test('issues a new session cookie on every login (session rotation)', async ({
    api,
    credentials,
  }) => {
    const first = await api.sessionCookie();

    const fresh = await newApiSession();
    await fresh.login(credentials);
    const second = await fresh.sessionCookie();

    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    await fresh.dispose();
  });

  test('rejects a wrong password with a generic 401', async ({ credentials, api }) => {
    expect(api.user).toBeTruthy();
    const fresh = await newApiSession();
    const res = await fresh.post('/auth/login', {
      email: credentials.email,
      password: 'DefinitelyWrong123!',
    });

    expect(res.status()).toBe(401);
    const err = await errorBody(res);
    expect(err.message).toMatch(/invalid email or password/i);
    await fresh.dispose();
  });

  test('returns the same generic message for an unknown email (no enumeration)', async ({
    anonApi,
    credentials,
    api,
  }) => {
    expect(api.user).toBeTruthy();
    const unknown = await anonApi.post('/auth/login', {
      email: 'nobody-' + credentials.email,
      password: 'DefinitelyWrong123!',
    });
    const wrongPassword = await anonApi.post('/auth/login', {
      email: credentials.email,
      password: 'DefinitelyWrong123!',
    });

    expect(unknown.status()).toBe(wrongPassword.status());
    expect((await errorBody(unknown)).message).toBe((await errorBody(wrongPassword)).message);
  });

  test('rejects a malformed email', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/login', { email: 'bad', password: 'whatever12' });
    expect(res.status()).toBe(400);
  });

  test('rejects an empty password', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/login', { email: 'a@example.com', password: '' });
    expect(res.status()).toBe(400);
  });

  test('locks the account after 5 failed attempts', async ({ credentials, api }) => {
    expect(api.user).toBeTruthy();
    const attacker = await newApiSession();

    for (let i = 0; i < 5; i += 1) {
      const res = await attacker.post('/auth/login', {
        email: credentials.email,
        password: `Wrong-${i}-Password!`,
      });
      expect(res.status()).toBe(401);
    }

    // Correct password now also fails — the account is locked.
    const locked = await attacker.post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });
    expect(locked.status()).toBe(401);
    await attacker.dispose();
  });

  test('a failed login does not establish a session', async ({ anonApi, credentials, api }) => {
    expect(api.user).toBeTruthy();
    await anonApi.post('/auth/login', { email: credentials.email, password: 'Nope12345!' });

    const me = await anonApi.get('/auth/me');
    expect(me.status()).toBe(401);
  });
});

test.describe('API — session lifecycle', () => {
  test('GET /auth/me returns the current user', async ({ api }) => {
    const me = await api.me();
    expect(me.id).toBe(api.user!.id);
    expect(me.email).toBe(api.credentials!.email.toLowerCase());
  });

  test('GET /auth/me exposes profile preferences', async ({ api }) => {
    const me = await api.me();

    expect(me.timezone).toBe('UTC');
    expect(me.weekStart).toBe(0);
    expect(me.timeFormat).toBe('12h');
  });

  test('logout returns 204 and invalidates the session', async ({ api }) => {
    const res = await api.post('/auth/logout');
    expect(res.status()).toBe(204);

    const me = await api.get('/auth/me');
    expect(me.status()).toBe(401);
  });

  test('logout clears the CSRF cookie', async ({ api }) => {
    await api.post('/auth/logout');
    expect(await api.csrfToken()).toBeFalsy();
  });

  test('logout requires authentication', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/logout');
    expect(res.status()).toBe(401);
  });

  test('a tampered session cookie is rejected', async ({ api }) => {
    const cookies = await api.cookies();
    const session = cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect(session.value).toBeTruthy();

    // Same length and shape, one character different — so a rejection can only
    // come from the token failing to validate, not from a malformed cookie.
    const last = session.value.slice(-1);
    const tampered = session.value.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    expect(tampered).not.toBe(session.value);

    const forged = await newApiSession();
    const res = await forged.ctx.get(API_BASE + '/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${tampered}` },
    });

    expect(res.status()).toBe(401);
    await forged.dispose();

    // The genuine cookie still works, so the 401 was about the tampering.
    expect((await api.get('/auth/me')).status()).toBe(200);
  });

  test('lists the current session with isCurrent set', async ({ api }) => {
    const res = await api.get('/auth/sessions');
    expect(res.status()).toBe(200);

    const sessions = (await res.json()) as { id: string; isCurrent: boolean }[];
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.filter((s) => s.isCurrent)).toHaveLength(1);
  });

  test('a second login shows up as an additional session', async ({ api, credentials }) => {
    const second = await newApiSession();
    await second.login(credentials);

    const sessions = (await (await api.get('/auth/sessions')).json()) as unknown[];
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    await second.dispose();
  });

  test('revoking all other sessions keeps the current one alive', async ({ api, credentials }) => {
    const second = await newApiSession();
    await second.login(credentials);

    const res = await api.delete('/auth/sessions');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { revokedCount: number };
    expect(body.revokedCount).toBeGreaterThanOrEqual(1);

    // Current session still works, the revoked one does not.
    expect((await api.get('/auth/me')).status()).toBe(200);
    expect((await second.get('/auth/me')).status()).toBe(401);
    await second.dispose();
  });

  test('revoking a specific session invalidates only that session', async ({
    api,
    credentials,
  }) => {
    const second = await newApiSession();
    await second.login(credentials);

    const sessions = (await (await api.get('/auth/sessions')).json()) as {
      id: string;
      isCurrent: boolean;
    }[];
    const other = sessions.find((s) => !s.isCurrent)!;

    const res = await api.delete(`/auth/sessions/${other.id}`);
    expect(res.status()).toBe(204);
    expect((await second.get('/auth/me')).status()).toBe(401);
    expect((await api.get('/auth/me')).status()).toBe(200);
    await second.dispose();
  });

  test('listing sessions requires authentication', async ({ anonApi }) => {
    expect((await anonApi.get('/auth/sessions')).status()).toBe(401);
  });
});

test.describe('API — profile', () => {
  test('updates the display name', async ({ api }) => {
    const res = await api.patch('/auth/me', { name: 'Renamed Person' });
    expect(res.status()).toBe(200);

    expect((await api.me()).name).toBe('Renamed Person');
  });

  test('updates the timezone', async ({ api }) => {
    const res = await api.patch('/auth/me', { timezone: 'America/New_York' });
    expect(res.status()).toBe(200);

    expect((await api.me()).timezone).toBe('America/New_York');
  });

  test('rejects an invalid IANA timezone', async ({ api }) => {
    const res = await api.patch('/auth/me', { timezone: 'Mars/Olympus_Mons' });
    expect(res.status()).toBe(400);
  });

  test('updates the week start day', async ({ api }) => {
    await api.patch('/auth/me', { weekStart: 1 });
    expect((await api.me()).weekStart).toBe(1);
  });

  test('rejects a week start other than 0 or 1', async ({ api }) => {
    const res = await api.patch('/auth/me', { weekStart: 3 });
    expect(res.status()).toBe(400);
  });

  test('updates the time format', async ({ api }) => {
    await api.patch('/auth/me', { timeFormat: '24h' });
    expect((await api.me()).timeFormat).toBe('24h');
  });

  test('rejects an unknown time format', async ({ api }) => {
    const res = await api.patch('/auth/me', { timeFormat: '36h' });
    expect(res.status()).toBe(400);
  });

  test('rejects an empty name', async ({ api }) => {
    const res = await api.patch('/auth/me', { name: '  ' });
    expect(res.status()).toBe(400);
  });

  test('ignores an attempt to change the email through the profile endpoint', async ({ api }) => {
    const before = await api.me();
    await api.patch('/auth/me', { email: 'hijacked@example.com' });

    expect((await api.me()).email).toBe(before.email);
  });

  test('profile updates require authentication', async ({ anonApi }) => {
    const res = await anonApi.patch('/auth/me', { name: 'Nope' });
    expect(res.status()).toBe(401);
  });
});

test.describe('API — password management', () => {
  test('changes the password with the correct current password', async ({ api, credentials }) => {
    const res = await api.patch('/auth/me/password', {
      currentPassword: credentials.password,
      newPassword: 'BrandNewP@ss456!',
    });

    expect(res.status()).toBe(200);

    const fresh = await newApiSession();
    const login = await fresh.post('/auth/login', {
      email: credentials.email,
      password: 'BrandNewP@ss456!',
    });
    expect(login.status()).toBe(200);
    await fresh.dispose();
  });

  test('rejects a change when the current password is wrong', async ({ api }) => {
    const res = await api.patch('/auth/me/password', {
      currentPassword: 'NotMyPassword1!',
      newPassword: 'BrandNewP@ss456!',
    });

    expect(res.status()).toBe(401);
  });

  test('a wrong current password is reported as INVALID_CREDENTIALS', async ({ api }) => {
    const res = await api.patch('/auth/me/password', {
      currentPassword: 'NotMyPassword1!',
      newPassword: 'BrandNewP@ss456!',
    });

    // Distinct from UNAUTHORIZED so the client can tell a rejected password
    // apart from a dead session — both are a 401 on this endpoint.
    expect((await errorBody(res)).code).toBe('INVALID_CREDENTIALS');
  });

  test('an expired session on the same endpoint is reported as UNAUTHORIZED', async ({
    api,
    credentials,
  }) => {
    await api.post('/auth/logout');

    const res = await api.patch('/auth/me/password', {
      currentPassword: credentials.password,
      newPassword: 'BrandNewP@ss456!',
    });

    expect(res.status()).toBe(401);
    expect((await errorBody(res)).code).toBe('UNAUTHORIZED');
  });

  test('rejects a new password shorter than 8 characters', async ({ api, credentials }) => {
    const res = await api.patch('/auth/me/password', {
      currentPassword: credentials.password,
      newPassword: 'tiny7ch',
    });

    expect(res.status()).toBe(400);
  });

  test('the old password stops working after a change', async ({ api, credentials }) => {
    await api.patch('/auth/me/password', {
      currentPassword: credentials.password,
      newPassword: 'BrandNewP@ss456!',
    });

    const fresh = await newApiSession();
    const login = await fresh.post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });
    expect(login.status()).toBe(401);
    await fresh.dispose();
  });

  test('forgot-password returns a generic message for a known email', async ({
    anonApi,
    credentials,
    api,
  }) => {
    expect(api.user).toBeTruthy();
    const res = await anonApi.post('/auth/forgot-password', { email: credentials.email });

    expect(res.status()).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/if that email is registered/i);
  });

  test('forgot-password returns the identical message for an unknown email', async ({
    anonApi,
    credentials,
    api,
  }) => {
    expect(api.user).toBeTruthy();
    const known = await anonApi.post('/auth/forgot-password', { email: credentials.email });
    const unknown = await anonApi.post('/auth/forgot-password', {
      email: 'ghost-' + credentials.email,
    });

    expect(known.status()).toBe(unknown.status());
    expect(await known.json()).toEqual(await unknown.json());
  });

  test('forgot-password rejects a malformed email', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/forgot-password', { email: 'nope' });
    expect(res.status()).toBe(400);
  });

  test('reset-password rejects an unknown token', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/reset-password', {
      token: 'a'.repeat(64),
      password: 'BrandNewP@ss456!',
    });

    expect([400, 401, 404, 422]).toContain(res.status());
  });

  test('reset-password rejects a short new password', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/reset-password', {
      token: 'a'.repeat(64),
      password: 'short',
    });

    expect(res.status()).toBe(400);
  });

  test('reset-password rejects an empty token', async ({ anonApi }) => {
    const res = await anonApi.post('/auth/reset-password', {
      token: '',
      password: 'BrandNewP@ss456!',
    });

    expect(res.status()).toBe(400);
  });
});

test.describe('API — account deletion', () => {
  test('deletes the account when the password is correct', async ({ api, credentials }) => {
    const res = await api.delete('/auth/me', { password: credentials.password });
    expect(res.status()).toBe(204);

    const fresh = await newApiSession();
    const login = await fresh.post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });
    expect(login.status()).toBe(401);
    await fresh.dispose();
  });

  test('rejects deletion with a wrong password', async ({ api }) => {
    const res = await api.delete('/auth/me', { password: 'NotMyPassword1!' });
    expect(res.status()).toBe(401);

    expect((await api.get('/auth/me')).status()).toBe(200);
  });

  test('rejects deletion without a password', async ({ api }) => {
    const res = await api.delete('/auth/me', {});
    expect(res.status()).toBe(400);
  });

  test('clears the session cookies on deletion', async ({ api, credentials }) => {
    await api.delete('/auth/me', { password: credentials.password });

    const cookies = await api.cookies();
    const session = cookies.find((c) => c.name === SESSION_COOKIE);
    const csrf = cookies.find((c) => c.name === CSRF_COOKIE);
    expect(session?.value ?? '').toBe('');
    expect(csrf?.value ?? '').toBe('');
  });
});

test.describe('API — OAuth account management', () => {
  test('lists no linked accounts for a password-only user', async ({ api }) => {
    const res = await api.get('/auth/oauth/accounts');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('listing linked accounts requires authentication', async ({ anonApi }) => {
    expect((await anonApi.get('/auth/oauth/accounts')).status()).toBe(401);
  });

  test('unlinking an unknown account returns 404', async ({ api }) => {
    const res = await api.delete('/auth/oauth/accounts/' + 'a'.repeat(24));
    expect(res.status()).toBe(404);
  });

  test('unlinking rejects a malformed id', async ({ api }) => {
    const res = await api.delete('/auth/oauth/accounts/not-a-cuid');
    expect(res.status()).toBe(400);
  });

  test('Google OAuth start redirects when configured, 503 when it is not', async ({ anonApi }) => {
    const res = await anonApi.ctx.get(
      (process.env.E2E_API_URL ?? 'http://localhost:4000') + '/auth/oauth/google',
      { maxRedirects: 0 },
    );

    expect([302, 503]).toContain(res.status());
    if (res.status() === 302) {
      expect(res.headers()['location']).toContain('accounts.google.com');
    }
  });

  test('GitHub OAuth start redirects when configured, 503 when it is not', async ({ anonApi }) => {
    const res = await anonApi.ctx.get(
      (process.env.E2E_API_URL ?? 'http://localhost:4000') + '/auth/oauth/github',
      { maxRedirects: 0 },
    );

    expect([302, 503]).toContain(res.status());
    if (res.status() === 302) {
      expect(res.headers()['location']).toContain('github.com');
    }
  });

  test('GitHub OAuth callback rejects a missing code', async ({ anonApi }) => {
    const res = await anonApi.get('/auth/oauth/github/callback', { state: 'abc' });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
