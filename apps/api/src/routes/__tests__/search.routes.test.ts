import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock all dependencies before importing ─────────────────────────

vi.mock('../../services/search.service', () => {
  const mockSearchService = {
    search: vi.fn(),
  };
  return { searchService: mockSearchService };
});

vi.mock('../../middleware/auth.middleware', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set('userId', 'testuser12345678901234567');
      c.set('session', { id: 'session123', userId: 'testuser12345678901234567' });
      await next();
    },
  ),
}));

vi.mock('../../middleware/csrf.middleware', () => ({
  doubleSubmitCsrf: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock('../../middleware/rate-limit.middleware', () => ({
  rateLimit: () =>
    vi.fn(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    }),
}));

vi.mock('../../middleware/security-headers.middleware', () => ({
  securityHeaders: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock('../../middleware/cors.middleware', () => ({
  createCorsMiddleware: () =>
    vi.fn(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    }),
}));

vi.mock('../../middleware/request-id.middleware', () => ({
  requestId: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock('../../middleware/logger.middleware', () => ({
  requestLogger: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

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

vi.mock('../../db', () => ({ db: {}, client: {} }));
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), incr: vi.fn(), expire: vi.fn(), del: vi.fn() },
}));
vi.mock('../../lib/lucia', () => ({
  lucia: { createSession: vi.fn(), createBlankSessionCookie: vi.fn(), validateSession: vi.fn() },
}));
vi.mock('../../services/auth.service', () => ({ authService: {} }));
vi.mock('../../lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  setCsrfCookie: vi.fn(),
  clearCsrfCookie: vi.fn(),
}));
vi.mock('../../lib/oauth', () => ({ googleOAuth: {}, githubOAuth: {} }));
vi.mock('../../services/event.service', () => ({ eventService: {} }));
vi.mock('../../services/task.service', () => ({ taskService: {} }));
vi.mock('../../services/category.service', () => ({ categoryService: {} }));
vi.mock('../../services/reminder.service', () => ({ reminderService: {} }));
vi.mock('../../services/sse.service', () => ({ sseService: {} }));
vi.mock('../../services/push-subscription.service', () => ({ pushSubscriptionService: {} }));

import { app } from '../../app';
import { searchService } from '../../services/search.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';

// ─── Tests ──────────────────────────────────────────────────────────

describe('Search Routes — API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Search Flow ───────────────────────────────────────────────

  describe('Search: query → verify results', () => {
    it('should search and return events + tasks', async () => {
      const results = {
        events: [
          {
            id: 'event123456789012345678',
            title: 'Team Meeting',
            type: 'event',
            startAt: '2026-03-15T10:00:00.000Z',
          },
        ],
        tasks: [
          {
            id: 'task1234567890123456789',
            title: 'Meeting notes',
            type: 'task',
            dueAt: '2026-03-15T17:00:00.000Z',
          },
        ],
      };
      (searchService.search as ReturnType<typeof vi.fn>).mockResolvedValue(results);

      const res = await app.request('/search?q=meeting');

      expect(res.status).toBe(200);
      const body = (await res.json()) as { events: unknown[]; tasks: unknown[] };
      expect(body.events).toHaveLength(1);
      expect(body.tasks).toHaveLength(1);
      // Default limit is 20 (from searchQuerySchema)
      expect(searchService.search).toHaveBeenCalledWith(TEST_USER_ID, 'meeting', 20);
    });

    it('should pass limit parameter to search service', async () => {
      (searchService.search as ReturnType<typeof vi.fn>).mockResolvedValue({
        events: [],
        tasks: [],
      });

      await app.request('/search?q=test&limit=5');

      expect(searchService.search).toHaveBeenCalledWith(TEST_USER_ID, 'test', 5);
    });

    it('should return empty results for no matches', async () => {
      (searchService.search as ReturnType<typeof vi.fn>).mockResolvedValue({
        events: [],
        tasks: [],
      });

      const res = await app.request('/search?q=nonexistentquery');

      expect(res.status).toBe(200);
      const body = (await res.json()) as { events: unknown[]; tasks: unknown[] };
      expect(body.events).toHaveLength(0);
      expect(body.tasks).toHaveLength(0);
    });
  });

  // ─── Validation ────────────────────────────────────────────────

  describe('Input validation', () => {
    it('should return 400 for missing query parameter', async () => {
      const res = await app.request('/search');

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty query string', async () => {
      const res = await app.request('/search?q=');

      expect(res.status).toBe(400);
    });

    it('should return 400 for query shorter than minimum length', async () => {
      const res = await app.request('/search?q=a');

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
