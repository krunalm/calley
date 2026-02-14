import { createHash, randomBytes } from 'node:crypto';

import argon2 from 'argon2';
import { and, eq, gte, isNull, ne, sql } from 'drizzle-orm';

import { DEFAULT_CATEGORY_COLOR } from '@calley/shared';

import { db } from '../db';
import {
  calendarCategories,
  oauthAccounts,
  passwordResetTokens,
  sessions,
  users,
} from '../db/schema';
import { passwordResetEmail } from '../emails/password-reset';
import { sendEmail } from '../lib/email';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { lucia } from '../lib/lucia';

import type {
  ChangePasswordInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  UpdateProfileInput,
} from '@calley/shared';
import type { Cookie } from 'lucia';

// ─── Constants ─────────────────────────────────────────────────────────

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS_PER_USER = 10;
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 60;

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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
   * Request a password reset email.
   * Always returns the same response regardless of whether the email exists
   * to prevent user enumeration.
   */
  async forgotPassword(data: ForgotPasswordInput): Promise<void> {
    const user = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    // Always return success to prevent email enumeration.
    // Only proceed with token creation + email if the user exists and has a password.
    if (!user || !user.passwordHash) {
      logger.info(
        { email: data.email },
        'Password reset requested for non-existent or OAuth-only email',
      );
      return;
    }

    // Generate a cryptographically random token (256-bit)
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS);

    // Atomically invalidate existing tokens and insert the new one
    await db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

      await tx.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
    });

    // Build the reset URL
    const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    // Send the email
    const { html, text } = passwordResetEmail({
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    });

    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset Your Password — Calley',
        html,
        text,
      });

      logger.info({ userId: user.id }, 'Password reset email sent');
    } catch (err) {
      logger.error(
        { err, email: user.email, userId: user.id },
        'Failed to send password reset email',
      );
    }
  }

  /**
   * Reset password using a valid token.
   * Verifies the hashed token, checks expiry, updates the password,
   * marks the token as used, and invalidates all sessions.
   */
  async resetPassword(data: ResetPasswordInput): Promise<void> {
    const tokenHash = hashToken(data.token);

    // Hash the new password before entering the transaction
    const newPasswordHash = await argon2.hash(data.password, ARGON2_OPTIONS);

    const userId = await db.transaction(async (tx) => {
      // Atomically consume the token: update usedAt only if it's still unused and not expired
      const [consumed] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gte(passwordResetTokens.expiresAt, sql`now()`),
          ),
        )
        .returning({ userId: passwordResetTokens.userId });

      if (!consumed) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid or expired reset token');
      }

      // Update the user's password and clear any lockout state
      await tx
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          failedLogins: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, consumed.userId));

      return consumed.userId;
    });

    // Invalidate all sessions for the user (force re-login) — outside transaction
    // since Lucia manages sessions independently
    await lucia.invalidateUserSessions(userId);

    logger.info({ userId }, 'Password reset completed');
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

  /**
   * Handle OAuth callback for both Google and GitHub.
   *
   * Implements the account lookup/linking/creation logic from spec §13.3:
   * 1. If an OAuthAccount exists for this provider + providerAccountId → load that user.
   * 2. Else if the OAuth email matches an existing user → link the OAuth account to them.
   * 3. Else → create a new user + OAuthAccount + default category.
   *
   * Edge case: if the OAuth provider doesn't return an email, we return an error
   * since we need email for account management.
   */
  async handleOAuthCallback(
    provider: 'google' | 'github',
    profile: {
      providerAccountId: string;
      email: string | null;
      name: string;
      avatarUrl: string | null;
    },
    meta: { userAgent: string | null; ipAddress: string | null },
  ): Promise<{ cookie: Cookie }> {
    // Edge case: OAuth provider doesn't return email
    if (!profile.email) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'Your OAuth account does not have a public email address. Please set a public email on your account and try again.',
      );
    }

    const email = profile.email.toLowerCase();

    // All user/oauthAccount/category writes are wrapped in a single transaction
    // to ensure atomicity. The unique index on (provider, providerAccountId) and
    // the unique index on users.email guard against races where two concurrent
    // OAuth callbacks attempt to create the same account.
    const userId = await db.transaction(async (tx) => {
      // Step 1: Check if this OAuth account is already linked
      const existingOAuth = await tx.query.oauthAccounts.findFirst({
        where: and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerAccountId, profile.providerAccountId),
        ),
      });

      if (existingOAuth) {
        // OAuth account already linked — just update avatar and return
        if (profile.avatarUrl) {
          await tx
            .update(users)
            .set({ avatarUrl: profile.avatarUrl })
            .where(eq(users.id, existingOAuth.userId));
        }

        logger.info({ userId: existingOAuth.userId, provider }, 'OAuth login — existing account');
        return existingOAuth.userId;
      }

      // Step 2: Check if email matches an existing user
      const existingUser = await tx.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (existingUser) {
        // Link OAuth account to the existing user
        await tx.insert(oauthAccounts).values({
          userId: existingUser.id,
          provider,
          providerAccountId: profile.providerAccountId,
        });

        // Update avatar if user doesn't have one yet
        if (!existingUser.avatarUrl && profile.avatarUrl) {
          await tx
            .update(users)
            .set({ avatarUrl: profile.avatarUrl })
            .where(eq(users.id, existingUser.id));
        }

        logger.info(
          { userId: existingUser.id, provider },
          'OAuth login — linked to existing email account',
        );
        return existingUser.id;
      }

      // Step 3: Create a brand new user + OAuth account + default category.
      // The unique index on users.email will cause this insert to fail if a
      // concurrent request already created a user with the same email — the
      // entire transaction rolls back, surfacing as an error to the caller.
      const [newUser] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: null, // OAuth-only user, no password
          name: profile.name || email.split('@')[0],
          avatarUrl: profile.avatarUrl,
          timezone: 'UTC',
          weekStart: 0,
          timeFormat: '12h',
        })
        .returning();

      await tx.insert(oauthAccounts).values({
        userId: newUser.id,
        provider,
        providerAccountId: profile.providerAccountId,
      });

      // Create default "Personal" category
      await tx.insert(calendarCategories).values({
        userId: newUser.id,
        name: 'Personal',
        color: DEFAULT_CATEGORY_COLOR,
        isDefault: true,
        sortOrder: 0,
      });

      logger.info({ userId: newUser.id, provider }, 'OAuth signup — new account created');
      return newUser.id;
    });

    // Session creation happens after a successful transaction commit so no
    // partial state remains if the DB writes fail. Lucia manages sessions in
    // its own table operations which are independent of the user-creation tx.
    await enforceMaxSessions(userId);
    const session = await lucia.createSession(userId, {
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress ? hashIpAddress(meta.ipAddress) : null,
      lastActiveAt: new Date(),
    });

    const cookie = lucia.createSessionCookie(session.id);

    return { cookie };
  }
}

export const authService = new AuthService();
