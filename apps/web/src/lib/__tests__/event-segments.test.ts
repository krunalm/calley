import { describe, expect, it } from 'vitest';

import { segmentEventForDay } from '../event-segments';

import type { Event } from '@calley/shared';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt1',
    userId: 'user1',
    categoryId: 'cat1',
    title: 'Late shift',
    description: null,
    location: null,
    startAt: '2026-03-15T23:00:00.000Z',
    endAt: '2026-03-16T01:00:00.000Z',
    isAllDay: false,
    color: null,
    visibility: 'private',
    rrule: null,
    exDates: [],
    recurringEventId: null,
    originalDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const UTC = 'UTC';
const DAY_ONE = new Date('2026-03-15T00:00:00Z');
const DAY_TWO = new Date('2026-03-16T00:00:00Z');

describe('segmentEventForDay', () => {
  it('clamps a cross-midnight event to midnight on its start day', () => {
    const event = makeEvent();

    const segment = segmentEventForDay(event, DAY_ONE, UTC);

    expect(segment).not.toBeNull();
    expect(segment!.startAt).toBe('2026-03-15T23:00:00.000Z');
    expect(segment!.endAt).toBe('2026-03-15T23:59:59.999Z');
  });

  it('clamps the same event to midnight-to-end on the following day', () => {
    const event = makeEvent();

    const segment = segmentEventForDay(event, DAY_TWO, UTC);

    expect(segment).not.toBeNull();
    expect(segment!.startAt).toBe('2026-03-16T00:00:00.000Z');
    expect(segment!.endAt).toBe('2026-03-16T01:00:00.000Z');
  });

  it('returns the event untouched when it fits inside the day', () => {
    const event = makeEvent({
      startAt: '2026-03-15T10:00:00.000Z',
      endAt: '2026-03-15T11:00:00.000Z',
    });

    expect(segmentEventForDay(event, DAY_ONE, UTC)).toBe(event);
  });

  it('returns null when the event has no overlap with the day', () => {
    const event = makeEvent();

    expect(segmentEventForDay(event, new Date('2026-03-20T00:00:00Z'), UTC)).toBeNull();
  });

  it('returns null for an event ending exactly at the day midnight', () => {
    const event = makeEvent({
      startAt: '2026-03-15T22:00:00.000Z',
      endAt: '2026-03-16T00:00:00.000Z',
    });

    expect(segmentEventForDay(event, DAY_TWO, UTC)).toBeNull();
  });

  it('passes all-day events through unchanged', () => {
    const event = makeEvent({ isAllDay: true });

    expect(segmentEventForDay(event, DAY_ONE, UTC)).toBe(event);
  });
});
