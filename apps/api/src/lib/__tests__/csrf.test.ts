import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { clearCsrfCookie, generateCsrfToken, setCsrfCookie } from '../csrf';

async function cookieFrom(apply: (c: Parameters<typeof setCsrfCookie>[0]) => void) {
  const app = new Hono();
  app.get('/', (c) => {
    apply(c);
    return c.body(null, 204);
  });
  const res = await app.request('/');
  return res.headers.get('set-cookie') ?? '';
}

describe('generateCsrfToken', () => {
  it('returns a 256-bit hex token', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateCsrfToken));
    expect(tokens.size).toBe(50);
  });
});

describe('setCsrfCookie', () => {
  const previous = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previous;
  });

  it('stays readable to scripts so the double-submit header can be sent', async () => {
    const cookie = await cookieFrom((c) => setCsrfCookie(c, 'tok'));

    // Deliberately not HttpOnly: the frontend has to read this value back and
    // echo it as X-CSRF-Token. SameSite=Strict is what keeps another origin
    // from doing the same.
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toContain('csrf_token=tok');
  });

  it('marks the cookie Secure only in production', async () => {
    process.env.NODE_ENV = 'development';
    expect(await cookieFrom((c) => setCsrfCookie(c, 'tok'))).not.toMatch(/Secure/i);

    process.env.NODE_ENV = 'production';
    expect(await cookieFrom((c) => setCsrfCookie(c, 'tok'))).toMatch(/Secure/i);
  });
});

describe('clearCsrfCookie', () => {
  it('expires the cookie immediately', async () => {
    const cookie = await cookieFrom((c) => clearCsrfCookie(c));

    expect(cookie).toContain('csrf_token=');
    expect(cookie).toMatch(/Max-Age=0/i);
  });
});
