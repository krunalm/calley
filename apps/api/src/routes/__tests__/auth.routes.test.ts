import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock all dependencies before importing ─────────────────────────

// Mock auth service
vi.mock('../../services/auth.service', () => {
  const mockAuthService = {
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    getMe: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllOtherSessions: vi.fn(),
    listOAuthAccounts: vi.fn(),
    unlinkOAuthAccount: vi.fn(),
    handleOAuthCallback: vi.fn(),
  };
  return { authService: mockAuthService };
});

// Mock auth middleware
vi.mock('../../middleware/auth.middleware', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set('userId', 'testuser12345678901234567');
      c.set('session', { id: 'testsession1234567890123456', userId: 'testuser12345678901234567' });
      await next();
    },
  ),
}));

// Mock CSRF middleware to pass through
vi.mock('../../middleware/csrf.middleware', () => ({
  doubleSubmitCsrf: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

// Mock rate limiter to pass through
vi.mock('../../middleware/rate-limit.middleware', () => ({
  rateLimit: () =>
    vi.fn(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    }),
}));

// Mock security headers
vi.mock('../../middleware/security-headers.middleware', () => ({
  securityHeaders: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

// Mock CORS
vi.mock('../../middleware/cors.middleware', () => ({
  createCorsMiddleware: () =>
    vi.fn(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    }),
}));

// Mock request ID
vi.mock('../../middleware/request-id.middleware', () => ({
  requestId: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

// Mock request logger
vi.mock('../../middleware/logger.middleware', () => ({
  requestLogger: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

// Mock error handler
vi.mock('../../middleware/error-handler.middleware', () => ({
  errorHandler: vi.fn((err: Error & { statusCode?: number; code?: string; details?: unknown }) => {
    const status = err.statusCode || 500;
    return new Response(
      JSON.stringify({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message,
          details: err.details,
        },
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  }),
}));

// Mock DB
vi.mock('../../db', () => ({
  db: {},
  client: {},
}));

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock redis
vi.mock('../../lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), incr: vi.fn(), expire: vi.fn(), del: vi.fn() },
}));

// Mock lucia
vi.mock('../../lib/lucia', () => ({
  lucia: {
    createSession: vi.fn(),
    createBlankSessionCookie: vi.fn().mockReturnValue({
      serialize: () => 'session=; Max-Age=0',
    }),
    validateSession: vi.fn(),
  },
}));

// Mock CSRF lib
vi.mock('../../lib/csrf', () => ({
  generateCsrfToken: vi.fn().mockReturnValue('mock-csrf-token'),
  setCsrfCookie: vi.fn(),
  clearCsrfCookie: vi.fn(),
}));

// Mock OAuth
vi.mock('../../lib/oauth', () => ({
  googleOAuth: {
    createAuthorizationURL: vi
      .fn()
      .mockReturnValue(new URL('https://accounts.google.com/o/oauth2/v2/auth')),
    validateAuthorizationCode: vi.fn(),
  },
  githubOAuth: {
    createAuthorizationURL: vi
      .fn()
      .mockReturnValue(new URL('https://github.com/login/oauth/authorize')),
    validateAuthorizationCode: vi.fn(),
  },
}));

// Mock arctic
vi.mock('arctic', () => ({
  generateState: vi.fn().mockReturnValue('mock-state'),
  generateCodeVerifier: vi.fn().mockReturnValue('mock-code-verifier'),
}));

// Mock event service (needed by app.ts route registration)
vi.mock('../../services/event.service', () => ({
  eventService: {},
}));

// Mock task service
vi.mock('../../services/task.service', () => ({
  taskService: {},
}));

// Mock category service
vi.mock('../../services/category.service', () => ({
  categoryService: {},
}));

// Mock reminder service
vi.mock('../../services/reminder.service', () => ({
  reminderService: {},
}));

// Mock search service
vi.mock('../../services/search.service', () => ({
  searchService: {},
}));

// Mock SSE service
vi.mock('../../services/sse.service', () => ({
  sseService: {},
}));

// Mock push subscription service
vi.mock('../../services/push-subscription.service', () => ({
  pushSubscriptionService: {},
}));

import { app } from '../../app';
import { AppError } from '../../lib/errors';
import { authService } from '../../services/auth.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_SESSION_ID = 'testsession1234567890123456';

function makeUserResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_USER_ID,
    email: 'test@example.com',
    name: 'Test User',
    timezone: 'America/New_York',
    weekStart: 'monday',
    timeFormat: '12h',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMockCookie() {
  return {
    serialize: () => 'session=mock-session-token; Path=/; HttpOnly; Secure; SameSite=Lax',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Auth Routes — API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Signup → Login → Protected Access → Logout Flow ────────────

  describe('Auth flow: signup → login → protected access → logout', () => {
    it('should complete signup and return 201 with user', async () => {
      const user = makeUserResponse();
      (authService.signup as ReturnType<typeof vi.fn>).mockResolvedValue({
        user,
        cookie: makeMockCookie(),
      });

      const res = await app.request('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecureP@ss123!',
          name: 'Test User',
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(TEST_USER_ID);
      expect(body.email).toBe('test@example.com');
      expect(authService.signup).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          name: 'Test User',
        }),
        expect.any(Object),
      );
    });

    it('should complete login and return user', async () => {
      const user = makeUserResponse();
      (authService.login as ReturnType<typeof vi.fn>).mockResolvedValue({
        user,
        cookie: makeMockCookie(),
      });

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecureP@ss123!',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.email).toBe('test@example.com');
      expect(authService.login).toHaveBeenCalled();
    });

    it('should access protected route GET /auth/me', async () => {
      const user = makeUserResponse();
      (authService.getMe as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const res = await app.request('/auth/me');

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(TEST_USER_ID);
      expect(authService.getMe).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('should complete logout and return 204', async () => {
      (authService.logout as ReturnType<typeof vi.fn>).mockResolvedValue({
        cookie: makeMockCookie(),
      });

      const res = await app.request('/auth/logout', {
        method: 'POST',
      });

      expect(res.status).toBe(204);
      expect(authService.logout).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        TEST_USER_ID,
        expect.any(Object),
      );
    });
  });

  // ─── OAuth Mock Flows ────────────────────────────────────────────

  describe('Auth flow: OAuth mock (Google + GitHub)', () => {
    it('should redirect to Google OAuth on GET /auth/oauth/google', async () => {
      const res = await app.request('/auth/oauth/google');

      expect(res.status).toBe(302);
      const location = res.headers.get('Location');
      expect(location).toContain('accounts.google.com');
    });

    it('should redirect to GitHub OAuth on GET /auth/oauth/github', async () => {
      const res = await app.request('/auth/oauth/github');

      expect(res.status).toBe(302);
      const location = res.headers.get('Location');
      expect(location).toContain('github.com');
    });
  });

  // ─── Password Reset Flow ─────────────────────────────────────────

  describe('Auth flow: password reset', () => {
    it('should accept forgot-password request without revealing email existence', async () => {
      (authService.forgotPassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { message: string };
      expect(body.message).toContain('If that email is registered');
      expect(authService.forgotPassword).toHaveBeenCalled();
    });

    it('should accept reset-password with valid token', async () => {
      (authService.resetPassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-reset-token-abc123',
          password: 'NewSecureP@ss456!',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { message: string };
      expect(body.message).toContain('Password has been reset');
      expect(authService.resetPassword).toHaveBeenCalled();
    });
  });

  // ─── Account Lockout ──────────────────────────────────────────────

  describe('Auth flow: account lockout after failed attempts', () => {
    it('should return 423 LOCKED when account is locked', async () => {
      (authService.login as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(423, 'LOCKED', 'Account is locked. Please try again after 30 minutes.'),
      );

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'locked@example.com',
          password: 'WrongPass123!',
        }),
      });

      expect(res.status).toBe(423);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('LOCKED');
    });

    it('should return generic error on invalid credentials (no user enumeration)', async () => {
      (authService.login as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(401, 'UNAUTHORIZED', 'Invalid email or password'),
      );

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'WrongPass123!',
        }),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
      // Should not reveal whether the email exists
      expect(body.error.message).not.toContain('not found');
    });
  });

  // ─── Profile & Password Management ───────────────────────────────

  describe('Profile management', () => {
    it('should update user profile via PATCH /auth/me', async () => {
      const updated = makeUserResponse({ name: 'Updated Name', timezone: 'Europe/London' });
      (authService.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const res = await app.request('/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name', timezone: 'Europe/London' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.name).toBe('Updated Name');
      expect(authService.updateProfile).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ name: 'Updated Name', timezone: 'Europe/London' }),
      );
    });

    it('should change password via PATCH /auth/me/password', async () => {
      (authService.changePassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request('/auth/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'OldPass123!',
          newPassword: 'NewSecureP@ss456!',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { message: string };
      expect(body.message).toContain('Password changed');
    });
  });

  // ─── Session Management ───────────────────────────────────────────

  describe('Session management', () => {
    it('should list active sessions', async () => {
      const sessions = [
        {
          id: TEST_SESSION_ID,
          userAgent: 'Chrome',
          isCurrent: true,
          lastActiveAt: '2026-02-16T00:00:00Z',
        },
        {
          id: 'other-session-id',
          userAgent: 'Firefox',
          isCurrent: false,
          lastActiveAt: '2026-02-15T00:00:00Z',
        },
      ];
      (authService.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

      const res = await app.request('/auth/sessions');

      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      expect(body).toHaveLength(2);
      expect(body[0].isCurrent).toBe(true);
    });

    it('should revoke a specific session', async () => {
      (authService.revokeSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request('/auth/sessions/other-session-id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(authService.revokeSession).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_SESSION_ID,
        'other-session-id',
      );
    });

    it('should revoke all other sessions', async () => {
      (authService.revokeAllOtherSessions as ReturnType<typeof vi.fn>).mockResolvedValue({
        revokedCount: 3,
      });

      const res = await app.request('/auth/sessions', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { revokedCount: number };
      expect(body.revokedCount).toBe(3);
    });
  });

  // ─── Account Deletion ────────────────────────────────────────────

  describe('Account deletion', () => {
    it('should delete account via DELETE /auth/me', async () => {
      (authService.deleteAccount as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request('/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'SecureP@ss123!' }),
      });

      expect(res.status).toBe(204);
      expect(authService.deleteAccount).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ password: 'SecureP@ss123!' }),
        expect.any(Object),
      );
    });
  });

  // ─── Input Validation ─────────────────────────────────────────────

  describe('Input validation', () => {
    it('should reject signup with missing email', async () => {
      const res = await app.request('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'SecureP@ss123!', name: 'Test' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login with missing password', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject forgot-password with invalid email format', async () => {
      const res = await app.request('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject signup with invalid JSON body', async () => {
      const res = await app.request('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      expect(res.status).toBe(400);
    });
  });

  // ─── OAuth Account Management ─────────────────────────────────────

  describe('OAuth account management', () => {
    it('should list linked OAuth accounts', async () => {
      const accounts = [{ id: 'oauth123', provider: 'google', email: 'test@gmail.com' }];
      (authService.listOAuthAccounts as ReturnType<typeof vi.fn>).mockResolvedValue(accounts);

      const res = await app.request('/auth/oauth/accounts');

      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      expect(body[0].provider).toBe('google');
    });
  });
});
