import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type { SearchResults } from '@calley/shared';

const RECENT_SEARCHES_KEY = 'calley_recent_searches';
const MAX_RECENT = 5;

/**
 * Debounce a value by `delay` ms. Updates only after `delay` ms of inactivity.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Hook for full-text search across events and tasks.
 *
 * Uses 300ms debounce and requires at least 2 characters.
 */
export function useSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const enabled = debouncedQuery.length >= 2;

  return useQuery({
    queryKey: queryKeys.search.results(debouncedQuery),
    queryFn: () =>
      apiClient.get<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`),
    enabled,
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Load recent search terms from localStorage.
 */
export function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      return JSON.parse(stored) as string[];
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

/**
 * Save a search term to the recent searches list.
 * Keeps only the last MAX_RECENT entries, no duplicates.
 */
export function saveRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;

  try {
    const existing = getRecentSearches();
    const filtered = existing.filter((s) => s !== trimmed);
    const updated = [trimmed, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}
