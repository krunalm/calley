import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { RecurrenceService } from '../recurrence.service';

import type { ExceptionOverride, RecurrableEvent } from '../recurrence.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_CATEGORY_ID = 'testcategory1234567890123';
const TEST_EVENT_ID = 'testevent12345678901234567';

function makeRecurrableEvent(overrides: Partial<RecurrableEvent> = {}): RecurrableEvent {
  return {
    id: TEST_EVENT_ID,
    userId: TEST_USER_ID,
    categoryId: TEST_CATEGORY_ID,
    title: 'Recurring Event',
    description: null,
    location: null,
    startAt: '2026-03-15T10:00:00.000Z', // Sunday
    endAt: '2026-03-15T11:00:00.000Z',
    isAllDay: false,
    color: null,
    visibility: 'private',
    rrule: 'FREQ=DAILY',
    exDates: [],
    recurringEventId: null,
    originalDate: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeException(overrides: Partial<ExceptionOverride> = {}): ExceptionOverride {
  return {
    id: 'exception1234567890123456',
    recurringEventId: TEST_EVENT_ID,
    userId: TEST_USER_ID,
    originalDate: '2026-03-17T10:00:00.000Z',
    overrides: {},
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('RecurrenceService', () => {
  let service: RecurrenceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RecurrenceService();
  });

  // ─── expandRecurringEvents ──────────────────────────────────────

  describe('expandRecurringEvents', () => {
    // ─── Non-recurring events ───────────────────────────────────

    it('should pass through non-recurring events unchanged', () => {
      const event = makeRecurrableEvent({ rrule: null });
      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(event);
      expect((result[0] as { isRecurringInstance?: boolean }).isRecurringInstance).toBeUndefined();
    });

    it('should pass through exception records (recurringEventId set) unchanged', () => {
      const exception = makeRecurrableEvent({
        id: 'exception_event_1234567890',
        rrule: null,
        recurringEventId: TEST_EVENT_ID,
        originalDate: '2026-03-17T10:00:00.000Z',
      });
      const result = service.expandRecurringEvents(
        [exception],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('exception_event_1234567890');
    });

    // ─── Daily recurrence ────────────────────────────────────────

    it('should expand daily recurrence within date range', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-20T23:59:59Z',
      );

      // March 15, 16, 17, 18, 19, 20 = 6 days
      expect(result).toHaveLength(6);
      for (const instance of result) {
        expect((instance as { isRecurringInstance: boolean }).isRecurringInstance).toBe(true);
        expect((instance as { instanceDate: string }).instanceDate).toBeDefined();
      }
    });

    it('should preserve event duration for each instance', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:30:00.000Z', // 1.5 hours
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
      );

      for (const instance of result) {
        const start = new Date(instance.startAt);
        const end = new Date(instance.endAt);
        const durationMs = end.getTime() - start.getTime();
        expect(durationMs).toBe(90 * 60 * 1000); // 90 minutes
      }
    });

    // ─── Weekly recurrence ───────────────────────────────────────

    it('should expand weekly recurrence on specific days', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        startAt: '2026-03-16T09:00:00.000Z', // Monday
        endAt: '2026-03-16T10:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-16T00:00:00Z', // Monday
        '2026-03-22T23:59:59Z', // Sunday
      );

      // Mon 16, Wed 18, Fri 20 = 3 instances
      expect(result).toHaveLength(3);

      const dates = result.map((r) => new Date(r.startAt).getUTCDay());
      expect(dates).toContain(1); // Monday
      expect(dates).toContain(3); // Wednesday
      expect(dates).toContain(5); // Friday
    });

    it('should expand weekly recurrence for every weekday (Mon-Fri)', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
        startAt: '2026-03-16T09:00:00.000Z', // Monday
        endAt: '2026-03-16T10:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-16T00:00:00Z', // Monday
        '2026-03-22T23:59:59Z', // Sunday
      );

      // Mon-Fri = 5 instances
      expect(result).toHaveLength(5);
    });

    // ─── Monthly recurrence ──────────────────────────────────────

    it('should expand monthly by day-of-month', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=15',
        startAt: '2026-01-15T10:00:00.000Z',
        endAt: '2026-01-15T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-01-01T00:00:00Z',
        '2026-06-30T23:59:59Z',
      );

      // Jan 15, Feb 15, Mar 15, Apr 15, May 15, Jun 15 = 6 instances
      expect(result).toHaveLength(6);

      for (const instance of result) {
        const day = new Date(instance.startAt).getUTCDate();
        expect(day).toBe(15);
      }
    });

    it('should expand monthly by weekday position (e.g., 2nd Tuesday)', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=MONTHLY;BYDAY=2TU',
        startAt: '2026-01-13T10:00:00.000Z', // 2nd Tuesday of Jan 2026
        endAt: '2026-01-13T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-01-01T00:00:00Z',
        '2026-04-30T23:59:59Z',
      );

      // 2nd Tuesday: Jan 13, Feb 10, Mar 10, Apr 14 = 4 instances
      expect(result).toHaveLength(4);

      for (const instance of result) {
        const date = new Date(instance.startAt);
        expect(date.getUTCDay()).toBe(2); // Tuesday
      }
    });

    // ─── Yearly recurrence ───────────────────────────────────────

    it('should expand yearly recurrence', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=YEARLY',
        startAt: '2024-06-15T10:00:00.000Z',
        endAt: '2024-06-15T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2024-01-01T00:00:00Z',
        '2028-12-31T23:59:59Z',
      );

      // 2024, 2025, 2026, 2027, 2028 = 5 instances
      expect(result).toHaveLength(5);

      const years = result.map((r) => new Date(r.startAt).getUTCFullYear());
      expect(years).toEqual([2024, 2025, 2026, 2027, 2028]);
    });

    // ─── Custom intervals ────────────────────────────────────────

    it('should expand with custom interval (every 2 days)', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;INTERVAL=2',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-22T23:59:59Z',
      );

      // Mar 15, 17, 19, 21 = 4 instances
      expect(result).toHaveLength(4);

      const days = result.map((r) => new Date(r.startAt).getUTCDate());
      expect(days).toEqual([15, 17, 19, 21]);
    });

    it('should expand with custom interval (every 3 weeks)', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=WEEKLY;INTERVAL=3',
        startAt: '2026-01-05T10:00:00.000Z', // Monday
        endAt: '2026-01-05T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-01-01T00:00:00Z',
        '2026-04-30T23:59:59Z',
      );

      // Every 3 weeks: Jan 5, Jan 26, Feb 16, Mar 9, Mar 30, Apr 20 = 6
      expect(result.length).toBeGreaterThanOrEqual(5);

      // Check interval between first two
      const d0 = new Date(result[0].startAt);
      const d1 = new Date(result[1].startAt);
      const diffDays = (d1.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(21); // 3 weeks
    });

    it('should expand with custom interval (every 2 months)', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1',
        startAt: '2026-01-01T10:00:00.000Z',
        endAt: '2026-01-01T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-01-01T00:00:00Z',
        '2026-12-31T23:59:59Z',
      );

      // Jan, Mar, May, Jul, Sep, Nov = 6 instances
      expect(result).toHaveLength(6);

      const months = result.map((r) => new Date(r.startAt).getUTCMonth());
      expect(months).toEqual([0, 2, 4, 6, 8, 10]); // 0-indexed months
    });

    // ─── End conditions ──────────────────────────────────────────

    it('should respect COUNT end condition', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=5',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-12-31T23:59:59Z',
      );

      expect(result).toHaveLength(5);
    });

    it('should respect UNTIL end condition', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;UNTIL=20260320T235959Z',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-12-31T23:59:59Z',
      );

      // Mar 15, 16, 17, 18, 19, 20 = 6 instances
      expect(result).toHaveLength(6);

      // Last instance should be on or before March 20
      const lastDate = new Date(result[result.length - 1].startAt);
      expect(lastDate.getUTCDate()).toBeLessThanOrEqual(20);
    });

    // ─── Exception handling (exDates) ────────────────────────────

    it('should skip dates in exDates', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
        exDates: ['2026-03-17T10:00:00.000Z', '2026-03-19T10:00:00.000Z'],
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-20T23:59:59Z',
      );

      // 6 days - 2 excluded = 4 instances
      expect(result).toHaveLength(4);

      const dates = result.map((r) => new Date(r.startAt).getUTCDate());
      expect(dates).not.toContain(17);
      expect(dates).not.toContain(19);
      expect(dates).toContain(15);
      expect(dates).toContain(16);
      expect(dates).toContain(18);
      expect(dates).toContain(20);
    });

    it('should handle empty exDates array', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=3',
        exDates: [],
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      expect(result).toHaveLength(3);
    });

    // ─── Exception overrides ─────────────────────────────────────

    it('should apply exception overrides to matching instances', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      const exception = makeException({
        originalDate: '2026-03-17T10:00:00.000Z',
        overrides: {
          title: 'Modified Title',
          location: 'New Location',
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-18T23:59:59Z',
        [exception],
      );

      expect(result).toHaveLength(4);

      // Find the March 17 instance
      const mar17 = result.find((r) => new Date(r.startAt).getUTCDate() === 17);
      expect(mar17).toBeDefined();
      expect(mar17!.title).toBe('Modified Title');
      expect(mar17!.location).toBe('New Location');

      // Other instances should keep original values
      const mar15 = result.find((r) => new Date(r.startAt).getUTCDate() === 15);
      expect(mar15!.title).toBe('Recurring Event');
    });

    it('should apply time overrides from exceptions', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      const exception = makeException({
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: {
          startAt: '2026-03-16T14:00:00.000Z',
          endAt: '2026-03-16T15:30:00.000Z',
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
        [exception],
      );

      const mar16 = result.find((r) => {
        const d = new Date(r.startAt);
        return d.getUTCDate() === 16 && d.getUTCHours() === 14;
      });
      expect(mar16).toBeDefined();
      expect(mar16!.startAt).toBe('2026-03-16T14:00:00.000Z');
      expect(mar16!.endAt).toBe('2026-03-16T15:30:00.000Z');
    });

    it('should preserve duration when only startAt is overridden', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T12:00:00.000Z', // 2-hour duration
      });

      const exception = makeException({
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: {
          startAt: '2026-03-16T14:00:00.000Z',
          // No endAt override — duration should be preserved
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
        [exception],
      );

      const mar16 = result.find((r) => {
        const d = new Date(r.startAt);
        return d.getUTCDate() === 16 && d.getUTCHours() === 14;
      });
      expect(mar16).toBeDefined();
      expect(mar16!.startAt).toBe('2026-03-16T14:00:00.000Z');
      // endAt should be startAt + 2 hours (original duration)
      expect(mar16!.endAt).toBe('2026-03-16T16:00:00.000Z');
    });

    it('should use explicit endAt override when both startAt and endAt are provided', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T12:00:00.000Z', // 2-hour duration
      });

      const exception = makeException({
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: {
          startAt: '2026-03-16T14:00:00.000Z',
          endAt: '2026-03-16T15:00:00.000Z', // Explicit 1-hour duration
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
        [exception],
      );

      const mar16 = result.find((r) => {
        const d = new Date(r.startAt);
        return d.getUTCDate() === 16 && d.getUTCHours() === 14;
      });
      expect(mar16).toBeDefined();
      expect(mar16!.startAt).toBe('2026-03-16T14:00:00.000Z');
      // Should use the explicit endAt, not preserve duration
      expect(mar16!.endAt).toBe('2026-03-16T15:00:00.000Z');
    });

    it('should clamp endAt to startAt when override would make endAt < startAt', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T12:00:00.000Z',
      });

      const exception = makeException({
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: {
          startAt: '2026-03-16T18:00:00.000Z',
          endAt: '2026-03-16T09:00:00.000Z', // Before startAt — invalid
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
        [exception],
      );

      const mar16 = result.find((r) => {
        const d = new Date(r.startAt);
        return d.getUTCDate() === 16 && d.getUTCHours() === 18;
      });
      expect(mar16).toBeDefined();
      // endAt should be clamped to startAt
      expect(mar16!.endAt).toBe(mar16!.startAt);
    });

    it('should apply category and color overrides from exceptions', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=3',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
        categoryId: 'cat_original_123456789012',
        color: '#ff0000',
      });

      const exception = makeException({
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: {
          categoryId: 'cat_override_123456789012',
          color: '#00ff00',
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-18T23:59:59Z',
        [exception],
      );

      const mar16 = result.find((r) => new Date(r.startAt).getUTCDate() === 16);
      expect(mar16!.categoryId).toBe('cat_override_123456789012');
      expect(mar16!.color).toBe('#00ff00');

      const mar15 = result.find((r) => new Date(r.startAt).getUTCDate() === 15);
      expect(mar15!.categoryId).toBe('cat_original_123456789012');
      expect(mar15!.color).toBe('#ff0000');
    });

    it('should match exceptions by full timestamp, not just date', () => {
      // Two exceptions on the same date but different times should
      // only match their respective occurrences
      const event = makeRecurrableEvent({
        id: 'evt_twice_daily_12345678901',
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      // Exception for the March 16 10:00 instance
      const exception = makeException({
        recurringEventId: 'evt_twice_daily_12345678901',
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: { title: 'Modified 10am' },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
        [exception],
      );

      // Mar 16 at 10:00 should have the override
      const mar16 = result.find((r) => new Date(r.startAt).getUTCDate() === 16);
      expect(mar16).toBeDefined();
      expect(mar16!.title).toBe('Modified 10am');

      // Mar 15 and 17 should not be affected
      const others = result.filter((r) => new Date(r.startAt).getUTCDate() !== 16);
      for (const other of others) {
        expect(other.title).toBe('Recurring Event');
      }
    });

    // ─── Instance capping ────────────────────────────────────────

    it('should cap expansion at 1000 instances per series', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2020-01-01T10:00:00.000Z',
        endAt: '2020-01-01T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2020-01-01T00:00:00Z',
        '2030-12-31T23:59:59Z', // ~4000 days
      );

      expect(result).toHaveLength(1000);
    });

    // ─── Multiple series ─────────────────────────────────────────

    it('should expand multiple recurring events independently', () => {
      const event1 = makeRecurrableEvent({
        id: 'event1_12345678901234567',
        rrule: 'FREQ=DAILY;COUNT=3',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      const event2 = makeRecurrableEvent({
        id: 'event2_12345678901234567',
        rrule: 'FREQ=DAILY;COUNT=2',
        startAt: '2026-03-15T14:00:00.000Z',
        endAt: '2026-03-15T15:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event1, event2],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      // 3 from event1 + 2 from event2 = 5
      expect(result).toHaveLength(5);
    });

    it('should handle mix of recurring and non-recurring events', () => {
      const recurring = makeRecurrableEvent({
        id: 'recurring_1234567890123456',
        rrule: 'FREQ=DAILY;COUNT=3',
      });

      const nonRecurring = makeRecurrableEvent({
        id: 'single_123456789012345678',
        rrule: null,
      });

      const result = service.expandRecurringEvents(
        [recurring, nonRecurring],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      // 3 instances + 1 non-recurring = 4
      expect(result).toHaveLength(4);

      const nonRecResult = result.find((r) => r.id === 'single_123456789012345678');
      expect(nonRecResult).toBeDefined();
      expect(
        (nonRecResult as { isRecurringInstance?: boolean }).isRecurringInstance,
      ).toBeUndefined();
    });

    // ─── Edge cases ──────────────────────────────────────────────

    it('should handle invalid RRULE gracefully (skip, do not throw)', () => {
      const event = makeRecurrableEvent({
        rrule: 'TOTALLY_INVALID',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      // Should silently skip and return no instances
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no events are provided', () => {
      const result = service.expandRecurringEvents(
        [],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      expect(result).toEqual([]);
    });

    it('should set isRecurringInstance and instanceDate on expanded instances', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=1',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      expect(result).toHaveLength(1);
      const instance = result[0] as { isRecurringInstance: boolean; instanceDate: string };
      expect(instance.isRecurringInstance).toBe(true);
      expect(instance.instanceDate).toBeDefined();
      expect(typeof instance.instanceDate).toBe('string');
    });

    it('should keep parent event ID on all expanded instances', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=3',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      for (const instance of result) {
        expect(instance.id).toBe(TEST_EVENT_ID);
      }
    });

    it('should only expand within the queried date range', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-01-01T10:00:00.000Z',
        endAt: '2026-01-01T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
      );

      // Should only include instances that overlap March 15-17 range
      expect(result).toHaveLength(3);
      for (const instance of result) {
        const start = new Date(instance.startAt);
        const end = new Date(instance.endAt);
        // Instance must overlap the range: start < rangeEnd && end > rangeStart
        expect(start.getTime()).toBeLessThan(new Date('2026-03-17T23:59:59Z').getTime());
        expect(end.getTime()).toBeGreaterThan(new Date('2026-03-15T00:00:00Z').getTime());
      }
    });

    // ─── Overlap detection (events starting before range) ──────

    it('should include instances that start before range but overlap into it', () => {
      // Event runs from 22:00 to 02:00 next day (4-hour duration)
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T22:00:00.000Z',
        endAt: '2026-03-16T02:00:00.000Z', // 4 hours
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-17T00:00:00Z', // Range starts at midnight Mar 17
        '2026-03-17T23:59:59Z',
      );

      // Instance on Mar 16 at 22:00 ends Mar 17 at 02:00 — overlaps into range
      // Instance on Mar 17 at 22:00 ends Mar 18 at 02:00 — starts in range
      // So we should get 2 instances
      expect(result).toHaveLength(2);

      const starts = result.map((r) => new Date(r.startAt).toISOString());
      expect(starts).toContain('2026-03-16T22:00:00.000Z');
      expect(starts).toContain('2026-03-17T22:00:00.000Z');
    });

    it('should exclude instances that end exactly at range start (no overlap)', () => {
      // Event runs from 10:00 to 11:00 (1 hour)
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      // Range starts at 11:00 — an instance from 10:00-11:00 does NOT overlap
      // since it ends exactly when the range starts (exclusive end)
      const result = service.expandRecurringEvents(
        [event],
        '2026-03-16T11:00:00Z', // starts at 11:00
        '2026-03-16T23:59:59Z',
      );

      // The Mar 16 instance is 10:00-11:00, which ends at range start — no overlap
      expect(result).toHaveLength(0);
    });

    it('should include multi-day events that straddle the range boundary', () => {
      // 3-day event recurring weekly
      const event = makeRecurrableEvent({
        rrule: 'FREQ=WEEKLY;BYDAY=FR',
        startAt: '2026-03-13T10:00:00.000Z', // Friday
        endAt: '2026-03-16T10:00:00.000Z', // 3 days later (Monday)
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z', // Sunday
        '2026-03-15T23:59:59Z', // still Sunday
      );

      // The Friday Mar 13 instance runs Fri 10:00 to Mon 10:00 — overlaps Sunday
      expect(result).toHaveLength(1);
      expect(new Date(result[0].startAt).getUTCDay()).toBe(5); // Friday
    });

    // ─── Negative duration guard ─────────────────────────────────

    it('should clamp negative duration to 0 and warn when endAt < startAt on parent', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=3',
        startAt: '2026-03-15T12:00:00.000Z',
        endAt: '2026-03-15T10:00:00.000Z', // endAt before startAt
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-18T23:59:59Z',
      );

      // Should still produce instances (with 0 duration)
      expect(result).toHaveLength(3);

      // Duration should be clamped to 0 (startAt === endAt)
      for (const instance of result) {
        expect(instance.startAt).toBe(instance.endAt);
      }

      // Should have logged a warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: TEST_EVENT_ID,
          startAt: '2026-03-15T12:00:00.000Z',
          endAt: '2026-03-15T10:00:00.000Z',
        }),
        'Recurring event has endAt before startAt, clamping duration to 0',
      );
    });

    it('should not shift query window forward when duration is clamped to 0', () => {
      // With negative duration, windowStart = start - negativeDuration would shift forward,
      // potentially missing occurrences. Clamping to 0 prevents this.
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=3',
        startAt: '2026-03-15T12:00:00.000Z',
        endAt: '2026-03-15T10:00:00.000Z', // -2h duration
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T11:00:00Z', // starts at 11:00
        '2026-03-18T23:59:59Z',
      );

      // Instance at 12:00 on Mar 15 with 0 duration should be included
      // (starts after range start, within range)
      expect(result).toHaveLength(3);
    });

    // ─── Post-override overlap re-check ───────────────────────────

    it('should exclude instance when override moves it outside the query range', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      // Override moves Mar 16 instance to Mar 25 — well outside the query range
      const exception = makeException({
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: {
          startAt: '2026-03-25T10:00:00.000Z',
          endAt: '2026-03-25T11:00:00.000Z',
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
        [exception],
      );

      // Mar 15, 16, 17 = 3 instances, but Mar 16 was moved to Mar 25 (outside range)
      // So only Mar 15 and Mar 17 remain = 2 instances
      expect(result).toHaveLength(2);

      const dates = result.map((r) => new Date(r.startAt).getUTCDate());
      expect(dates).toContain(15);
      expect(dates).toContain(17);
      expect(dates).not.toContain(16);
      expect(dates).not.toContain(25);
    });

    it('should exclude instance when override moves it before the query range', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      // Override moves Mar 16 instance to Mar 1 — before the query range
      const exception = makeException({
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: {
          startAt: '2026-03-01T10:00:00.000Z',
          endAt: '2026-03-01T11:00:00.000Z',
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
        [exception],
      );

      // Mar 16 moved to Mar 1 (before range) — excluded
      expect(result).toHaveLength(2);

      const dates = result.map((r) => new Date(r.startAt).getUTCDate());
      expect(dates).toContain(15);
      expect(dates).toContain(17);
    });

    it('should keep instance when override keeps it within the query range', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
      });

      // Override moves Mar 16 instance later in the day but still within range
      const exception = makeException({
        originalDate: '2026-03-16T10:00:00.000Z',
        overrides: {
          startAt: '2026-03-16T18:00:00.000Z',
          endAt: '2026-03-16T19:00:00.000Z',
        },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-17T23:59:59Z',
        [exception],
      );

      // All 3 instances remain
      expect(result).toHaveLength(3);

      const mar16 = result.find((r) => {
        const d = new Date(r.startAt);
        return d.getUTCDate() === 16 && d.getUTCHours() === 18;
      });
      expect(mar16).toBeDefined();
      expect(mar16!.startAt).toBe('2026-03-16T18:00:00.000Z');
    });

    // ─── Weekend recurrence ──────────────────────────────────────

    it('should expand weekend-only recurrence (Sat-Sun)', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=WEEKLY;BYDAY=SA,SU',
        startAt: '2026-03-14T10:00:00.000Z', // Saturday
        endAt: '2026-03-14T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-14T00:00:00Z',
        '2026-03-29T23:59:59Z',
      );

      // Sat 14, Sun 15, Sat 21, Sun 22, Sat 28, Sun 29 = 6
      for (const instance of result) {
        const day = new Date(instance.startAt).getUTCDay();
        expect([0, 6]).toContain(day); // Sunday = 0, Saturday = 6
      }
    });

    // ─── All-day events ──────────────────────────────────────────

    it('should expand all-day recurring events correctly', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startAt: '2026-03-16T00:00:00.000Z',
        endAt: '2026-03-17T00:00:00.000Z', // All-day: midnight to midnight
        isAllDay: true,
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      // Mondays in March 2026: 2, 9, 16, 23, 30
      // But dtstart is March 16, so: 16, 23, 30 = 3
      expect(result).toHaveLength(3);
      for (const instance of result) {
        expect(instance.isAllDay).toBe(true);
        const start = new Date(instance.startAt);
        const end = new Date(instance.endAt);
        // Duration should be 24 hours
        expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
      }
    });
  });

  // ─── validateRrule ─────────────────────────────────────────────

  describe('validateRrule', () => {
    it('should accept valid daily RRULE', () => {
      expect(() => service.validateRrule('FREQ=DAILY')).not.toThrow();
    });

    it('should accept valid weekly RRULE with BYDAY', () => {
      expect(() => service.validateRrule('FREQ=WEEKLY;BYDAY=MO,WE,FR')).not.toThrow();
    });

    it('should accept valid monthly RRULE with BYMONTHDAY', () => {
      expect(() => service.validateRrule('FREQ=MONTHLY;BYMONTHDAY=15')).not.toThrow();
    });

    it('should accept valid monthly RRULE with positional weekday', () => {
      expect(() => service.validateRrule('FREQ=MONTHLY;BYDAY=2TU')).not.toThrow();
    });

    it('should accept valid yearly RRULE', () => {
      expect(() => service.validateRrule('FREQ=YEARLY')).not.toThrow();
    });

    it('should accept RRULE with COUNT', () => {
      expect(() => service.validateRrule('FREQ=DAILY;COUNT=10')).not.toThrow();
    });

    it('should accept RRULE with UNTIL', () => {
      expect(() => service.validateRrule('FREQ=DAILY;UNTIL=20261231T235959Z')).not.toThrow();
    });

    it('should accept RRULE with INTERVAL', () => {
      expect(() => service.validateRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).not.toThrow();
    });

    it('should reject RRULE without FREQ', () => {
      expect(() => service.validateRrule('BYDAY=MO,WE')).toThrow(AppError);
      expect(() => service.validateRrule('BYDAY=MO,WE')).toThrow('missing FREQ');
    });

    it('should reject RRULE with invalid FREQ value', () => {
      expect(() => service.validateRrule('FREQ=SECONDLY')).toThrow(AppError);
      expect(() => service.validateRrule('FREQ=MINUTELY')).toThrow(AppError);
      expect(() => service.validateRrule('FREQ=HOURLY')).toThrow(AppError);
    });

    it('should reject empty string', () => {
      expect(() => service.validateRrule('')).toThrow(AppError);
    });

    it('should reject completely invalid string', () => {
      expect(() => service.validateRrule('NOT_AN_RRULE')).toThrow(AppError);
    });

    it('should throw AppError with code INVALID_RRULE', () => {
      try {
        service.validateRrule('INVALID');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(422);
        expect((err as AppError).code).toBe('INVALID_RRULE');
      }
    });
  });

  // ─── DST / Timezone edge cases ─────────────────────────────────

  describe('timezone and DST edge cases', () => {
    it('should expand across DST spring-forward transition', () => {
      // US DST spring forward: March 8, 2026 at 2:00 AM
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=5',
        startAt: '2026-03-06T07:00:00.000Z', // Before DST
        endAt: '2026-03-06T08:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-06T00:00:00Z',
        '2026-03-12T23:59:59Z',
      );

      // Should still produce 5 instances regardless of DST
      expect(result).toHaveLength(5);
    });

    it('should expand across DST fall-back transition', () => {
      // US DST fall back: November 1, 2026 at 2:00 AM
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=5',
        startAt: '2026-10-30T06:00:00.000Z', // Before fall-back
        endAt: '2026-10-30T07:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-10-30T00:00:00Z',
        '2026-11-05T23:59:59Z',
      );

      // Should still produce 5 instances
      expect(result).toHaveLength(5);
    });

    it('should handle UTC midnight boundary events', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=3',
        startAt: '2026-03-15T00:00:00.000Z', // Midnight UTC
        endAt: '2026-03-15T01:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-20T23:59:59Z',
      );

      expect(result).toHaveLength(3);
    });

    it('should handle events near year boundary', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=5',
        startAt: '2025-12-30T10:00:00.000Z',
        endAt: '2025-12-30T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2025-12-28T00:00:00Z',
        '2026-01-05T23:59:59Z',
      );

      expect(result).toHaveLength(5);

      // Verify instances cross year boundary
      const years = result.map((r) => new Date(r.startAt).getUTCFullYear());
      expect(years).toContain(2025);
      expect(years).toContain(2026);
    });

    it('should handle Feb 29 in leap year (yearly recurrence)', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=YEARLY',
        startAt: '2024-02-29T10:00:00.000Z', // Leap year
        endAt: '2024-02-29T11:00:00.000Z',
      });

      const result = service.expandRecurringEvents(
        [event],
        '2024-01-01T00:00:00Z',
        '2032-12-31T23:59:59Z',
      );

      // rrule.js handles leap years — should only get leap years
      // 2024, 2028, 2032 = 3 instances on Feb 29 (rrule.js skips non-leap years for Feb 29)
      expect(result.length).toBeGreaterThanOrEqual(1);
      for (const instance of result) {
        const date = new Date(instance.startAt);
        expect(date.getUTCMonth()).toBe(1); // February
        expect(date.getUTCDate()).toBe(29);
      }
    });
  });

  // ─── Complex combined scenarios ────────────────────────────────

  describe('complex scenarios', () => {
    it('should handle exDates + exceptions together', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=DAILY;COUNT=7',
        startAt: '2026-03-15T10:00:00.000Z',
        endAt: '2026-03-15T11:00:00.000Z',
        exDates: ['2026-03-17T10:00:00.000Z'], // Exclude Mar 17
      });

      const exception = makeException({
        originalDate: '2026-03-19T10:00:00.000Z',
        overrides: { title: 'Override on 19th' },
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-15T00:00:00Z',
        '2026-03-22T23:59:59Z',
        [exception],
      );

      // 7 days - 1 exDate = 6 instances
      expect(result).toHaveLength(6);

      // Mar 17 should be excluded
      const dates = result.map((r) => new Date(r.startAt).getUTCDate());
      expect(dates).not.toContain(17);

      // Mar 19 should have override
      const mar19 = result.find((r) => new Date(r.startAt).getUTCDate() === 19);
      expect(mar19!.title).toBe('Override on 19th');
    });

    it('should handle weekly recurrence with COUNT and exDates', () => {
      const event = makeRecurrableEvent({
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
        startAt: '2026-03-16T09:00:00.000Z', // Monday
        endAt: '2026-03-16T10:00:00.000Z',
        exDates: ['2026-03-23T09:00:00.000Z'], // Exclude 2nd Monday
      });

      const result = service.expandRecurringEvents(
        [event],
        '2026-03-01T00:00:00Z',
        '2026-04-30T23:59:59Z',
      );

      // COUNT=4 generates 4 Mondays: Mar 16, 23, 30, Apr 6
      // Minus exDate Mar 23 = 3 instances
      expect(result).toHaveLength(3);
    });
  });
});
