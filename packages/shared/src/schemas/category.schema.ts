import { z } from 'zod';

import { hexColorSchema } from './common.schema';

// ─── Create Category ────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name must be at most 50 characters'),
  color: hexColorSchema,
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ─── Update Category ────────────────────────────────────────────────

export const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(50, 'Name must be at most 50 characters')
    .optional(),
  color: hexColorSchema.optional(),
  visible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
