import { useQuery } from '@tanstack/react-query';
import { addDays, format, isBefore, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { useMemo } from 'react';

import { useUserTimezone } from '@/hooks/use-user-timezone';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { Event } from '@calley/shared';

export function useEvents(start: string, end: string) {
  return useQuery({
    queryKey: queryKeys.events.range(start, end),
    queryFn: () => apiClient.get<Event[]>(`/events?start=${start}&end=${end}`),
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

    for (const event of query.data) {
      // Use instanceDate for recurring instances, otherwise startAt
      const dateStr = event.instanceDate ?? event.startAt;
      const zonedDate = toZonedTime(parseISO(dateStr), userTimezone);
      const dateKey = format(zonedDate, 'yyyy-MM-dd');
      const existing = map.get(dateKey) ?? [];
      existing.push(event);
      map.set(dateKey, existing);

      // For multi-day all-day events, also add to intermediate dates
      if (!event.isAllDay) continue;
      const zonedStart = toZonedTime(parseISO(event.startAt), userTimezone);
      const zonedEnd = toZonedTime(parseISO(event.endAt), userTimezone);
      let current = addDays(zonedStart, 1);
      while (isBefore(current, zonedEnd)) {
        const key = format(current, 'yyyy-MM-dd');
        const dayEvents = map.get(key) ?? [];
        dayEvents.push(event);
        map.set(key, dayEvents);
        current = addDays(current, 1);
      }
    }

    return map;
  }, [query.data, userTimezone]);

  return { ...query, eventsByDate };
}
