import { z } from 'zod';

import { cuid2Schema, datetimeSchema, editScopeSchema } from './common.schema';

// ─── Priority & Status Enums ────────────────────────────────────────

export const taskPrioritySchema = z.enum(['none', 'low', 'medium', 'high']);
export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);

// ─── Create Task ────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be at most 200 characters'),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .nullable()
    .optional(),
  dueAt: datetimeSchema.nullable().optional(),
  priority: taskPrioritySchema.default('none'),
  categoryId: cuid2Schema,
  rrule: z.string().max(500).nullable().optional(),
  reminder: z
    .object({
      minutesBefore: z.number().int().min(0).max(40320),
      method: z.enum(['push', 'email', 'both']).default('push'),
    })
    .nullable()
    .optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// ─── Update Task ────────────────────────────────────────────────────

export const updateTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be at most 200 characters')
    .optional(),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .nullable()
    .optional(),
  dueAt: datetimeSchema.nullable().optional(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
  categoryId: cuid2Schema.optional(),
  rrule: z.string().max(500).nullable().optional(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ─── List Tasks Query ───────────────────────────────────────────────

export const listTasksQuerySchema = z.object({
  status: z
    .string()
    .transform((val) => val.split(',').filter(Boolean))
    .pipe(z.array(taskStatusSchema))
    .optional(),
  priority: z
    .string()
    .transform((val) => val.split(',').filter(Boolean))
    .pipe(z.array(taskPrioritySchema))
    .optional(),
  dueStart: datetimeSchema.optional(),
  dueEnd: datetimeSchema.optional(),
  sort: z.enum(['due_at', 'sort_order', 'priority', 'created_at']).default('sort_order'),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

// ─── Task ID + Scope Params ─────────────────────────────────────────

export const taskIdParamSchema = z.object({
  id: cuid2Schema,
});

export const taskScopeQuerySchema = z.object({
  scope: editScopeSchema.optional(),
  instanceDate: datetimeSchema.optional(),
});

export type TaskScopeQuery = z.infer<typeof taskScopeQuerySchema>;

// ─── Reorder Tasks ──────────────────────────────────────────────────

export const reorderTasksSchema = z.object({
  ids: z.array(cuid2Schema).min(1, 'At least one task ID is required'),
});

export type ReorderTasksInput = z.infer<typeof reorderTasksSchema>;
