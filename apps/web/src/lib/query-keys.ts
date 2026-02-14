import type { TaskFilter } from '@/types/filters';

export const queryKeys = {
  events: {
    all: ['events'] as const,
    range: (start: string, end: string) => ['events', 'range', start, end] as const,
    detail: (id: string) => ['events', 'detail', id] as const,
    occurrences: (id: string, start: string, end: string) =>
      ['events', 'occurrences', id, start, end] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    list: (filters: TaskFilter) => ['tasks', 'list', filters] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
  },
  categories: {
    all: ['categories'] as const,
  },
  reminders: {
    byItem: (itemType: string, itemId: string) => ['reminders', itemType, itemId] as const,
  },
  search: {
    results: (query: string) => ['search', query] as const,
  },
  user: {
    me: ['user', 'me'] as const,
    sessions: ['user', 'sessions'] as const,
  },
} as const;
