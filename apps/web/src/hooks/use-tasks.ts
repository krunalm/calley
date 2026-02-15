import { useQuery } from '@tanstack/react-query';
import {
  endOfDay,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { useMemo } from 'react';

import { useUserTimezone } from '@/hooks/use-user-timezone';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { Task } from '@calley/shared';
import type { TaskFilter } from '@/types/filters';

export function useTasks(filters: TaskFilter = {}) {
  const params = new URLSearchParams();
  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.priority?.length) params.set('priority', filters.priority.join(','));
  if (filters.dueStart) params.set('dueStart', filters.dueStart);
  if (filters.dueEnd) params.set('dueEnd', filters.dueEnd);
  if (filters.sort) params.set('sort', filters.sort);

  const qs = params.toString();

  return useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () => apiClient.get<Task[]>(`/tasks${qs ? `?${qs}` : ''}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(taskId ?? ''),
    queryFn: () => apiClient.get<Task>(`/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export interface GroupedTasks {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  noDate: Task[];
  completed: Task[];
}

/**
 * Groups tasks into panel sections: Overdue, Today, Upcoming, No Date, Completed.
 * Each group is sorted appropriately.
 */
export function useGroupedTasks(filters: TaskFilter = {}) {
  const query = useTasks(filters);
  const userTimezone = useUserTimezone();

  const grouped = useMemo<GroupedTasks>(() => {
    const result: GroupedTasks = {
      overdue: [],
      today: [],
      upcoming: [],
      noDate: [],
      completed: [],
    };

    if (!query.data) return result;

    const now = toZonedTime(new Date(), userTimezone);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    for (const task of query.data) {
      // Completed tasks go to their own group
      if (task.status === 'done') {
        result.completed.push(task);
        continue;
      }

      // Tasks without a due date
      if (!task.dueAt) {
        result.noDate.push(task);
        continue;
      }

      const zonedDue = toZonedTime(parseISO(task.dueAt), userTimezone);

      if (isBefore(zonedDue, todayStart)) {
        result.overdue.push(task);
      } else if (!isBefore(zonedDue, todayStart) && !isAfter(zonedDue, todayEnd)) {
        result.today.push(task);
      } else {
        result.upcoming.push(task);
      }
    }

    // Sort overdue: oldest first
    result.overdue.sort((a, b) => {
      if (!a.dueAt || !b.dueAt) return 0;
      return parseISO(a.dueAt).getTime() - parseISO(b.dueAt).getTime();
    });

    // Sort upcoming: soonest first
    result.upcoming.sort((a, b) => {
      if (!a.dueAt || !b.dueAt) return 0;
      return parseISO(a.dueAt).getTime() - parseISO(b.dueAt).getTime();
    });

    // Sort completed: most recently completed first
    result.completed.sort((a, b) => {
      if (!a.completedAt || !b.completedAt) return 0;
      return parseISO(b.completedAt).getTime() - parseISO(a.completedAt).getTime();
    });

    return result;
  }, [query.data, userTimezone]);

  return { ...query, grouped };
}

/**
 * Groups tasks by their due date (YYYY-MM-DD in user's timezone)
 * for display in calendar views.
 */
export function useTasksByDate(filters: TaskFilter = {}) {
  const query = useTasks(filters);
  const userTimezone = useUserTimezone();

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    if (!query.data) return map;

    for (const task of query.data) {
      if (!task.dueAt) continue;
      const zonedDate = toZonedTime(parseISO(task.dueAt), userTimezone);
      const dateKey = format(zonedDate, 'yyyy-MM-dd');
      const existing = map.get(dateKey) ?? [];
      existing.push(task);
      map.set(dateKey, existing);
    }

    return map;
  }, [query.data, userTimezone]);

  return { ...query, tasksByDate };
}
