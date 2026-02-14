import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { CalendarCategory } from '@calley/shared';

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.all,
    queryFn: () => apiClient.get<CalendarCategory[]>('/categories'),
    staleTime: 5 * 60 * 1000,
  });
}
