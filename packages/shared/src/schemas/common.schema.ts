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

/**
 * Widest window a range query may ask for, in days.
 *
 * Recurrence is expanded per request rather than materialised, so the cost of a
 * listing is proportional to the span asked for: an unbounded `start`/`end`
 * lets one request expand a daily series across centuries. A little over a year
 * covers every view the UI can render, including a year grid with padding.
 */
export const MAX_QUERY_RANGE_DAYS = 400;

const MAX_QUERY_RANGE_MS = MAX_QUERY_RANGE_DAYS * 24 * 60 * 60 * 1000;

/** Whether [start, end] is ordered and no wider than the supported window. */
export function isSupportedRange(start: string, end: string): boolean {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  return startMs < endMs && endMs - startMs <= MAX_QUERY_RANGE_MS;
}

export const dateRangeSchema = z
  .object({
    start: datetimeSchema,
    end: datetimeSchema,
  })
  .refine((data) => new Date(data.start) < new Date(data.end), {
    message: 'Start date must be before end date',
    path: ['end'],
  })
  .refine((data) => isSupportedRange(data.start, data.end), {
    message: `Date range must not exceed ${MAX_QUERY_RANGE_DAYS} days`,
    path: ['end'],
  });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// ─── Edit Scope (recurring items) ───────────────────────────────────

export const editScopeSchema = z.enum(['instance', 'following', 'all']);

export type EditScope = z.infer<typeof editScopeSchema>;

// ─── Visibility ─────────────────────────────────────────────────────

export const visibilitySchema = z.enum(['public', 'private']);

export type Visibility = z.infer<typeof visibilitySchema>;
