import { eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';

import { db } from '../db';
import { sessions } from '../db/schema';
import { AppError } from '../lib/errors';
import { lucia } from '../lib/lucia';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

/** 7-day idle timeout in milliseconds */
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/** Only update lastActiveAt if more than 5 minutes since last update */
const ACTIVITY_UPDATE_THROTTLE_MS = 5 * 60 * 1000;

export const authMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const sessionId = getCookie(c, lucia.sessionCookieName) ?? null;

  if (!sessionId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (!session || !user) {
    const blankCookie = lucia.createBlankSessionCookie();
    c.header('Set-Cookie', blankCookie.serialize(), { append: true });
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session');
  }

  // Check idle timeout
  const lastActive =
    session.lastActiveAt instanceof Date ? session.lastActiveAt : new Date(session.lastActiveAt);
  if (Date.now() - lastActive.getTime() > IDLE_TIMEOUT_MS) {
    await lucia.invalidateSession(session.id);
    const blankCookie = lucia.createBlankSessionCookie();
    c.header('Set-Cookie', blankCookie.serialize(), { append: true });
    throw new AppError(401, 'UNAUTHORIZED', 'Session expired due to inactivity');
  }

  // Refresh session cookie if Lucia says the session was renewed
  if (session.fresh) {
    const sessionCookie = lucia.createSessionCookie(session.id);
    c.header('Set-Cookie', sessionCookie.serialize(), { append: true });
  }

  // Throttled update of lastActiveAt to avoid DB write on every request
  const timeSinceActivity = Date.now() - lastActive.getTime();
  if (timeSinceActivity > ACTIVITY_UPDATE_THROTTLE_MS) {
    db.update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.id, session.id))
      .execute()
      .catch(() => {
        // Non-critical — swallow errors silently
      });
  }

  c.set('userId', user.id);
  c.set('session', session);
  c.set('user', user);

  await next();
};
