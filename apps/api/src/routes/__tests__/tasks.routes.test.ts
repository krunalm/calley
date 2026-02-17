import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock all dependencies before importing ─────────────────────────

// Mock task service
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

// Mock auth middleware
vi.mock('../../middleware/auth.middleware', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set('userId', 'testuser12345678901234567');
      c.set('session', { id: 'session123', userId: 'testuser12345678901234567' });
      await next();
    },
  ),
}));

// Mock CSRF middleware
vi.mock('../../middleware/csrf.middleware', () => ({
  doubleSubmitCsrf: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

// Mock rate limiter
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
vi.mock('../../services/category.service', () => ({ categoryService: {} }));
vi.mock('../../services/reminder.service', () => ({ reminderService: {} }));
vi.mock('../../services/search.service', () => ({ searchService: {} }));
vi.mock('../../services/sse.service', () => ({ sseService: {} }));
vi.mock('../../services/push-subscription.service', () => ({ pushSubscriptionService: {} }));

import { app } from '../../app';
import { AppError } from '../../lib/errors';
import { taskService } from '../../services/task.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_TASK_ID = 'testtask123456789012345678';
const TEST_CATEGORY_ID = 'testcategory1234567890123';

function makeTaskResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_TASK_ID,
    userId: TEST_USER_ID,
    categoryId: TEST_CATEGORY_ID,
    title: 'Test Task',
    description: null,
    dueAt: '2026-03-15T10:00:00.000Z',
    priority: 'medium',
    status: 'todo',
    completedAt: null,
    rrule: null,
    exDates: [],
    recurringTaskId: null,
    originalDate: null,
    sortOrder: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Task Routes — API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Task CRUD Flow ──────────────────────────────────────────────

  describe('Task CRUD: create → read → toggle → reorder → delete', () => {
    it('should create a task and return 201', async () => {
      const task = makeTaskResponse();
      (taskService.createTask as ReturnType<typeof vi.fn>).mockResolvedValue(task);

      const res = await app.request('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Task',
          categoryId: TEST_CATEGORY_ID,
          dueAt: '2026-03-15T10:00:00Z',
          priority: 'medium',
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.title).toBe('Test Task');
      expect(taskService.createTask).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ title: 'Test Task' }),
      );
    });

    it('should list tasks with filters', async () => {
      const tasks = [makeTaskResponse()];
      (taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(tasks);

      const res = await app.request('/tasks?status=todo');

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>[];
      expect(body).toHaveLength(1);
    });

    it('should get a single task by ID', async () => {
      const task = makeTaskResponse();
      (taskService.getTask as ReturnType<typeof vi.fn>).mockResolvedValue(task);

      const res = await app.request(`/tasks/${TEST_TASK_ID}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(TEST_TASK_ID);
      expect(taskService.getTask).toHaveBeenCalledWith(TEST_USER_ID, TEST_TASK_ID);
    });

    it('should toggle task completion', async () => {
      const toggled = makeTaskResponse({ status: 'done', completedAt: '2026-03-15T12:00:00Z' });
      (taskService.toggleTask as ReturnType<typeof vi.fn>).mockResolvedValue(toggled);

      const res = await app.request(`/tasks/${TEST_TASK_ID}/toggle`, {
        method: 'PATCH',
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.status).toBe('done');
      expect(taskService.toggleTask).toHaveBeenCalledWith(TEST_USER_ID, TEST_TASK_ID);
    });

    it('should reorder tasks', async () => {
      (taskService.reorderTasks as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request('/tasks/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [TEST_TASK_ID, 'anothertaskid12345678901234'],
        }),
      });

      expect(res.status).toBe(204);
      expect(taskService.reorderTasks).toHaveBeenCalledWith(TEST_USER_ID, [
        TEST_TASK_ID,
        'anothertaskid12345678901234',
      ]);
    });

    it('should update a task', async () => {
      const updated = makeTaskResponse({ title: 'Updated Task' });
      (taskService.updateTask as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const res = await app.request(`/tasks/${TEST_TASK_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Task' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.title).toBe('Updated Task');
    });

    it('should delete a task and return 204', async () => {
      (taskService.deleteTask as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request(`/tasks/${TEST_TASK_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(taskService.deleteTask).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_TASK_ID,
        undefined,
        undefined,
      );
    });
  });

  // ─── Bulk Operations ──────────────────────────────────────────────

  describe('Bulk operations', () => {
    it('should bulk complete tasks', async () => {
      (taskService.bulkComplete as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const res = await app.request('/tasks/bulk-complete', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ['bulktaskid01234567890123', 'bulktaskid02345678901234', 'bulktaskid03456789012345'],
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { count: number };
      expect(body.count).toBe(3);
    });

    it('should bulk delete tasks', async () => {
      (taskService.bulkDelete as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      const res = await app.request('/tasks/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ['bulktaskid01234567890123', 'bulktaskid02345678901234'],
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { count: number };
      expect(body.count).toBe(2);
    });
  });

  // ─── Recurring Task Scope ─────────────────────────────────────────

  describe('Recurring task operations', () => {
    it('should pass scope and instanceDate for task update', async () => {
      const updated = makeTaskResponse();
      (taskService.updateTask as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      await app.request(`/tasks/${TEST_TASK_ID}?scope=instance&instanceDate=2026-03-20T10:00:00Z`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Changed Instance' }),
      });

      expect(taskService.updateTask).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_TASK_ID,
        expect.objectContaining({ title: 'Changed Instance' }),
        'instance',
        '2026-03-20T10:00:00Z',
      );
    });

    it('should pass scope for task deletion', async () => {
      (taskService.deleteTask as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await app.request(`/tasks/${TEST_TASK_ID}?scope=all`, { method: 'DELETE' });

      expect(taskService.deleteTask).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_TASK_ID,
        'all',
        undefined,
      );
    });
  });

  // ─── Error Cases ──────────────────────────────────────────────────

  describe('Error handling', () => {
    it('should return 404 for non-existent task', async () => {
      (taskService.getTask as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Task not found'),
      );

      const res = await app.request(`/tasks/${TEST_TASK_ID}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for missing title on create', async () => {
      const res = await app.request('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: TEST_CATEGORY_ID,
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
