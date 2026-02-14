import { getCookie } from 'hono/cookie';

import { AppError } from '../lib/errors';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

/**
 * Double-submit cookie CSRF protection.
 *
 * Validates that the `csrf_token` cookie matches the `X-CSRF-Token` header.
 * If neither cookie nor header is present (unauthenticated pre-session request),
 * the request is allowed through — CSRF cookies are set on session creation.
 */
export const doubleSubmitCsrf: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
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
