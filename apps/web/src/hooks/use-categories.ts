import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { CalendarCategory, CreateCategoryInput, UpdateCategoryInput } from '@calley/shared';

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.all,
    queryFn: () => apiClient.get<CalendarCategory[]>('/categories'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCategoryInput) =>
      apiClient.post<CalendarCategory>('/categories', data),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.categories.all });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKeys.categories.all);

      const placeholder: CalendarCategory = {
        id: `optimistic-${Date.now()}`,
        userId: '',
        name: newData.name,
        color: newData.color,
        isDefault: false,
        visible: true,
        sortOrder: (previous?.length ?? 0) + 1,
        createdAt: formatInTimeZone(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ssXXX"),
        updatedAt: formatInTimeZone(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ssXXX"),
      };

      queryClient.setQueryData<CalendarCategory[]>(queryKeys.categories.all, (old) =>
        old ? [...old, placeholder] : [placeholder],
      );

      return { previous };
    },
    onSuccess: () => {
      toast.success('Calendar created');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.categories.all, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Failed to create calendar');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}

interface UpdateCategoryVars {
  categoryId: string;
  data: UpdateCategoryInput;
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, data }: UpdateCategoryVars) =>
      apiClient.patch<CalendarCategory>(`/categories/${categoryId}`, data),
    onMutate: async ({ categoryId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.categories.all });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKeys.categories.all);

      queryClient.setQueryData<CalendarCategory[]>(queryKeys.categories.all, (old) =>
        old?.map((cat) =>
          cat.id === categoryId
            ? {
                ...cat,
                ...data,
                updatedAt: formatInTimeZone(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ssXXX"),
              }
            : cat,
        ),
      );

      return { previous };
    },
    onSuccess: () => {
      toast.success('Calendar updated');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.categories.all, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Failed to update calendar');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      // Also invalidate events and tasks since they reference category colors
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => apiClient.delete(`/categories/${categoryId}`),
    onMutate: async (categoryId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.categories.all });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKeys.categories.all);

      queryClient.setQueryData<CalendarCategory[]>(queryKeys.categories.all, (old) =>
        old?.filter((cat) => cat.id !== categoryId),
      );

      return { previous };
    },
    onSuccess: () => {
      toast.success('Calendar deleted');
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.categories.all, context.previous);
      }
      if (err instanceof ApiError && err.status === 429) return;
      toast.error('Failed to delete calendar');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      // Events/tasks may have been reassigned to default category
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}
