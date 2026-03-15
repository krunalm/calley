import { Hono } from 'hono';

import {
  createEventSchema,
  eventIdParamSchema,
  eventScopeQuerySchema,
  listEventsQuerySchema,
  updateEventSchema,
} from '@calley/shared';

import { authMiddleware } from '../middleware/auth.middleware';
import { doubleSubmitCsrf } from '../middleware/csrf.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { validate } from '../middleware/validate.middleware';
import { eventService } from '../services/event.service';

import type { AppVariables } from '../types/hono';
import type {
  CreateEventInput,
  EventScopeQuery,
  ListEventsQuery,
  UpdateEventInput,
} from '@calley/shared';

const eventsRouter = new Hono<{ Variables: AppVariables }>();

// All event routes require authentication
eventsRouter.use('/*', authMiddleware);

// User-based rate limit key
const userKey = (c: Parameters<typeof authMiddleware>[0]) => c.get('userId') ?? 'anon';

// ─── GET /events — List events in a date range ──────────────────────

eventsRouter.get(
  '/',
  rateLimit({ limit: 120, windowSeconds: 60, keyPrefix: 'events:list', keyFn: userKey }),
  validate('query', listEventsQuerySchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { start, end, categoryIds } = c.get('validatedQuery') as ListEventsQuery;

    const events = await eventService.listEvents(userId, start, end, categoryIds);
    return c.json(events);
  },
);

// ─── POST /events — Create a new event ──────────────────────────────

eventsRouter.post(
  '/',
  rateLimit({ limit: 30, windowSeconds: 60, keyPrefix: 'events:create', keyFn: userKey }),
  doubleSubmitCsrf,
  validate('json', createEventSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const data = c.get('validatedBody') as CreateEventInput;

    const event = await eventService.createEvent(userId, data);
    return c.json(event, 201);
  },
);

// ─── GET /events/:id — Get a single event ───────────────────────────

eventsRouter.get(
  '/:id',
  rateLimit({ limit: 120, windowSeconds: 60, keyPrefix: 'events:read', keyFn: userKey }),
  validate('param', eventIdParamSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };

    const event = await eventService.getEvent(userId, id);
    return c.json(event);
  },
);

// ─── PATCH /events/:id — Update an event ────────────────────────────

eventsRouter.patch(
  '/:id',
  rateLimit({ limit: 60, windowSeconds: 60, keyPrefix: 'events:update', keyFn: userKey }),
  doubleSubmitCsrf,
  validate('param', eventIdParamSchema),
  validate('json', updateEventSchema),
  validate('query', eventScopeQuerySchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };
    const data = c.get('validatedBody') as UpdateEventInput;
    const { scope, instanceDate } = c.get('validatedQuery') as EventScopeQuery;

    const event = await eventService.updateEvent(userId, id, data, scope, instanceDate);
    return c.json(event);
  },
);

// ─── DELETE /events/:id — Delete an event ───────────────────────────

eventsRouter.delete(
  '/:id',
  rateLimit({ limit: 30, windowSeconds: 60, keyPrefix: 'events:delete', keyFn: userKey }),
  doubleSubmitCsrf,
  validate('param', eventIdParamSchema),
  validate('query', eventScopeQuerySchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };
    const { scope, instanceDate } = c.get('validatedQuery') as EventScopeQuery;

    await eventService.deleteEvent(userId, id, scope, instanceDate);
    return c.body(null, 204);
  },
);

// ─── POST /events/:id/duplicate — Duplicate an event ────────────────

eventsRouter.post(
  '/:id/duplicate',
  rateLimit({ limit: 30, windowSeconds: 60, keyPrefix: 'events:create', keyFn: userKey }),
  doubleSubmitCsrf,
  validate('param', eventIdParamSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };

    const event = await eventService.duplicateEvent(userId, id);
    return c.json(event, 201);
  },
);

// ─── GET /events/:id/ics — Export event as .ics file ────────────────

eventsRouter.get(
  '/:id/ics',
  rateLimit({ limit: 30, windowSeconds: 60, keyPrefix: 'events:export', keyFn: userKey }),
  validate('param', eventIdParamSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };

    const icsContent = await eventService.exportIcs(userId, id);

    c.header('Content-Type', 'text/calendar; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="event-${id}.ics"`);

    return c.body(icsContent);
  },
);

export default eventsRouter;
