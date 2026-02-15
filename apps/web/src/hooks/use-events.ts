import { useQuery } from '@tanstack/react-query';
import { addDays, format, isBefore, max, min, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { useMemo } from 'react';

import { useUserTimezone } from '@/hooks/use-user-timezone';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { Event } from '@calley/shared';

export function useEvents(start: string, end: string) {
  return useQuery({
    queryKey: queryKeys.events.range(start, end),
    queryFn: () => {
      const params = new URLSearchParams({ start, end });
      return apiClient.get<Event[]>(`/events?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!start && !!end,
  });
}

/**
 * Groups events by their start date (YYYY-MM-DD in the user's timezone)
 * for efficient lookup in calendar grid views.
 */
export function useEventsByDate(start: string, end: string) {
  const query = useEvents(start, end);
  const userTimezone = useUserTimezone();

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    if (!query.data) return map;

    // Clamp expansion loop to the requested window
    const zonedRequestedStart = toZonedTime(parseISO(start), userTimezone);
    const zonedRequestedEnd = toZonedTime(parseISO(end), userTimezone);

    for (const event of query.data) {
      // Use instanceDate for recurring instances, otherwise startAt
      const dateStr = event.instanceDate ?? event.startAt;
      const zonedDate = toZonedTime(parseISO(dateStr), userTimezone);
      const dateKey = format(zonedDate, 'yyyy-MM-dd');
      const existing = map.get(dateKey) ?? [];
      existing.push(event);
      map.set(dateKey, existing);

      // For multi-day all-day events, also add to intermediate dates
      // clamped to the requested [start, end] window
      if (!event.isAllDay) continue;
      const zonedStart = toZonedTime(parseISO(event.startAt), userTimezone);
      const zonedEnd = toZonedTime(parseISO(event.endAt), userTimezone);
      const loopStart = max([addDays(zonedStart, 1), zonedRequestedStart]);
      const loopEnd = min([zonedEnd, zonedRequestedEnd]);
      let current = loopStart;
      while (isBefore(current, loopEnd)) {
        const key = format(current, 'yyyy-MM-dd');
        const dayEvents = map.get(key) ?? [];
        dayEvents.push(event);
        map.set(key, dayEvents);
        current = addDays(current, 1);
      }
    }

    return map;
  }, [query.data, userTimezone, start, end]);

  return { ...query, eventsByDate };
}
