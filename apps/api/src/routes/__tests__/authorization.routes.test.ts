import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock all dependencies before importing ─────────────────────────

// Mock services with controlled behavior
vi.mock('../../services/event.service', () => {
  const mockEventService = {
    listEvents: vi.fn(),
    getEvent: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    duplicateEvent: vi.fn(),
    exportIcs: vi.fn(),
  };
  return { eventService: mockEventService };
});

vi.mock('../../services/task.service', () => {
  const mockTaskService = {
    listTasks: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    toggleTask: vi.fn(),
    reorderTasks: vi.fn(),
    bulkComplete: vi.fn(),
    bulkDelete: vi.fn(),
  };
  return { taskService: mockTaskService };
});

vi.mock('../../services/category.service', () => {
  const mockCategoryService = {
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
  return { categoryService: mockCategoryService };
});

// Auth middleware — default passes through with test user
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
vi.mock('../../services/reminder.service', () => ({ reminderService: {} }));
vi.mock('../../services/search.service', () => ({ searchService: {} }));
vi.mock('../../services/sse.service', () => ({ sseService: {} }));
vi.mock('../../services/push-subscription.service', () => ({ pushSubscriptionService: {} }));

import { app } from '../../app';
import { AppError } from '../../lib/errors';
import { authMiddleware } from '../../middleware/auth.middleware';
import { categoryService } from '../../services/category.service';
import { eventService } from '../../services/event.service';
import { taskService } from '../../services/task.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const OTHER_USER_EVENT_ID = 'otheruserevt12345678901234';
const OTHER_USER_TASK_ID = 'otherusertsk12345678901234';
const OTHER_USER_CAT_ID = 'otherusercat12345678901234';

// ─── Tests ──────────────────────────────────────────────────────────

describe('Authorization — API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Authorization: Accessing another user's resources ────────

  describe("Authorization: attempt to access another user's resource → 404", () => {
    it("should return 404 when accessing another user's event", async () => {
      // Service enforces ownership by returning NOT_FOUND for events not owned by user
      (eventService.getEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Event not found'),
      );

      const res = await app.request(`/events/${OTHER_USER_EVENT_ID}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
      // Verify service was called with the requesting user's ID, not the resource owner
      expect(eventService.getEvent).toHaveBeenCalledWith(TEST_USER_ID, OTHER_USER_EVENT_ID);
    });

    it("should return 404 when accessing another user's task", async () => {
      (taskService.getTask as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Task not found'),
      );

      const res = await app.request(`/tasks/${OTHER_USER_TASK_ID}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
      expect(taskService.getTask).toHaveBeenCalledWith(TEST_USER_ID, OTHER_USER_TASK_ID);
    });

    it("should return 404 when updating another user's event", async () => {
      (eventService.updateEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Event not found'),
      );

      const res = await app.request(`/events/${OTHER_USER_EVENT_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Hacked Title' }),
      });

      expect(res.status).toBe(404);
    });

    it("should return 404 when deleting another user's task", async () => {
      (taskService.deleteTask as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Task not found'),
      );

      const res = await app.request(`/tasks/${OTHER_USER_TASK_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });

    it("should return 404 when deleting another user's category", async () => {
      (categoryService.deleteCategory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Category not found'),
      );

      const res = await app.request(`/categories/${OTHER_USER_CAT_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  // ─── Unauthenticated Access ───────────────────────────────────

  describe('Unauthenticated access to protected routes', () => {
    it('should return 401 when auth middleware rejects', async () => {
      // Override auth middleware to simulate unauthenticated request
      (authMiddleware as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (c: { json: (body: unknown, status: number) => Response }) => {
          return c.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
        },
      );

      const res = await app.request('/events?start=2026-03-01T00:00:00Z&end=2026-03-31T23:59:59Z');

      expect(res.status).toBe(401);
    });
  });

  // ─── Input Validation ─────────────────────────────────────────

  describe('Input validation: send invalid data → verify 400 with details', () => {
    it('should return 400 with details for invalid event data', async () => {
      const res = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields: title, startAt, endAt, categoryId
          description: 'Some description',
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: { code: string; details: Array<{ path: string[]; message: string }> };
      };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toBeDefined();
      expect(body.error.details.length).toBeGreaterThan(0);
    });

    it('should return 400 with details for invalid task data', async () => {
      const res = await app.request('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required title
          priority: 'invalid-priority-value',
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string; details: unknown[] } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid JSON body', async () => {
      const res = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid query parameters on event listing', async () => {
      const res = await app.request('/events?start=not-a-date&end=also-not-a-date');

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for title exceeding max length', async () => {
      const longTitle = 'A'.repeat(300); // Exceeds 200 char limit
      const res = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: longTitle,
          startAt: '2026-03-15T10:00:00Z',
          endAt: '2026-03-15T11:00:00Z',
          categoryId: 'testcategory1234567890123',
          isAllDay: false,
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
