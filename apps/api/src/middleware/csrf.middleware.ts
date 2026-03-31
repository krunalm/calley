import { getCookie } from 'hono/cookie';

import { AppError } from '../lib/errors';
import { lucia } from '../lib/lucia';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

/** HTTP methods that are safe (read-only) and exempt from CSRF checks. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF protection.
 *
 * Validates that the `csrf_token` cookie matches the `X-CSRF-Token` header
 * on all state-changing requests (POST, PATCH, DELETE).
 *
 * GET, HEAD, and OPTIONS requests are exempt per spec §4.7.
 *
 * Pre-session requests (no session cookie AND no CSRF cookie/header) are
 * allowed through — CSRF cookies are set on session creation. However, if
 * a session cookie IS present, CSRF validation is always enforced to prevent
 * cross-site attacks against authenticated users.
 */
export const doubleSubmitCsrf: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  // Safe methods don't need CSRF protection
  if (SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  const csrfCookie = getCookie(c, 'csrf_token') ?? null;
  const csrfHeader = c.req.header('x-csrf-token') ?? null;
  const sessionCookie = getCookie(c, lucia.sessionCookieName) ?? null;

  // Only skip CSRF for truly pre-session requests: no session cookie AND no
  // CSRF cookie/header. If a session cookie exists, the user is authenticated
  // and CSRF must be validated to prevent cross-site attacks.
  if (!csrfCookie && !csrfHeader && !sessionCookie) {
    await next();
    return;
  }

  // Cookie or header present but they don't match → reject
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    throw new AppError(403, 'FORBIDDEN', 'Invalid CSRF token');
  }

  await next();
};
