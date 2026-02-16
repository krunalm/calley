import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock modules before importing the service ──────────────────────

// Mock the database module
vi.mock('../../db', () => {
  const mockDb = {
    query: {
      users: { findFirst: vi.fn() },
      sessions: { findMany: vi.fn() },
      oauthAccounts: { findFirst: vi.fn(), findMany: vi.fn() },
      calendarCategories: { findFirst: vi.fn() },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };

  return { db: mockDb };
});

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock lucia
vi.mock('../../lib/lucia', () => ({
  lucia: {
    createSession: vi.fn().mockResolvedValue({ id: 'session_123' }),
    createSessionCookie: vi.fn().mockReturnValue({ name: 'calley_session', value: 'cookie_val' }),
    createBlankSessionCookie: vi.fn().mockReturnValue({ name: 'calley_session', value: '' }),
    invalidateSession: vi.fn(),
    invalidateUserSessions: vi.fn(),
  },
}));

// Mock email
vi.mock('../../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock audit service
vi.mock('../audit.service', () => ({
  auditService: { log: vi.fn() },
}));

// Mock email templates
vi.mock('../../emails/password-reset', () => ({
  passwordResetEmail: vi.fn().mockReturnValue({ html: '<p>reset</p>', text: 'reset' }),
}));

vi.mock('../../emails/account-lockout', () => ({
  accountLockoutEmail: vi.fn().mockReturnValue({ html: '<p>locked</p>', text: 'locked' }),
}));

// Mock argon2
vi.mock('argon2', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$hashed'),
    verify: vi.fn().mockResolvedValue(true),
    argon2id: 2,
  },
}));

// Mock node:crypto
vi.mock('node:crypto', () => ({
  createHash: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('abcdef1234567890abcdef1234567890'),
  }),
  randomBytes: vi.fn().mockReturnValue({
    toString: vi
      .fn()
      .mockReturnValue('randomtoken1234567890abcdef1234567890abcdef1234567890abcdef12345678'),
  }),
}));

import argon2 from 'argon2';

import { db } from '../../db';
import { sendEmail } from '../../lib/email';
import { lucia } from '../../lib/lucia';
import { auditService } from '../audit.service';
import { AuthService } from '../auth.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_SESSION_ID = 'session_current_123';

const META = {
  userAgent: 'Mozilla/5.0 TestBrowser',
  ipAddress: '127.0.0.1',
};

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_USER_ID,
    email: 'test@example.com',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$existinghash',
    name: 'Test User',
    avatarUrl: null,
    timezone: 'UTC',
    weekStart: 0,
    timeFormat: '12h',
    lockedUntil: null,
    failedLogins: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session_other_456',
    userId: TEST_USER_ID,
    userAgent: 'Mozilla/5.0 OtherBrowser',
    ipAddress: 'hashed_ip_123',
    expiresAt: new Date('2026-04-01T00:00:00Z'),
    lastActiveAt: new Date('2026-02-15T00:00:00Z'),
    createdAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

// ─── Helpers for mocking chained Drizzle queries ────────────────────

