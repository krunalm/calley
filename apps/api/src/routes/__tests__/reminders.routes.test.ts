import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock all dependencies before importing ─────────────────────────

vi.mock('../../services/reminder.service', () => {
  const mockReminderService = {
    listReminders: vi.fn(),
    createReminder: vi.fn(),
    deleteReminder: vi.fn(),
  };
  return { reminderService: mockReminderService };
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
vi.mock('../../services/search.service', () => ({ searchService: {} }));
vi.mock('../../services/sse.service', () => ({ sseService: {} }));
vi.mock('../../services/push-subscription.service', () => ({ pushSubscriptionService: {} }));

import { app } from '../../app';
import { AppError } from '../../lib/errors';
import { reminderService } from '../../services/reminder.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_REMINDER_ID = 'testreminder12345678901234';
const TEST_EVENT_ID = 'testevent12345678901234567';

function makeReminderResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_REMINDER_ID,
    userId: TEST_USER_ID,
    itemType: 'event',
    itemId: TEST_EVENT_ID,
    minutesBefore: 15,
    method: 'push',
    triggerAt: '2026-03-15T09:45:00.000Z',
    sentAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Reminder Routes — API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Reminder CRUD Flow ────────────────────────────────────────

  describe('Reminder: create → list → delete', () => {
    it('should create a reminder and return 201', async () => {
      const reminder = makeReminderResponse();
      (reminderService.createReminder as ReturnType<typeof vi.fn>).mockResolvedValue(reminder);

      const res = await app.request('/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'event',
          itemId: TEST_EVENT_ID,
          minutesBefore: 15,
          method: 'push',
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.itemType).toBe('event');
      expect(body.minutesBefore).toBe(15);
      expect(reminderService.createReminder).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({
          itemType: 'event',
          itemId: TEST_EVENT_ID,
          minutesBefore: 15,
        }),
      );
    });

    it('should list reminders for an event', async () => {
      const reminders = [makeReminderResponse()];
      (reminderService.listReminders as ReturnType<typeof vi.fn>).mockResolvedValue(reminders);

      const res = await app.request(`/reminders?itemType=event&itemId=${TEST_EVENT_ID}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>[];
      expect(body).toHaveLength(1);
      expect(body[0].itemType).toBe('event');
    });

    it('should delete a reminder and return 204', async () => {
      (reminderService.deleteReminder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request(`/reminders/${TEST_REMINDER_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(reminderService.deleteReminder).toHaveBeenCalledWith(TEST_USER_ID, TEST_REMINDER_ID);
    });
  });

  // ─── BullMQ Job Scheduling ───────────────────────────────────────
  //
  // NOTE: reminderService is fully mocked at the route level, so these tests
  // cannot verify that BullMQ jobs are actually enqueued/cancelled. The
  // job-scheduling side effects (enqueue on create, cancel on delete) are
  // tested at the service layer in services/__tests__/reminder.service.test.ts
  // which mocks the BullMQ Queue directly and asserts .add() / .remove() calls.
  // These route-level tests verify that the HTTP layer correctly delegates to
  // the service and returns the expected status codes / response shapes.

  describe('BullMQ job scheduling delegation', () => {
    it('should call createReminder which internally schedules a BullMQ job', async () => {
      const reminder = makeReminderResponse();
      (reminderService.createReminder as ReturnType<typeof vi.fn>).mockResolvedValue(reminder);

      const res = await app.request('/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'event',
          itemId: TEST_EVENT_ID,
          minutesBefore: 15,
          method: 'push',
        }),
      });

      expect(res.status).toBe(201);
      // Service was called — it internally enqueues the BullMQ delayed job
      expect(reminderService.createReminder).toHaveBeenCalledTimes(1);
    });

    it('should call deleteReminder which internally cancels the BullMQ job', async () => {
      (reminderService.deleteReminder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request(`/reminders/${TEST_REMINDER_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      // Service was called — it internally removes the BullMQ job
      expect(reminderService.deleteReminder).toHaveBeenCalledTimes(1);
      expect(reminderService.deleteReminder).toHaveBeenCalledWith(TEST_USER_ID, TEST_REMINDER_ID);
    });
  });

  // ─── Error Cases ───────────────────────────────────────────────

  describe('Error handling', () => {
    it('should return 404 for non-existent reminder', async () => {
      (reminderService.deleteReminder as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Reminder not found'),
      );

      const res = await app.request(`/reminders/${TEST_REMINDER_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for missing required fields on create', async () => {
      const res = await app.request('/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid itemType', async () => {
      const res = await app.request('/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'invalid',
          itemId: TEST_EVENT_ID,
          minutesBefore: 15,
          method: 'push',
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
