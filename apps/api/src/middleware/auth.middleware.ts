import { eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';

import { db } from '../db';
import { sessions } from '../db/schema';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { lucia } from '../lib/lucia';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';
import type { Session, User } from 'lucia';

/** 7-day idle timeout in milliseconds */
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/** Only update lastActiveAt if more than 5 minutes since last update */
const ACTIVITY_UPDATE_THROTTLE_MS = 5 * 60 * 1000;

export interface ValidatedSession {
  session: Session;
  user: User;
  /** True when the session was idle-expired and has been invalidated. */
  idleExpired?: boolean;
}

/**
 * Validate a session ID and enforce the idle-session policy.
 *
 * Shared by every authentication path — cookie middleware, the SSE stream, and
 * the OAuth linking callback — so the "expired due to inactivity" rule cannot
 * be bypassed by authenticating through a different entry point.
 *
 * Returns null when the session does not exist. An idle-expired session is
 * invalidated and reported via `idleExpired` so the caller can clear the stale
 * cookie.
 */
export async function validateSessionWithIdlePolicy(
  sessionId: string,
): Promise<ValidatedSession | null> {
  const { session, user } = await lucia.validateSession(sessionId);

  if (!session || !user) {
    return null;
  }

  const lastActive =
    session.lastActiveAt instanceof Date ? session.lastActiveAt : new Date(session.lastActiveAt);
  // Guard against null/undefined lastActiveAt producing an Invalid Date
  // (NaN arithmetic would cause the idle check to silently pass, creating permanent sessions)
  if (isNaN(lastActive.getTime())) {
    await lucia.invalidateSession(session.id);
    return { session, user, idleExpired: true };
  }
  if (Date.now() - lastActive.getTime() > IDLE_TIMEOUT_MS) {
    await lucia.invalidateSession(session.id);
    return { session, user, idleExpired: true };
  }

  return { session, user };
}

export const authMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const sessionId = getCookie(c, lucia.sessionCookieName) ?? null;

  if (!sessionId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const validated = await validateSessionWithIdlePolicy(sessionId);

  if (!validated || validated.idleExpired) {
    const blankCookie = lucia.createBlankSessionCookie();
    c.header('Set-Cookie', blankCookie.serialize(), { append: true });
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session');
  }

  const { session, user } = validated;

  // Refresh session cookie if Lucia says the session was renewed
  if (session.fresh) {
    const sessionCookie = lucia.createSessionCookie(session.id);
    c.header('Set-Cookie', sessionCookie.serialize(), { append: true });
  }

  // Throttled update of lastActiveAt to avoid DB write on every request
  const lastActive =
    session.lastActiveAt instanceof Date ? session.lastActiveAt : new Date(session.lastActiveAt);
  const timeSinceActivity = Date.now() - lastActive.getTime();
  if (timeSinceActivity > ACTIVITY_UPDATE_THROTTLE_MS) {
    db.update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.id, session.id))
      .execute()
      .catch((err) => {
        logger.warn({ err, sessionId: session.id }, 'Failed to update session lastActiveAt');
      });
  }

  c.set('userId', user.id);
  c.set('session', session);
  c.set('user', user);

  await next();
};
