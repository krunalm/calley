import { z } from 'zod';

import {
  cuid2Schema,
  datetimeSchema,
  editScopeSchema,
  hexColorSchema,
  visibilitySchema,
} from './common.schema';

// ─── Create Event ───────────────────────────────────────────────────

export const createEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(200, 'Title must be at most 200 characters'),
    description: z
      .string()
      .max(5000, 'Description must be at most 5000 characters')
      .nullable()
      .optional(),
    location: z.string().max(500, 'Location must be at most 500 characters').nullable().optional(),
    startAt: datetimeSchema,
    endAt: datetimeSchema,
    isAllDay: z.boolean().default(false),
    categoryId: cuid2Schema,
    color: hexColorSchema.nullable().optional(),
    visibility: visibilitySchema.default('private'),
    rrule: z.string().max(500).nullable().optional(),
    reminder: z
      .object({
        minutesBefore: z.number().int().min(0).max(40320), // max 4 weeks
        method: z.enum(['push', 'email', 'both']).default('push'),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      if (data.isAllDay) return true;
      return new Date(data.startAt) < new Date(data.endAt);
    },
    {
      message: 'End time must be after start time',
      path: ['endAt'],
    },
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;

// ─── Update Event ───────────────────────────────────────────────────

export const updateEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(200, 'Title must be at most 200 characters')
      .optional(),
    description: z
      .string()
      .max(5000, 'Description must be at most 5000 characters')
      .nullable()
      .optional(),
    location: z.string().max(500, 'Location must be at most 500 characters').nullable().optional(),
    startAt: datetimeSchema.optional(),
    endAt: datetimeSchema.optional(),
    isAllDay: z.boolean().optional(),
    categoryId: cuid2Schema.optional(),
    color: hexColorSchema.nullable().optional(),
    visibility: visibilitySchema.optional(),
    rrule: z.string().max(500).nullable().optional(),
  })
  .refine(
    (data) => {
      if (!data.startAt || !data.endAt) return true;
      if (data.isAllDay) return true;
      return new Date(data.startAt) < new Date(data.endAt);
    },
    {
      message: 'End time must be after start time',
      path: ['endAt'],
    },
  );

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ─── List Events Query ──────────────────────────────────────────────

export const listEventsQuerySchema = z.object({
  start: datetimeSchema,
  end: datetimeSchema,
  categoryIds: z
    .string()
    .transform((val) => val.split(',').filter(Boolean))
    .pipe(z.array(cuid2Schema))
    .optional(),
});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

// ─── Event ID + Scope Params ────────────────────────────────────────

export const eventIdParamSchema = z.object({
  id: cuid2Schema,
});

export const eventScopeQuerySchema = z.object({
  scope: editScopeSchema.optional(),
  instanceDate: datetimeSchema.optional(),
});

export type EventScopeQuery = z.infer<typeof eventScopeQuerySchema>;
