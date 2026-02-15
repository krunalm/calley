import { format } from 'date-fns';
import { Calendar, CheckSquare, Clock, Search } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Skeleton } from '@/components/ui/Skeleton';
import { getRecentSearches, saveRecentSearch, useSearch } from '@/hooks/use-search';
import { useCalendarStore } from '@/stores/calendar-store';
import { useUIStore } from '@/stores/ui-store';

import type { Event, Task } from '@calley/shared';

function formatEventDate(event: Event): string {
  const start = new Date(event.startAt);
  if (event.isAllDay) {
    return format(start, 'MMM d, yyyy');
  }
  return format(start, 'MMM d, yyyy h:mm a');
}

function formatTaskDate(task: Task): string {
  if (!task.dueAt) return 'No due date';
  return format(new Date(task.dueAt), 'MMM d, yyyy');
}

export function SearchModal() {
  const { searchOpen, toggleSearch } = useUIStore();
  const { setDate, setView } = useCalendarStore();
  const [query, setQuery] = useState('');
  const { data, isLoading, isFetching } = useSearch(query);

  // Track when dialog was last opened to refresh recent searches
  const openCountRef = useRef(0);
  const prevOpenRef = useRef(false);
  if (searchOpen && !prevOpenRef.current) {
    openCountRef.current += 1;
  }
  prevOpenRef.current = searchOpen;

  // Load recent searches — recomputed each time dialog opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentSearches = useMemo(() => getRecentSearches(), [openCountRef.current]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setQuery('');
      }
      toggleSearch();
    },
    [toggleSearch],
  );

  const handleSelectEvent = useCallback(
    (event: Event) => {
      const eventDate = new Date(event.startAt);
      setDate(eventDate);
      setView('day');
      if (query.trim().length >= 2) {
        saveRecentSearch(query.trim());
      }
      toggleSearch();
    },
    [setDate, setView, toggleSearch, query],
  );

  const handleSelectTask = useCallback(
    (task: Task) => {
      if (task.dueAt) {
        const dueDate = new Date(task.dueAt);
        setDate(dueDate);
        setView('day');
      }
      if (query.trim().length >= 2) {
        saveRecentSearch(query.trim());
      }
      toggleSearch();
    },
    [setDate, setView, toggleSearch, query],
  );

  const handleSelectRecent = useCallback((search: string) => {
    setQuery(search);
  }, []);

  const hasQuery = query.trim().length >= 2;
  const hasResults = data && (data.events.length > 0 || data.tasks.length > 0);
  const showLoading = hasQuery && (isLoading || isFetching) && !data;
  const showEmpty = hasQuery && !isLoading && !isFetching && data && !hasResults;
  const showRecent = !hasQuery && recentSearches.length > 0;

  return (
    <CommandDialog open={searchOpen} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Search events and tasks..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Default empty state */}
        {!hasQuery && !showRecent && (
          <div className="py-14 text-center text-sm text-[var(--muted-foreground)]">
            <Search className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p>Type to search events and tasks</p>
          </div>
        )}

        {/* Recent searches */}
        {showRecent && (
          <CommandGroup heading="Recent Searches">
            {recentSearches.map((search) => (
              <CommandItem
                key={search}
                value={`recent:${search}`}
                onSelect={() => handleSelectRecent(search)}
              >
                <Clock className="mr-2 h-4 w-4 text-[var(--muted-foreground)]" />
                <span>{search}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Loading skeletons */}
        {showLoading && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        )}

        {/* No results */}
        {showEmpty && (
          <CommandEmpty>No results found for &ldquo;{query.trim()}&rdquo;</CommandEmpty>
        )}

        {/* Event results */}
        {hasResults && data.events.length > 0 && (
          <CommandGroup heading="Events">
            {data.events.map((event) => (
              <CommandItem
                key={event.id}
                value={`event:${event.id}:${event.title}`}
                onSelect={() => handleSelectEvent(event)}
              >
                <Calendar className="mr-2 h-4 w-4 text-[var(--muted-foreground)]" />
                <div className="flex flex-1 items-center gap-2 overflow-hidden">
                  {event.color && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: event.color }}
                    />
                  )}
                  <span className="truncate">{event.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">
                    {formatEventDate(event)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Separator between events and tasks */}
        {hasResults && data.events.length > 0 && data.tasks.length > 0 && <CommandSeparator />}

        {/* Task results */}
        {hasResults && data.tasks.length > 0 && (
          <CommandGroup heading="Tasks">
            {data.tasks.map((task) => (
              <CommandItem
                key={task.id}
                value={`task:${task.id}:${task.title}`}
                onSelect={() => handleSelectTask(task)}
              >
                <CheckSquare className="mr-2 h-4 w-4 text-[var(--muted-foreground)]" />
                <div className="flex flex-1 items-center gap-2 overflow-hidden">
                  <span className="truncate">{task.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">
                    {formatTaskDate(task)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
