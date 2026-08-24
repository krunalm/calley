import { describe, expect, it } from 'vitest';

import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  MAX_CATEGORIES_PER_USER,
  MAX_RECURRENCE_INSTANCES,
  RECURRENCE_PRESETS,
  REMINDER_PRESETS,
} from '../../constants/colors';
import { PRIORITY_LABELS, PRIORITY_ORDER, TASK_PRIORITIES } from '../../constants/priorities';
import {
  STATUS_LABELS,
  TASK_STATUSES,
  VISIBILITY_LABELS,
  VISIBILITY_OPTIONS,
} from '../../constants/statuses';
import { dateRangeSchema, isSupportedRange, MAX_QUERY_RANGE_DAYS } from '../common.schema';
import { createEventSchema, listEventsQuerySchema, updateEventSchema } from '../event.schema';
import { listTasksQuerySchema, MAX_REORDER_IDS, reorderTasksSchema } from '../task.schema';

const CATEGORY_ID = 'abcdefghijklmnopqrstuvwx';

function daysFrom(start: string, days: number): string {
  return new Date(new Date(start).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

const RANGE_START = '2026-03-01T00:00:00.000Z';

// ─── Query range bounds ─────────────────────────────────────────────

/**
 * Recurrence is expanded per request rather than materialised, so the work a
 * listing does is proportional to the span it is asked for. An unbounded range
 * let a single request expand a daily series across centuries.
 */
describe('query range bounds', () => {
  it('accepts a range inside the supported window', () => {
    expect(isSupportedRange(RANGE_START, daysFrom(RANGE_START, MAX_QUERY_RANGE_DAYS))).toBe(true);
  });

  it('rejects a range wider than the supported window', () => {
    expect(isSupportedRange(RANGE_START, daysFrom(RANGE_START, MAX_QUERY_RANGE_DAYS + 1))).toBe(
      false,
    );
  });

  it('rejects an inverted range', () => {
    expect(isSupportedRange(daysFrom(RANGE_START, 1), RANGE_START)).toBe(false);
  });

  it('rejects an unparseable bound', () => {
    expect(isSupportedRange('not-a-date', RANGE_START)).toBe(false);
  });

  it('rejects an equal start and end', () => {
    expect(isSupportedRange(RANGE_START, RANGE_START)).toBe(false);
  });

  it('bounds listEventsQuerySchema', () => {
    const overWide = listEventsQuerySchema.safeParse({
      start: RANGE_START,
      end: daysFrom(RANGE_START, MAX_QUERY_RANGE_DAYS + 10),
    });

    expect(overWide.success).toBe(false);
    expect(
      listEventsQuerySchema.safeParse({ start: RANGE_START, end: daysFrom(RANGE_START, 31) })
        .success,
    ).toBe(true);
  });

  it('bounds dateRangeSchema', () => {
    expect(
      dateRangeSchema.safeParse({
        start: RANGE_START,
        end: daysFrom(RANGE_START, MAX_QUERY_RANGE_DAYS + 1),
      }).success,
    ).toBe(false);
  });
});

// ─── All-day time ordering ──────────────────────────────────────────

/**
 * All-day events used to skip the start/end check entirely, so `endAt` could
 * land before `startAt`. That yields a negative duration, which breaks overlap
 * queries and makes recurrence expansion clamp every instance to zero length.
 */
describe('all-day event time ordering', () => {
  const base = {
    title: 'Offsite',
    categoryId: CATEGORY_ID,
    isAllDay: true,
  };

  it('accepts a single all-day day (midnight to midnight)', () => {
    const result = createEventSchema.safeParse({
      ...base,
      startAt: '2026-03-15T00:00:00.000Z',
      endAt: '2026-03-15T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a multi-day all-day span', () => {
    const result = createEventSchema.safeParse({
      ...base,
      startAt: '2026-03-15T00:00:00.000Z',
      endAt: '2026-03-18T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an inverted all-day span', () => {
    const result = createEventSchema.safeParse({
      ...base,
      startAt: '2026-03-18T00:00:00.000Z',
      endAt: '2026-03-15T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an inverted all-day span on update', () => {
    const result = updateEventSchema.safeParse({
      isAllDay: true,
      startAt: '2026-03-18T00:00:00.000Z',
      endAt: '2026-03-15T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('still requires a strictly positive range for timed events', () => {
    const result = createEventSchema.safeParse({
      title: 'Standup',
      categoryId: CATEGORY_ID,
      isAllDay: false,
      startAt: '2026-03-15T09:00:00.000Z',
      endAt: '2026-03-15T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Task query and reorder bounds ──────────────────────────────────

describe('task query bounds', () => {
  it('rejects an inverted due-date filter', () => {
    const result = listTasksQuerySchema.safeParse({
      dueStart: '2026-03-31T00:00:00.000Z',
      dueEnd: '2026-03-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an ordered due-date filter', () => {
    const result = listTasksQuerySchema.safeParse({
      dueStart: '2026-03-01T00:00:00.000Z',
      dueEnd: '2026-03-31T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a filter with only one bound', () => {
    expect(listTasksQuerySchema.safeParse({ dueStart: '2026-03-01T00:00:00.000Z' }).success).toBe(
      true,
    );
  });

  /**
   * Reordering rewrites `sortOrder` one row at a time inside a transaction, so
   * an unbounded id list holds a write transaction open for as many round trips
   * as the caller cares to send.
   */
  it('caps how many ids a reorder may carry', () => {
    const ids = Array.from({ length: MAX_REORDER_IDS + 1 }, () => CATEGORY_ID);
    expect(reorderTasksSchema.safeParse({ ids }).success).toBe(false);
    expect(reorderTasksSchema.safeParse({ ids: ids.slice(0, MAX_REORDER_IDS) }).success).toBe(true);
  });

  it('still requires at least one id', () => {
    expect(reorderTasksSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});

// ─── Constants ──────────────────────────────────────────────────────

describe('shared constants', () => {
  it('exposes a default colour drawn from the palette', () => {
    expect(CATEGORY_COLORS).toContain(DEFAULT_CATEGORY_COLOR);
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
  });

  it('keeps every palette entry a six-digit hex colour', () => {
    for (const color of CATEGORY_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('keeps reminder presets ordered and within the schema maximum', () => {
    const values = REMINDER_PRESETS.map((preset) => preset.value);
    expect([...values].sort((a, b) => a - b)).toEqual([...values]);
    expect(Math.max(...values)).toBeLessThanOrEqual(40320);
  });

  it('offers a no-recurrence preset plus valid RRULE strings', () => {
    expect(RECURRENCE_PRESETS[0].value).toBeNull();
    for (const preset of RECURRENCE_PRESETS.slice(1)) {
      expect(preset.value).toContain('FREQ=');
    }
  });

  it('bounds categories and recurrence expansion', () => {
    expect(MAX_CATEGORIES_PER_USER).toBeGreaterThan(0);
    expect(MAX_RECURRENCE_INSTANCES).toBeGreaterThan(0);
  });

  it('labels and orders every priority', () => {
    for (const priority of TASK_PRIORITIES) {
      expect(PRIORITY_LABELS[priority]).toBeTruthy();
      expect(typeof PRIORITY_ORDER[priority]).toBe('number');
    }
    expect(PRIORITY_ORDER.high).toBeGreaterThan(PRIORITY_ORDER.none);
  });

  it('labels every status and visibility option', () => {
    for (const status of TASK_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
    for (const visibility of VISIBILITY_OPTIONS) {
      expect(VISIBILITY_LABELS[visibility]).toBeTruthy();
    }
  });
});
