import { randomBytes } from 'node:crypto';

import { setCookie } from 'hono/cookie';

import type { Context } from 'hono';

/**
 * Generate a cryptographically random CSRF token (256-bit).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Set the CSRF cookie on the response.
 *
 * Per spec §4.7: `HttpOnly: false` (so frontend JS can read it),
 * `SameSite: Strict` (third-party sites can't read it).
 */
export function setCsrfCookie(c: Context, token: string): void {
  setCookie(c, 'csrf_token', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days, same as session
    domain: process.env.COOKIE_DOMAIN,
  });
}

/**
 * Clear the CSRF cookie (e.g., on logout).
 */
export function clearCsrfCookie(c: Context): void {
  setCookie(c, 'csrf_token', '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
    domain: process.env.COOKIE_DOMAIN,
  });
}
