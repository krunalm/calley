import { endOfDay, parseISO, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import type { Event } from '@calley/shared';

/**
 * Clamp a timed event to a single calendar day in the user's timezone.
 *
 * A cross-midnight event now appears on every day it spans (see
 * `useEventsByDate`), but a time grid renders one day at a time: the raw
 * event would be laid out as a minimum-height stub on its start day (the
 * computed height wraps below zero) and as a below-midnight block on the
 * following day. Clamping each day's copy to that day's bounds makes the
 * segment span start-to-midnight, then midnight-to-end.
 *
 * All-day events are returned unchanged — they are rendered by the all-day
 * row, not the time grid. Returns null when the event has no overlap with the
 * day at all.
 */
export function segmentEventForDay(event: Event, day: Date, timezone: string): Event | null {
  if (event.isAllDay) return event;

  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const zonedStart = toZonedTime(parseISO(event.startAt), timezone);
  const zonedEnd = toZonedTime(parseISO(event.endAt), timezone);

  const segmentStart = zonedStart < dayStart ? dayStart : zonedStart;
  const segmentEnd = zonedEnd > dayEnd ? dayEnd : zonedEnd;

  if (segmentStart.getTime() >= segmentEnd.getTime()) return null;

  if (
    segmentStart.getTime() === zonedStart.getTime() &&
    segmentEnd.getTime() === zonedEnd.getTime()
  ) {
    return event;
  }

  return {
    ...event,
    startAt: fromZonedTime(segmentStart, timezone).toISOString(),
    endAt: fromZonedTime(segmentEnd, timezone).toISOString(),
  };
}
