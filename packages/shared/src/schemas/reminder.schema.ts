import { z } from 'zod';

import { cuid2Schema } from './common.schema';

// ─── Reminder Method ────────────────────────────────────────────────

export const reminderMethodSchema = z.enum(['push', 'email', 'both']);

// ─── Item Type ──────────────────────────────────────────────────────

export const reminderItemTypeSchema = z.enum(['event', 'task']);

// ─── Create Reminder ────────────────────────────────────────────────

export const createReminderSchema = z.object({
  itemType: reminderItemTypeSchema,
  itemId: cuid2Schema,
  minutesBefore: z
    .number()
    .int()
    .min(0, 'Minutes before must be non-negative')
    .max(40320, 'Maximum reminder is 4 weeks before'), // 4 weeks in minutes
  method: reminderMethodSchema.default('push'),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;

// ─── List Reminders Query ───────────────────────────────────────────

export const listRemindersQuerySchema = z.object({
  itemType: reminderItemTypeSchema,
  itemId: cuid2Schema,
});

export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;
