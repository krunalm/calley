import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { CreateTaskInput, EditScope, Task, UpdateTaskInput } from '@calley/shared';

type TasksCache = [readonly unknown[], Task[] | undefined][];

/** Snapshot all task query caches for rollback. */
function snapshotTaskCaches(queryClient: ReturnType<typeof useQueryClient>): TasksCache {
  return queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all });
}

/** Restore all task query caches from a snapshot. */
function restoreTaskCaches(queryClient: ReturnType<typeof useQueryClient>, snapshot: TasksCache) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskInput) => apiClient.post<Task>('/tasks', data),
    onMutate: async (newTaskData) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const snapshot = snapshotTaskCaches(queryClient);

      // Optimistically add a placeholder task to all matching caches
      const placeholder: Task = {
        id: `optimistic-${Date.now()}`,
        userId: '',
        categoryId: newTaskData.categoryId,
        title: newTaskData.title,
        description: newTaskData.description ?? null,
        dueAt: newTaskData.dueAt ?? null,
        priority: newTaskData.priority ?? 'none',
        status: 'todo',
        completedAt: null,
        rrule: newTaskData.rrule ?? null,
        exDates: [],
        recurringTaskId: null,
        originalDate: null,
        sortOrder: 0,
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
      toast.success('Task created');
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreTaskCaches(queryClient, context.snapshot);
      }
      toast.error('Failed to create task');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

interface UpdateTaskVars {
  taskId: string;
  data: UpdateTaskInput;
  scope?: EditScope;
  instanceDate?: string;
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data, scope, instanceDate }: UpdateTaskVars) => {
      const params = new URLSearchParams();
      if (scope) params.set('scope', scope);
      if (instanceDate) params.set('instanceDate', instanceDate);
      const qs = params.toString();
      const path = `/tasks/${taskId}${qs ? `?${qs}` : ''}`;
      return apiClient.patch<Task>(path, data);
    },
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const snapshot = snapshotTaskCaches(queryClient);

      for (const [key, cacheData] of snapshot) {
        if (cacheData) {
          queryClient.setQueryData(
            key,
            cacheData.map((task) =>
              task.id === taskId
                ? { ...task, ...data, updatedAt: new Date().toISOString() }
                : task,
            ),
          );
        }
      }

      return { snapshot };
    },
    onSuccess: () => {
      toast.success('Task updated');
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreTaskCaches(queryClient, context.snapshot);
      }
      toast.error('Failed to update task');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

interface DeleteTaskVars {
  taskId: string;
  scope?: EditScope;
  instanceDate?: string;
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, scope, instanceDate }: DeleteTaskVars) => {
      const params = new URLSearchParams();
      if (scope) params.set('scope', scope);
      if (instanceDate) params.set('instanceDate', instanceDate);
      const qs = params.toString();
      const path = `/tasks/${taskId}${qs ? `?${qs}` : ''}`;
      return apiClient.delete(path);
    },
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const snapshot = snapshotTaskCaches(queryClient);

      for (const [key, cacheData] of snapshot) {
        if (cacheData) {
          queryClient.setQueryData(
            key,
            cacheData.filter((task) => task.id !== taskId),
          );
        }
      }

      return { snapshot };
    },
    onSuccess: () => {
      toast.success('Task deleted');
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreTaskCaches(queryClient, context.snapshot);
      }
      toast.error('Failed to delete task');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useToggleTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiClient.patch<Task>(`/tasks/${taskId}/toggle`, {}),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const snapshot = snapshotTaskCaches(queryClient);

      for (const [key, cacheData] of snapshot) {
        if (cacheData) {
          queryClient.setQueryData(
            key,
            cacheData.map((task) => {
              if (task.id !== taskId) return task;
              const isDone = task.status === 'done';
              return {
                ...task,
                status: isDone ? ('todo' as const) : ('done' as const),
                completedAt: isDone ? null : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
            }),
          );
        }
      }

      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreTaskCaches(queryClient, context.snapshot);
      }
      toast.error('Failed to update task');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiClient.patch('/tasks/reorder', { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const snapshot = snapshotTaskCaches(queryClient);

      // Optimistically reorder tasks in all matching caches
      const orderMap = new Map(ids.map((id, i) => [id, i]));
      for (const [key, cacheData] of snapshot) {
        if (cacheData) {
          const reordered = [...cacheData].sort((a, b) => {
            const ai = orderMap.get(a.id);
            const bi = orderMap.get(b.id);
            if (ai !== undefined && bi !== undefined) return ai - bi;
            if (ai !== undefined) return -1;
            if (bi !== undefined) return 1;
            return 0;
          });
          queryClient.setQueryData(key, reordered);
        }
      }

      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreTaskCaches(queryClient, context.snapshot);
      }
      toast.error('Failed to reorder tasks');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}
