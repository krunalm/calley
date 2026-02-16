import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock all dependencies before importing ─────────────────────────

vi.mock('../../services/category.service', () => {
  const mockCategoryService = {
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
  return { categoryService: mockCategoryService };
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
vi.mock('../../services/reminder.service', () => ({ reminderService: {} }));
vi.mock('../../services/search.service', () => ({ searchService: {} }));
vi.mock('../../services/sse.service', () => ({ sseService: {} }));
vi.mock('../../services/push-subscription.service', () => ({ pushSubscriptionService: {} }));

import { app } from '../../app';
import { AppError } from '../../lib/errors';
import { categoryService } from '../../services/category.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_CATEGORY_ID = 'testcategory1234567890123';
const DEFAULT_CATEGORY_ID = 'defaultcategory123456789012';

function makeCategoryResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CATEGORY_ID,
    userId: TEST_USER_ID,
    name: 'Work',
    color: '#3b82f6',
    isDefault: false,
    visible: true,
    sortOrder: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Category Routes — API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Category CRUD Flow ─────────────────────────────────────────

  describe('Category CRUD: create → list → update → delete', () => {
    it('should create a category and return 201', async () => {
      const category = makeCategoryResponse();
      (categoryService.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue(category);

      const res = await app.request('/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Work',
          color: '#3b82f6',
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.name).toBe('Work');
      expect(body.color).toBe('#3b82f6');
      expect(categoryService.createCategory).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ name: 'Work', color: '#3b82f6' }),
      );
    });

    it('should list all categories', async () => {
      const categories = [
        makeCategoryResponse({ id: DEFAULT_CATEGORY_ID, name: 'Default', isDefault: true }),
        makeCategoryResponse({ name: 'Work' }),
        makeCategoryResponse({ id: 'personal123456789012345', name: 'Personal', color: '#10b981' }),
      ];
      (categoryService.listCategories as ReturnType<typeof vi.fn>).mockResolvedValue(categories);

      const res = await app.request('/categories');

      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      expect(body).toHaveLength(3);
      expect(body[0].isDefault).toBe(true);
    });

    it('should update a category', async () => {
      const updated = makeCategoryResponse({ name: 'Updated Work', color: '#ef4444' });
      (categoryService.updateCategory as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const res = await app.request(`/categories/${TEST_CATEGORY_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Work', color: '#ef4444' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.name).toBe('Updated Work');
      expect(body.color).toBe('#ef4444');
    });

    it('should delete a category and return 204', async () => {
      (categoryService.deleteCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request(`/categories/${TEST_CATEGORY_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(categoryService.deleteCategory).toHaveBeenCalledWith(TEST_USER_ID, TEST_CATEGORY_ID);
    });
  });

  // ─── Category Reassignment ─────────────────────────────────────

  describe('Category deletion with reassignment', () => {
    it('should handle deletion of category that has events assigned (service handles reassignment)', async () => {
      (categoryService.deleteCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request(`/categories/${TEST_CATEGORY_ID}`, {
        method: 'DELETE',
      });

      // Route returns 204, service internally reassigns events/tasks to default category
      expect(res.status).toBe(204);
      expect(categoryService.deleteCategory).toHaveBeenCalledWith(TEST_USER_ID, TEST_CATEGORY_ID);
    });
  });

  // ─── Error Cases ───────────────────────────────────────────────

  describe('Error handling', () => {
    it('should return 404 for non-existent category', async () => {
      (categoryService.updateCategory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Category not found'),
      );

      const res = await app.request(`/categories/${TEST_CATEGORY_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for missing required fields on create', async () => {
      const res = await app.request('/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 for duplicate category name', async () => {
      (categoryService.createCategory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(409, 'CONFLICT', 'A category with this name already exists'),
      );

      const res = await app.request('/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Duplicate', color: '#000000' }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('CONFLICT');
    });
  });
});
