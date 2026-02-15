import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { CreateEventInput, EditScope, Event, UpdateEventInput } from '@calley/shared';

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEventInput) => apiClient.post<Event>('/events', data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all });
    },
    onSuccess: () => {
      toast.success('Event created');
    },
    onError: () => {
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all });
    },
    onSuccess: () => {
      toast.success('Event updated');
    },
    onError: () => {
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all });
    },
    onSuccess: () => {
      toast.success('Event deleted');
    },
    onError: () => {
      toast.error('Failed to delete event');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}
