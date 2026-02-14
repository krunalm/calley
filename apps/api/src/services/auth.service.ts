import { createHash } from 'node:crypto';

import argon2 from 'argon2';
import { and, eq, ne } from 'drizzle-orm';

import { DEFAULT_CATEGORY_COLOR } from '@calley/shared';

import { db } from '../db';
import { calendarCategories, sessions, users } from '../db/schema';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { lucia } from '../lib/lucia';

import type {
  ChangePasswordInput,
  DeleteAccountInput,
  LoginInput,
  SignupInput,
  UpdateProfileInput,
} from '@calley/shared';
import type { Cookie } from 'lucia';

// ─── Constants ─────────────────────────────────────────────────────────

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS_PER_USER = 10;

/** Argon2id parameters per spec §4.1 */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB in KiB
  timeCost: 3,
  parallelism: 4,
};

// ─── Helpers ───────────────────────────────────────────────────────────

function hashIpAddress(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function stripSensitiveFields(user: typeof users.$inferSelect) {
  const { passwordHash: _, failedLogins: __, lockedUntil: ___, ...safeUser } = user;
  return safeUser;
}

async function enforceMaxSessions(userId: string): Promise<void> {
  const userSessions = await db.query.sessions.findMany({
    where: eq(sessions.userId, userId),
    orderBy: (s, { asc }) => [asc(s.createdAt)],
  });

  if (userSessions.length >= MAX_SESSIONS_PER_USER) {
    // Delete oldest sessions to make room
    const sessionsToDelete = userSessions.slice(0, userSessions.length - MAX_SESSIONS_PER_USER + 1);
    for (const s of sessionsToDelete) {
      await lucia.invalidateSession(s.id);
    }
  }
}

// ─── Service ───────────────────────────────────────────────────────────

export class AuthService {
  /**
   * Create a new account with email and password.
   * Creates user, default category, and session.
   */
  async signup(
    data: SignupInput,
    meta: { userAgent: string | null; ipAddress: string | null },
  ): Promise<{ user: ReturnType<typeof stripSensitiveFields>; cookie: Cookie }> {
    // Check email uniqueness
    const existing = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    if (existing) {
      throw new AppError(409, 'CONFLICT', 'An account with this email already exists');
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(data.password, ARGON2_OPTIONS);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        name: data.name,
        timezone: 'UTC',
        weekStart: 0,
        timeFormat: '12h',
      })
      .returning();

    // Create default "Personal" category
    await db.insert(calendarCategories).values({
      userId: user.id,
      name: 'Personal',
      color: DEFAULT_CATEGORY_COLOR,
      isDefault: true,
      sortOrder: 0,
    });

    // Create session
    await enforceMaxSessions(user.id);
    const session = await lucia.createSession(user.id, {
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress ? hashIpAddress(meta.ipAddress) : null,
      lastActiveAt: new Date(),
    });

    const cookie = lucia.createSessionCookie(session.id);

    logger.info({ userId: user.id }, 'User signed up');

    return { user: stripSensitiveFields(user), cookie };
  }

  /**
   * Authenticate with email and password.
   * Handles lockout, failed attempts, and session rotation.
   */
  async login(
    data: LoginInput,
    meta: { userAgent: string | null; ipAddress: string | null },
  ): Promise<{ user: ReturnType<typeof stripSensitiveFields>; cookie: Cookie }> {
    // Lookup user by email — generic error prevents enumeration
    const user = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    // Check account lockout — return generic error to prevent account state enumeration
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    // OAuth-only users cannot login with password
    if (!user.passwordHash) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    // Verify password
    const validPassword = await argon2.verify(user.passwordHash, data.password);

    if (!validPassword) {
      const newFailedLogins = user.failedLogins + 1;

      if (newFailedLogins >= LOCKOUT_THRESHOLD) {
        // Lock the account
        await db
          .update(users)
          .set({
            failedLogins: newFailedLogins,
            lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
          })
          .where(eq(users.id, user.id));

        logger.warn({ userId: user.id }, 'Account locked after failed login attempts');
        throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
      }

      await db.update(users).set({ failedLogins: newFailedLogins }).where(eq(users.id, user.id));

      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    // Successful login — reset failed logins and clear lockout
    await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));

    // Create new session (session rotation)
    await enforceMaxSessions(user.id);
    const session = await lucia.createSession(user.id, {
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress ? hashIpAddress(meta.ipAddress) : null,
      lastActiveAt: new Date(),
    });

    const cookie = lucia.createSessionCookie(session.id);

    logger.info({ userId: user.id }, 'User logged in');

    return { user: stripSensitiveFields(user), cookie };
  }

  /**
   * Invalidate the current session and return a blank cookie.
   */
  async logout(sessionId: string): Promise<{ cookie: Cookie }> {
    await lucia.invalidateSession(sessionId);
    const cookie = lucia.createBlankSessionCookie();
    return { cookie };
  }

  /**
   * Get the current user's profile (no sensitive fields).
   */
  async getMe(userId: string): Promise<ReturnType<typeof stripSensitiveFields>> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    return stripSensitiveFields(user);
  }

  /**
   * Update the current user's profile (name, timezone, weekStart, timeFormat).
   */
  async updateProfile(
    userId: string,
    data: UpdateProfileInput,
  ): Promise<ReturnType<typeof stripSensitiveFields>> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, userId)).returning();

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    return stripSensitiveFields(updated);
  }

  /**
   * Change the current user's password.
   * Verifies current password, hashes new one, invalidates all other sessions.
   */
  async changePassword(
    userId: string,
    currentSessionId: string,
    data: ChangePasswordInput,
  ): Promise<void> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || !user.passwordHash) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot change password for this account');
    }

    const validPassword = await argon2.verify(user.passwordHash, data.currentPassword);
    if (!validPassword) {
      throw new AppError(401, 'UNAUTHORIZED', 'Current password is incorrect');
    }

    const newPasswordHash = await argon2.hash(data.newPassword, ARGON2_OPTIONS);

    await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, userId));

    // Invalidate all sessions except the current one
    const allSessions = await db.query.sessions.findMany({
      where: and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)),
    });

    for (const s of allSessions) {
      await lucia.invalidateSession(s.id);
    }

    logger.info({ userId }, 'Password changed');
  }

  /**
   * Delete the current user's account after verifying password.
   * Database cascades handle related data cleanup.
   */
  async deleteAccount(userId: string, data: DeleteAccountInput): Promise<void> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    // Require password verification for deletion
    if (!user.passwordHash) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot verify identity for this account');
    }

    const validPassword = await argon2.verify(user.passwordHash, data.password);
    if (!validPassword) {
      throw new AppError(401, 'UNAUTHORIZED', 'Password is incorrect');
    }

    // Invalidate all sessions first
    await lucia.invalidateUserSessions(userId);

    // Delete user — FK cascades handle all related data
    await db.delete(users).where(eq(users.id, userId));

    logger.info({ userId }, 'Account deleted');
  }
}

export const authService = new AuthService();
