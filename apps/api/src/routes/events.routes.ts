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

// ─── GET /events — List events in a date range ──────────────────────

eventsRouter.get('/', validate('query', listEventsQuerySchema), async (c) => {
  const userId = c.get('userId')!;
  const { start, end, categoryIds } = c.get('validatedQuery') as ListEventsQuery;

  const events = await eventService.listEvents(userId, start, end, categoryIds);
  return c.json(events);
});

// ─── POST /events — Create a new event ──────────────────────────────

eventsRouter.post('/', doubleSubmitCsrf, validate('json', createEventSchema), async (c) => {
  const userId = c.get('userId')!;
  const data = c.get('validatedBody') as CreateEventInput;

  const event = await eventService.createEvent(userId, data);
  return c.json(event, 201);
});

// ─── GET /events/:id — Get a single event ───────────────────────────

eventsRouter.get('/:id', validate('param', eventIdParamSchema), async (c) => {
  const userId = c.get('userId')!;
  const { id } = c.get('validatedParam') as { id: string };

  const event = await eventService.getEvent(userId, id);
  return c.json(event);
});

// ─── PATCH /events/:id — Update an event ────────────────────────────

eventsRouter.patch(
  '/:id',
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

eventsRouter.get('/:id/ics', validate('param', eventIdParamSchema), async (c) => {
  const userId = c.get('userId')!;
  const { id } = c.get('validatedParam') as { id: string };

  const icsContent = await eventService.exportIcs(userId, id);

  c.header('Content-Type', 'text/calendar; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="event-${id}.ics"`);

  return c.body(icsContent);
});

export default eventsRouter;
