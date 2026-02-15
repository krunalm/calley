import { useVirtualizer } from '@tanstack/react-virtual';
import { addDays, eachDayOfInterval, format, isSameDay, parseISO, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCategories } from '@/hooks/use-categories';
import { useEvents } from '@/hooks/use-events';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useCalendarStore } from '@/stores/calendar-store';
import { useUIStore } from '@/stores/ui-store';

import { AgendaGroup } from './AgendaGroup';

import type { CalendarCategory, Event, Task } from '@calley/shared';

/** Number of days to load in each direction from the current date */
const INITIAL_DAYS_FORWARD = 30;
const INITIAL_DAYS_BACK = 7;
const LOAD_MORE_DAYS = 30;

export function AgendaView() {
  const { currentDate } = useCalendarStore();
  const { openEventDrawer, openTaskDrawer } = useUIStore();
  const userTimezone = useUserTimezone();
  const { data: categories = [] } = useCategories();

  // Track how many extra days have been loaded via infinite scroll
  const [extraDaysForward, setExtraDaysForward] = useState(0);

  // Compute date range for the API query
  const rangeStart = useMemo(() => subDays(currentDate, INITIAL_DAYS_BACK), [currentDate]);
  const rangeEnd = useMemo(
    () => addDays(currentDate, INITIAL_DAYS_FORWARD + extraDaysForward),
    [currentDate, extraDaysForward],
  );

  const fetchStart = rangeStart.toISOString();
  const fetchEnd = rangeEnd.toISOString();
  const { data: events = [], isLoading } = useEvents(fetchStart, fetchEnd);

  // Build category lookup map
  const categoryMap = useMemo(() => {
    const map = new Map<string, CalendarCategory>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  // Build a list of all days in the range
  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: subDays(rangeEnd, 1) }),
    [rangeStart, rangeEnd],
  );

  // Group events by date (in user timezone)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const event of events) {
      const dateStr = event.instanceDate ?? event.startAt;
      const zonedDate = toZonedTime(parseISO(dateStr), userTimezone);
      const dateKey = format(zonedDate, 'yyyy-MM-dd');
      const existing = map.get(dateKey) ?? [];
      existing.push(event);
      map.set(dateKey, existing);
    }
    // Sort events within each day by start time (timezone-aware)
    for (const [key, dayEvents] of map) {
      dayEvents.sort((a, b) => {
        // All-day events first
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return (
          toZonedTime(parseISO(a.startAt), userTimezone).getTime() -
          toZonedTime(parseISO(b.startAt), userTimezone).getTime()
        );
      });
      map.set(key, dayEvents);
    }
    return map;
  }, [events, userTimezone]);

  // Prepare row data: each row is one day
  const today = useMemo(() => toZonedTime(new Date(), userTimezone), [userTimezone]);

  const rows = useMemo(
    () =>
      days.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayEvents = eventsByDate.get(dateKey) ?? [];
        // Tasks will be integrated in Phase 3
        const dayTasks: Task[] = [];
        return { date: day, dateKey, events: dayEvents, tasks: dayTasks };
      }),
    [days, eventsByDate],
  );

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      const itemCount = row.events.length + row.tasks.length;
      if (itemCount === 0) return 72; // empty day: header + "no items"
      return 52 + itemCount * 56; // header + items
    },
    overscan: 5,
  });

  // Scroll to today on initial mount
  const hasScrolledToToday = useRef(false);
  useEffect(() => {
    if (hasScrolledToToday.current || rows.length === 0) return;
    const todayIndex = rows.findIndex((row) => isSameDay(row.date, today));
    if (todayIndex >= 0) {
      virtualizer.scrollToIndex(todayIndex, { align: 'start' });
      hasScrolledToToday.current = true;
    }
  }, [rows, today, virtualizer]);

  // Re-scroll when currentDate changes (from nav controls)
  const prevDate = useRef(currentDate);
  useEffect(() => {
    if (prevDate.current === currentDate) return;
    prevDate.current = currentDate;
    const targetIndex = rows.findIndex((row) => isSameDay(row.date, currentDate));
    if (targetIndex >= 0) {
      virtualizer.scrollToIndex(targetIndex, { align: 'start' });
    }
  }, [currentDate, rows, virtualizer]);

  // Infinite scroll: load more days when scrolling near the bottom
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 400) {
      setExtraDaysForward((prev) => prev + LOAD_MORE_DAYS);
    }
  }, []);

  const handleEventClick = useCallback(
    (event: Event) => {
      openEventDrawer({ eventId: event.id });
    },
    [openEventDrawer],
  );

  const handleTaskClick = useCallback(
    (task: Task) => {
      openTaskDrawer({ taskId: task.id });
    },
    [openTaskDrawer],
  );

  if (isLoading) {
    return <AgendaViewSkeleton />;
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      onScroll={handleScroll}
      role="list"
      aria-label="Agenda view"
    >
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={row.dateKey}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              role="listitem"
            >
              <AgendaGroup
                date={row.date}
                events={row.events}
                tasks={row.tasks}
                categoryMap={categoryMap}
                isToday={isSameDay(row.date, today)}
                onEventClick={handleEventClick}
                onTaskClick={handleTaskClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────

function AgendaViewSkeleton() {
  return (
    <div className="h-full overflow-auto">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="border-b border-[var(--border)]">
          <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] px-4 py-2">
            <div className="h-4 w-20 animate-pulse rounded bg-[var(--muted)]" />
            <div className="h-3 w-28 animate-pulse rounded bg-[var(--muted)]" />
          </div>
          <div className="space-y-2 px-4 py-2">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="flex items-start gap-3 rounded-[var(--radius)] p-3">
                <div className="h-4 w-4 animate-pulse rounded bg-[var(--muted)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-[var(--muted)]" />
                  <div className="h-3 w-24 animate-pulse rounded bg-[var(--muted)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
