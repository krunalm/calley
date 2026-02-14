import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

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
 * Groups events by their start date (YYYY-MM-DD) for efficient lookup
 * in calendar grid views.
 */
export function useEventsByDate(start: string, end: string) {
  const query = useEvents(start, end);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    if (!query.data) return map;

    for (const event of query.data) {
      // Use instanceDate for recurring instances, otherwise startAt
      const dateStr = event.instanceDate ?? event.startAt;
      const dateKey = dateStr.slice(0, 10); // YYYY-MM-DD
      const existing = map.get(dateKey) ?? [];
      existing.push(event);
      map.set(dateKey, existing);

      // For multi-day events, also add to intermediate dates
      if (!event.isAllDay) continue;
      const startDate = new Date(event.startAt);
      const endDate = new Date(event.endAt);
      const current = new Date(startDate);
      current.setDate(current.getDate() + 1);
      while (current < endDate) {
        const key = current.toISOString().slice(0, 10);
        const dayEvents = map.get(key) ?? [];
        dayEvents.push(event);
        map.set(key, dayEvents);
        current.setDate(current.getDate() + 1);
      }
    }

    return map;
  }, [query.data]);

  return { ...query, eventsByDate };
}