function mockUpdateChain(result: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockDeleteChain() {
  const chain = {
    where: vi.fn().mockResolvedValue([]),
  };
  (db.delete as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService();
    // Default: enforceMaxSessions finds no existing sessions
    (db.query.sessions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  // ─── signup ───────────────────────────────────────────────────────

  describe('signup', () => {
    it('should create a new user, default category, and session', async () => {
      const userRow = makeUserRow();
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // First insert call returns user, second returns category
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([userRow]),
      };
      const insertChainNoReturn = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      (db.insert as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(insertChain) // users insert
        .mockReturnValueOnce(insertChainNoReturn); // calendarCategories insert

      const result = await service.signup(
        { email: 'test@example.com', password: 'SecureP@ss123', name: 'Test User' },
        META,
      );

      expect(result.user.id).toBe(TEST_USER_ID);
      expect(result.user.email).toBe('test@example.com');
      expect(result.cookie.name).toBe('calley_session');
      // Should not include sensitive fields
      expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((result.user as Record<string, unknown>).failedLogins).toBeUndefined();
      expect((result.user as Record<string, unknown>).lockedUntil).toBeUndefined();
      // Password was hashed
      expect(argon2.hash).toHaveBeenCalled();
      // Session was created
      expect(lucia.createSession).toHaveBeenCalled();
      // Audit log was called
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.signup', userId: TEST_USER_ID }),
      );
    });

    it('should throw CONFLICT when email already exists', async () => {
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(makeUserRow());

      await expect(
        service.signup(
          { email: 'test@example.com', password: 'SecureP@ss123', name: 'Test User' },
          META,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
      });
    });
  });

  // ─── login ────────────────────────────────────────────────────────

  describe('login', () => {
    it('should authenticate successfully and return user + cookie', async () => {
      const userRow = makeUserRow();
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);
      (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      mockUpdateChain([]); // reset failedLogins

      const result = await service.login(
        { email: 'test@example.com', password: 'SecureP@ss123' },
        META,
      );

      expect(result.user.id).toBe(TEST_USER_ID);
      expect(result.cookie.name).toBe('calley_session');
      // Sensitive fields stripped
      expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(lucia.createSession).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.login', userId: TEST_USER_ID }),
      );
    });

    it('should throw UNAUTHORIZED for non-existent user', async () => {
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'anything' }, META),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.login.failed',
          metadata: { reason: 'unknown_email' },
        }),
      );
    });

    it('should throw UNAUTHORIZED for wrong password and increment failedLogins', async () => {
      const userRow = makeUserRow({ failedLogins: 0 });
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);
      (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      mockUpdateChain([]);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }, META),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });

      // db.update should have been called to increment failedLogins
      expect(db.update).toHaveBeenCalled();
    });

    it('should lock account after 5 failed login attempts', async () => {
      const userRow = makeUserRow({ failedLogins: 4 }); // 4 already, this makes 5
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);
      (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      mockUpdateChain([]);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }, META),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      // Audit log for lockout
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.lockout',
          userId: TEST_USER_ID,
        }),
      );
      // Lockout email sent
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Locked'),
        }),
      );
    });

    it('should throw UNAUTHORIZED for a locked account', async () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000);
      const userRow = makeUserRow({ lockedUntil: futureDate, failedLogins: 5 });
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);

      await expect(
        service.login({ email: 'test@example.com', password: 'SecureP@ss123' }, META),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });

      // Password verification should NOT be called for a locked account
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED for OAuth-only account without password', async () => {
      const userRow = makeUserRow({ passwordHash: null });
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);

      await expect(
        service.login({ email: 'test@example.com', password: 'anything' }, META),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });

      expect(argon2.verify).not.toHaveBeenCalled();
    });
  });

  // ─── logout ───────────────────────────────────────────────────────

  describe('logout', () => {
    it('should invalidate session and return blank cookie', async () => {
      const result = await service.logout(TEST_SESSION_ID, TEST_USER_ID, META);

      expect(lucia.invalidateSession).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(result.cookie.value).toBe('');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.logout', userId: TEST_USER_ID }),
      );
    });
  });

  // ─── getMe ────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('should return user profile without sensitive fields', async () => {
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(makeUserRow());

      const result = await service.getMe(TEST_USER_ID);

      expect(result.id).toBe(TEST_USER_ID);
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((result as Record<string, unknown>).failedLogins).toBeUndefined();
      expect((result as Record<string, unknown>).lockedUntil).toBeUndefined();
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(service.getMe('nonexistent_user_id')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should update user profile and return updated data', async () => {
      const updatedUser = makeUserRow({ name: 'Updated Name', timezone: 'America/New_York' });
      mockUpdateChain([updatedUser]);

      const result = await service.updateProfile(TEST_USER_ID, {
        name: 'Updated Name',
        timezone: 'America/New_York',
      });

      expect(result.name).toBe('Updated Name');
      expect(result.timezone).toBe('America/New_York');
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(db.update).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when updating a non-existent user', async () => {
      mockUpdateChain([]); // No rows returned means user not found

      await expect(
        service.updateProfile('nonexistent_user_id', { name: 'New Name' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── changePassword ───────────────────────────────────────────────

  describe('changePassword', () => {
    it('should change password, invalidate other sessions, and audit log', async () => {
      const userRow = makeUserRow();
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);
      (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      mockUpdateChain([]);

      // Mock other sessions to be invalidated
      (db.query.sessions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSessionRow({ id: 'session_other_1' }),
        makeSessionRow({ id: 'session_other_2' }),
      ]);

      await service.changePassword(
        TEST_USER_ID,
        TEST_SESSION_ID,
        { currentPassword: 'OldP@ss123', newPassword: 'NewP@ss456' },
        META,
      );

      // Current password was verified
      expect(argon2.verify).toHaveBeenCalled();
      // New password was hashed
      expect(argon2.hash).toHaveBeenCalled();
      // Password was updated in DB
      expect(db.update).toHaveBeenCalled();
      // Other sessions were invalidated
      expect(lucia.invalidateSession).toHaveBeenCalledTimes(2);
      expect(lucia.invalidateSession).toHaveBeenCalledWith('session_other_1');
      expect(lucia.invalidateSession).toHaveBeenCalledWith('session_other_2');
      // Audit log
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.password.changed', userId: TEST_USER_ID }),
      );
    });

    it('should throw UNAUTHORIZED when current password is wrong', async () => {
      const userRow = makeUserRow();
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);
      (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        service.changePassword(
          TEST_USER_ID,
          TEST_SESSION_ID,
          { currentPassword: 'wrong', newPassword: 'NewP@ss456' },
          META,
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Current password is incorrect',
      });
    });

    it('should throw VALIDATION_ERROR for OAuth-only account without password', async () => {
      const userRow = makeUserRow({ passwordHash: null });
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);

      await expect(
        service.changePassword(
          TEST_USER_ID,
          TEST_SESSION_ID,
          { currentPassword: 'anything', newPassword: 'NewP@ss456' },
          META,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Cannot change password for this account',
      });
    });
  });

  // ─── deleteAccount ────────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('should delete account after verifying password', async () => {
      const userRow = makeUserRow();
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);
      (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      mockDeleteChain();

      await service.deleteAccount(TEST_USER_ID, { password: 'SecureP@ss123' }, META);

      // Audit log before deletion
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'account.delete', userId: TEST_USER_ID }),
      );
      // All sessions invalidated
      expect(lucia.invalidateUserSessions).toHaveBeenCalledWith(TEST_USER_ID);
      // User deleted from DB
      expect(db.delete).toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED when password is wrong', async () => {
      const userRow = makeUserRow();
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);
      (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        service.deleteAccount(TEST_USER_ID, { password: 'wrong' }, META),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Password is incorrect',
      });
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.deleteAccount('nonexistent_user_id', { password: 'anything' }, META),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should throw VALIDATION_ERROR for OAuth-only account without password', async () => {
      const userRow = makeUserRow({ passwordHash: null });
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);

      await expect(
        service.deleteAccount(TEST_USER_ID, { password: 'anything' }, META),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Cannot verify identity for this account',
      });
    });
  });

  // ─── forgotPassword ───────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should generate token and send email for existing user', async () => {
      const userRow = makeUserRow();
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);

      // Mock transaction for invalidating old tokens and inserting new one
      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      const txInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      const tx = {
        update: vi.fn().mockReturnValue(txUpdateChain),
        insert: vi.fn().mockReturnValue(txInsertChain),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      await service.forgotPassword({ email: 'test@example.com' });

      // Token was created in transaction
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.insert).toHaveBeenCalled();
      // Email was sent
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Reset Your Password'),
        }),
      );
    });

    it('should silently succeed for non-existent email (no enumeration)', async () => {
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Should not throw
      await expect(
        service.forgotPassword({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();

      // No email sent, no token created
      expect(sendEmail).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('should silently succeed for OAuth-only user without password', async () => {
      const userRow = makeUserRow({ passwordHash: null });
      (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(userRow);

      await expect(service.forgotPassword({ email: 'test@example.com' })).resolves.toBeUndefined();

      // No email sent
      expect(sendEmail).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  // ─── resetPassword ────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should reset password with valid token and invalidate all sessions', async () => {
      // Mock transaction: consume token and update password
      const txUpdateChainToken = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ userId: TEST_USER_ID }]),
      };
      const txUpdateChainPassword = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      let updateCallCount = 0;
      const tx = {
        update: vi.fn().mockImplementation(() => {
          updateCallCount++;
          if (updateCallCount === 1) return txUpdateChainToken;
          return txUpdateChainPassword;
        }),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      await service.resetPassword({
        token: 'valid_token_hex',
        password: 'NewSecureP@ss456',
      });

      // Transaction was used to consume token and update password
      expect(db.transaction).toHaveBeenCalled();
      // New password was hashed
      expect(argon2.hash).toHaveBeenCalled();
      // All sessions invalidated
      expect(lucia.invalidateUserSessions).toHaveBeenCalledWith(TEST_USER_ID);
      // Audit log
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.password.reset', userId: TEST_USER_ID }),
      );
    });

    it('should throw VALIDATION_ERROR for invalid or expired token', async () => {
      // Mock transaction: token not found
      const txUpdateChainToken = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]), // No token consumed
      };
      const tx = {
        update: vi.fn().mockReturnValue(txUpdateChainToken),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      await expect(
        service.resetPassword({
          token: 'invalid_or_expired_token',
          password: 'NewP@ss456',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid or expired reset token',
      });

      // Sessions should not be invalidated
      expect(lucia.invalidateUserSessions).not.toHaveBeenCalled();
    });
  });

  // ─── handleOAuthCallback ──────────────────────────────────────────

  describe('handleOAuthCallback', () => {
    const oauthProfile = {
      providerAccountId: 'google_12345',
      email: 'oauth@example.com',
      name: 'OAuth User',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    it('should login existing OAuth account', async () => {
      const existingOAuth = {
        id: 'oauth_acc_id',
        userId: TEST_USER_ID,
        provider: 'google',
        providerAccountId: 'google_12345',
        createdAt: new Date(),
      };

      // Transaction mock
      const txQueryOauth = { findFirst: vi.fn().mockResolvedValue(existingOAuth) };
      const txQueryUsers = { findFirst: vi.fn() };
      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      const tx = {
        query: {
          oauthAccounts: txQueryOauth,
          users: txQueryUsers,
        },
        update: vi.fn().mockReturnValue(txUpdateChain),
        insert: vi.fn(),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      const result = await service.handleOAuthCallback('google', oauthProfile, META);

      expect(result.cookie.name).toBe('calley_session');
      expect(lucia.createSession).toHaveBeenCalled();
      // Audit log for login
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.login',
          userId: TEST_USER_ID,
          metadata: { provider: 'google' },
        }),
      );
    });

    it('should link OAuth account to existing email user', async () => {
      const existingUser = makeUserRow({ email: 'oauth@example.com' });

      // Transaction mock
      const txQueryOauth = { findFirst: vi.fn().mockResolvedValue(undefined) }; // No existing OAuth
      const txQueryUsers = { findFirst: vi.fn().mockResolvedValue(existingUser) }; // Email match
      const txInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      const tx = {
        query: {
          oauthAccounts: txQueryOauth,
          users: txQueryUsers,
        },
        insert: vi.fn().mockReturnValue(txInsertChain),
        update: vi.fn().mockReturnValue(txUpdateChain),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      const result = await service.handleOAuthCallback('google', oauthProfile, META);

      expect(result.cookie.name).toBe('calley_session');
      // OAuth account was linked
      expect(tx.insert).toHaveBeenCalled();
      // Audit log for link
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'oauth.link',
          userId: TEST_USER_ID,
          metadata: { provider: 'google' },
        }),
      );
    });

    it('should create a new user when no existing OAuth or email match', async () => {
      const newUser = makeUserRow({
        id: 'newuser_id_12345678901234',
        email: 'oauth@example.com',
        passwordHash: null,
        name: 'OAuth User',
      });

      // Transaction mock
      const txQueryOauth = { findFirst: vi.fn().mockResolvedValue(undefined) };
      const txQueryUsers = { findFirst: vi.fn().mockResolvedValue(undefined) };
      const txInsertChainWithReturn = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([newUser]),
      };
      const txInsertChainNoReturn = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      const tx = {
        query: {
          oauthAccounts: txQueryOauth,
          users: txQueryUsers,
        },
        insert: vi
          .fn()
          .mockReturnValueOnce(txInsertChainWithReturn) // users insert
          .mockReturnValueOnce(txInsertChainNoReturn) // oauthAccounts insert
          .mockReturnValueOnce(txInsertChainNoReturn), // calendarCategories insert
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      const result = await service.handleOAuthCallback('google', oauthProfile, META);

      expect(result.cookie.name).toBe('calley_session');
      // 3 inserts: user, oauthAccount, calendarCategory
      expect(tx.insert).toHaveBeenCalledTimes(3);
      // Audit log for signup
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.signup',
          userId: 'newuser_id_12345678901234',
          metadata: { provider: 'google' },
        }),
      );
    });

    it('should throw VALIDATION_ERROR when OAuth profile has no email', async () => {
      await expect(
        service.handleOAuthCallback(
          'github',
          { providerAccountId: 'gh_123', email: null, name: 'No Email', avatarUrl: null },
          META,
        ),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'VALIDATION_ERROR',
      });

      // No session should be created
      expect(lucia.createSession).not.toHaveBeenCalled();
    });
  });

  // ─── listSessions ────────────────────────────────────────────────

  describe('listSessions', () => {
    it('should return sessions with isCurrent flag', async () => {
      const sessions = [
        makeSessionRow({ id: TEST_SESSION_ID }),
        makeSessionRow({ id: 'session_other_789' }),
      ];
      (db.query.sessions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

      const result = await service.listSessions(TEST_USER_ID, TEST_SESSION_ID);

      expect(result).toHaveLength(2);
      const currentSession = result.find((s) => s.id === TEST_SESSION_ID);
      const otherSession = result.find((s) => s.id === 'session_other_789');
      expect(currentSession?.isCurrent).toBe(true);
      expect(otherSession?.isCurrent).toBe(false);
    });
  });

  // ─── revokeSession ───────────────────────────────────────────────

  describe('revokeSession', () => {
    it('should revoke a target session that is not the current one', async () => {
      const targetSession = makeSessionRow({ id: 'session_target_123' });
      // First call from beforeEach returns [], second call for findFirst
      (db.query.sessions.findFirst as unknown as ReturnType<typeof vi.fn>) = vi.fn();

      // We need to mock db.query.sessions.findFirst directly
      // since sessions has findMany (mocked in beforeEach) but no findFirst mock set up
      // The service calls db.query.sessions.findFirst for verifying the target session
      // Let's use the query mock pattern
      const sessionsQuery = db.query.sessions as Record<string, ReturnType<typeof vi.fn>>;
      sessionsQuery.findFirst = vi.fn().mockResolvedValue(targetSession);

      await service.revokeSession(TEST_USER_ID, TEST_SESSION_ID, 'session_target_123');

      expect(lucia.invalidateSession).toHaveBeenCalledWith('session_target_123');
    });

    it('should throw VALIDATION_ERROR when trying to revoke current session', async () => {
      await expect(
        service.revokeSession(TEST_USER_ID, TEST_SESSION_ID, TEST_SESSION_ID),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Cannot revoke your current session. Use logout instead.',
      });

      expect(lucia.invalidateSession).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when target session does not exist', async () => {
      const sessionsQuery = db.query.sessions as Record<string, ReturnType<typeof vi.fn>>;
      sessionsQuery.findFirst = vi.fn().mockResolvedValue(undefined);

      await expect(
        service.revokeSession(TEST_USER_ID, TEST_SESSION_ID, 'nonexistent_session'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Session not found',
      });
    });
  });

  // ─── revokeAllOtherSessions ───────────────────────────────────────

  describe('revokeAllOtherSessions', () => {
    it('should revoke all sessions except the current one and return count', async () => {
      const otherSessions = [
        makeSessionRow({ id: 'session_other_1' }),
        makeSessionRow({ id: 'session_other_2' }),
        makeSessionRow({ id: 'session_other_3' }),
      ];
      (db.query.sessions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(otherSessions);

      const result = await service.revokeAllOtherSessions(TEST_USER_ID, TEST_SESSION_ID);

      expect(result.revokedCount).toBe(3);
      expect(lucia.invalidateSession).toHaveBeenCalledTimes(3);
      expect(lucia.invalidateSession).toHaveBeenCalledWith('session_other_1');
      expect(lucia.invalidateSession).toHaveBeenCalledWith('session_other_2');
      expect(lucia.invalidateSession).toHaveBeenCalledWith('session_other_3');
    });

    it('should return zero revokedCount when no other sessions exist', async () => {
      (db.query.sessions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.revokeAllOtherSessions(TEST_USER_ID, TEST_SESSION_ID);

      expect(result.revokedCount).toBe(0);
      expect(lucia.invalidateSession).not.toHaveBeenCalled();
    });
  });
});
