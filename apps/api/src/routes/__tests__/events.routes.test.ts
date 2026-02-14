import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock all dependencies before importing ─────────────────────────

// Mock the event service
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

// Mock auth middleware to always set a userId
vi.mock('../../middleware/auth.middleware', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
      c.set('userId', 'testuser12345678901234567');
      c.set('session', { id: 'session123', userId: 'testuser12345678901234567' });
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

// Mock DB (needed by app.ts imports)
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
    createBlankSessionCookie: vi.fn(),
    validateSession: vi.fn(),
  },
}));

// Mock auth service
vi.mock('../../services/auth.service', () => ({
  authService: {},
}));

// Mock CSRF lib
vi.mock('../../lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  setCsrfCookie: vi.fn(),
  clearCsrfCookie: vi.fn(),
}));

// Mock OAuth
vi.mock('../../lib/oauth', () => ({
  googleOAuth: {},
  githubOAuth: {},
}));

import { app } from '../../app';
import { AppError } from '../../lib/errors';
import { eventService } from '../../services/event.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_EVENT_ID = 'testevent12345678901234567';
const TEST_CATEGORY_ID = 'testcategory1234567890123';

function makeEventResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_EVENT_ID,
    userId: TEST_USER_ID,
    categoryId: TEST_CATEGORY_ID,
    title: 'Test Event',
    description: null,
    location: null,
    startAt: '2026-03-15T10:00:00.000Z',
    endAt: '2026-03-15T11:00:00.000Z',
    isAllDay: false,
    color: null,
    visibility: 'private',
    rrule: null,
    exDates: [],
    recurringEventId: null,
    originalDate: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Event Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /events ──────────────────────────────────────────────

  describe('GET /events', () => {
    it('should return events for a date range', async () => {
      const events = [makeEventResponse()];
      (eventService.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue(events);

      const res = await app.request('/events?start=2026-03-01T00:00:00Z&end=2026-03-31T23:59:59Z');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(TEST_EVENT_ID);
      expect(eventService.listEvents).toHaveBeenCalledWith(
        TEST_USER_ID,
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
        undefined,
      );
    });

    it('should pass categoryIds filter when provided', async () => {
      (eventService.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await app.request(
        `/events?start=2026-03-01T00:00:00Z&end=2026-03-31T23:59:59Z&categoryIds=${TEST_CATEGORY_ID}`,
      );

      expect(eventService.listEvents).toHaveBeenCalledWith(
        TEST_USER_ID,
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
        [TEST_CATEGORY_ID],
      );
    });

    it('should return 400 for missing required query params', async () => {
      const res = await app.request('/events');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid date format', async () => {
      const res = await app.request('/events?start=not-a-date&end=2026-03-31T23:59:59Z');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─── POST /events ─────────────────────────────────────────────

  describe('POST /events', () => {
    it('should create an event and return 201', async () => {
      const created = makeEventResponse({ title: 'New Event' });
      (eventService.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const res = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Event',
          startAt: '2026-03-15T10:00:00Z',
          endAt: '2026-03-15T11:00:00Z',
          categoryId: TEST_CATEGORY_ID,
          isAllDay: false,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe('New Event');
      expect(eventService.createEvent).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({
          title: 'New Event',
          categoryId: TEST_CATEGORY_ID,
        }),
      );
    });

    it('should return 400 for missing title', async () => {
      const res = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: '2026-03-15T10:00:00Z',
          endAt: '2026-03-15T11:00:00Z',
          categoryId: TEST_CATEGORY_ID,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 for missing categoryId', async () => {
      const res = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test',
          startAt: '2026-03-15T10:00:00Z',
          endAt: '2026-03-15T11:00:00Z',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when end is before start', async () => {
      const res = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test',
          startAt: '2026-03-15T14:00:00Z',
          endAt: '2026-03-15T13:00:00Z',
          categoryId: TEST_CATEGORY_ID,
          isAllDay: false,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /events/:id ──────────────────────────────────────────

  describe('GET /events/:id', () => {
    it('should return a single event', async () => {
      const event = makeEventResponse();
      (eventService.getEvent as ReturnType<typeof vi.fn>).mockResolvedValue(event);

      const res = await app.request(`/events/${TEST_EVENT_ID}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(TEST_EVENT_ID);
      expect(eventService.getEvent).toHaveBeenCalledWith(TEST_USER_ID, TEST_EVENT_ID);
    });

    it('should return 404 for non-existent event', async () => {
      (eventService.getEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Event not found'),
      );

      const res = await app.request(`/events/${TEST_EVENT_ID}`);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── PATCH /events/:id ────────────────────────────────────────

  describe('PATCH /events/:id', () => {
    it('should update an event', async () => {
      const updated = makeEventResponse({ title: 'Updated' });
      (eventService.updateEvent as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const res = await app.request(`/events/${TEST_EVENT_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Updated');
    });

    it('should pass scope and instanceDate to service', async () => {
      const updated = makeEventResponse();
      (eventService.updateEvent as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      await app.request(
        `/events/${TEST_EVENT_ID}?scope=instance&instanceDate=2026-03-20T10:00:00Z`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Changed Instance' }),
        },
      );

      expect(eventService.updateEvent).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_EVENT_ID,
        expect.objectContaining({ title: 'Changed Instance' }),
        'instance',
        '2026-03-20T10:00:00Z',
      );
    });

    it('should return 400 for invalid scope value', async () => {
      const res = await app.request(`/events/${TEST_EVENT_ID}?scope=invalid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ─── DELETE /events/:id ───────────────────────────────────────

  describe('DELETE /events/:id', () => {
    it('should delete an event and return 204', async () => {
      (eventService.deleteEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await app.request(`/events/${TEST_EVENT_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(eventService.deleteEvent).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_EVENT_ID,
        undefined,
        undefined,
      );
    });

    it('should pass scope for recurring event deletion', async () => {
      (eventService.deleteEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await app.request(`/events/${TEST_EVENT_ID}?scope=all`, { method: 'DELETE' });

      expect(eventService.deleteEvent).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_EVENT_ID,
        'all',
        undefined,
      );
    });

    it('should return 404 for non-existent event', async () => {
      (eventService.deleteEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Event not found'),
      );

      const res = await app.request(`/events/${TEST_EVENT_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /events/:id/duplicate ───────────────────────────────

  describe('POST /events/:id/duplicate', () => {
    it('should duplicate an event and return 201', async () => {
      const duplicate = makeEventResponse({
        id: 'duplicate12345678901234567',
        rrule: null,
      });
      (eventService.duplicateEvent as ReturnType<typeof vi.fn>).mockResolvedValue(duplicate);

      const res = await app.request(`/events/${TEST_EVENT_ID}/duplicate`, {
        method: 'POST',
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('duplicate12345678901234567');
      expect(eventService.duplicateEvent).toHaveBeenCalledWith(TEST_USER_ID, TEST_EVENT_ID);
    });
  });

  // ─── GET /events/:id/ics ─────────────────────────────────────

  describe('GET /events/:id/ics', () => {
    it('should return ICS content with correct headers', async () => {
      const icsContent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
      (eventService.exportIcs as ReturnType<typeof vi.fn>).mockResolvedValue(icsContent);

      const res = await app.request(`/events/${TEST_EVENT_ID}/ics`);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/calendar');
      expect(res.headers.get('Content-Disposition')).toContain(
        `attachment; filename="event-${TEST_EVENT_ID}.ics"`,
      );

      const body = await res.text();
      expect(body).toContain('BEGIN:VCALENDAR');
    });
  });
});
