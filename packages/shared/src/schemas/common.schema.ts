import { z } from 'zod';

// ─── Regex Patterns ─────────────────────────────────────────────────

/** CUID2 pattern: lowercase alphanumeric, typically 24-32 chars */
export const cuid2Pattern = /^[a-z0-9]{24,32}$/;

/** Hex color pattern: # followed by 6 hex digits */
export const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

// ─── Reusable Schema Primitives ─────────────────────────────────────

/** Validates a CUID2 identifier string */
export const cuid2Schema = z.string().regex(cuid2Pattern, 'Invalid ID format');

/** Validates a hex color string like #FF5733 */
export const hexColorSchema = z.string().regex(hexColorPattern, 'Invalid hex color format');

/** ISO 8601 datetime string */
export const datetimeSchema = z.string().datetime({ message: 'Invalid ISO 8601 datetime' });

/** Validates an IANA timezone string (basic format check) */
export const timezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid IANA timezone' },
  );

// ─── Pagination ─────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ─── Date Range Query ───────────────────────────────────────────────

export const dateRangeSchema = z
  .object({
    start: datetimeSchema,
    end: datetimeSchema,
  })
  .refine((data) => new Date(data.start) < new Date(data.end), {
    message: 'Start date must be before end date',
    path: ['end'],
  });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// ─── Edit Scope (recurring items) ───────────────────────────────────

export const editScopeSchema = z.enum(['instance', 'following', 'all']);

export type EditScope = z.infer<typeof editScopeSchema>;

// ─── Visibility ─────────────────────────────────────────────────────

export const visibilitySchema = z.enum(['public', 'private']);

export type Visibility = z.infer<typeof visibilitySchema>;
