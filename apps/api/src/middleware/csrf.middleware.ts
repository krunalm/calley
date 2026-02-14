import { getCookie } from 'hono/cookie';

import { AppError } from '../lib/errors';

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
 * If neither cookie nor header is present (unauthenticated pre-session request),
 * the request is allowed through — CSRF cookies are set on session creation.
 */
export const doubleSubmitCsrf: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  // Safe methods don't need CSRF protection
  if (SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  const csrfCookie = getCookie(c, 'csrf_token') ?? null;
  const csrfHeader = c.req.header('x-csrf-token') ?? null;

  // No CSRF cookie and no header → pre-session request (e.g., signup/login)
  if (!csrfCookie && !csrfHeader) {
    await next();
    return;
  }

  // Cookie or header present but they don't match → reject
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    throw new AppError(403, 'FORBIDDEN', 'Invalid CSRF token');
  }

  await next();
};
