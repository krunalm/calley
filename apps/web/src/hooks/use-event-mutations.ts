import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { CreateEventInput, EditScope, Event, UpdateEventInput } from '@calley/shared';

type EventsCache = [readonly unknown[], Event[] | undefined][];

/** Snapshot all event range query caches for rollback. */
function snapshotEventCaches(queryClient: ReturnType<typeof useQueryClient>): EventsCache {
  return queryClient.getQueriesData<Event[]>({ queryKey: queryKeys.events.all });
}

/** Restore all event range query caches from a snapshot. */
function restoreEventCaches(queryClient: ReturnType<typeof useQueryClient>, snapshot: EventsCache) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEventInput) => apiClient.post<Event>('/events', data),
    onMutate: async (newEventData) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all });
      const snapshot = snapshotEventCaches(queryClient);

      // Optimistically add a placeholder event to all matching range caches
      const placeholder: Event = {
        id: `optimistic-${Date.now()}`,
        userId: '',
        categoryId: newEventData.categoryId,
        title: newEventData.title,
        description: newEventData.description ?? null,
        location: newEventData.location ?? null,
        startAt: newEventData.startAt,
        endAt: newEventData.endAt,
        isAllDay: newEventData.isAllDay ?? false,
        color: newEventData.color ?? null,
        visibility: newEventData.visibility ?? 'private',
        rrule: newEventData.rrule ?? null,
        exDates: [],
        recurringEventId: null,
        originalDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      for (const [key, data] of snapshot) {
        if (data) {
          queryClient.setQueryData(key, [...data, placeholder]);
        }
      }

      return { snapshot };
    },
    onSuccess: () => {
      toast.success('Event created');
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreEventCaches(queryClient, context.snapshot);
      }
      toast.error('Failed to create event');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}

interface UpdateEventVars {
  eventId: string;
  data: UpdateEventInput;
  scope?: EditScope;
  instanceDate?: string;
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data, scope, instanceDate }: UpdateEventVars) => {
      const params = new URLSearchParams();
      if (scope) params.set('scope', scope);
      if (instanceDate) params.set('instanceDate', instanceDate);
      const qs = params.toString();
      const path = `/events/${eventId}${qs ? `?${qs}` : ''}`;
      return apiClient.patch<Event>(path, data);
    },
    onMutate: async ({ eventId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all });
      const snapshot = snapshotEventCaches(queryClient);

      // Optimistically update the event in all matching range caches
      for (const [key, cacheData] of snapshot) {
        if (cacheData) {
          queryClient.setQueryData(
            key,
            cacheData.map((event) =>
              event.id === eventId
                ? { ...event, ...data, updatedAt: new Date().toISOString() }
                : event,
            ),
          );
        }
      }

      return { snapshot };
    },
    onSuccess: () => {
      toast.success('Event updated');
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreEventCaches(queryClient, context.snapshot);
      }
      toast.error('Failed to update event');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}

interface DeleteEventVars {
  eventId: string;
  scope?: EditScope;
  instanceDate?: string;
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, scope, instanceDate }: DeleteEventVars) => {
      const params = new URLSearchParams();
      if (scope) params.set('scope', scope);
      if (instanceDate) params.set('instanceDate', instanceDate);
      const qs = params.toString();
      const path = `/events/${eventId}${qs ? `?${qs}` : ''}`;
      return apiClient.delete(path);
    },
    onMutate: async ({ eventId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all });
      const snapshot = snapshotEventCaches(queryClient);

      // Optimistically remove the event from all matching range caches
      for (const [key, cacheData] of snapshot) {
        if (cacheData) {
          queryClient.setQueryData(
            key,
            cacheData.filter((event) => event.id !== eventId),
          );
        }
      }

      return { snapshot };
    },
    onSuccess: () => {
      toast.success('Event deleted');
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreEventCaches(queryClient, context.snapshot);
      }
      toast.error('Failed to delete event');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}
