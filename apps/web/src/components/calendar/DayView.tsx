import { addDays, format, isToday, subDays } from 'date-fns';
import { useMemo } from 'react';

import { useCategories } from '@/hooks/use-categories';
import { useEventsByDate } from '@/hooks/use-events';
import { cn } from '@/lib/utils';
import { useCalendarStore } from '@/stores/calendar-store';

import { AllDayRow } from './AllDayRow';
import { TimeGrid } from './TimeGrid';

import type { CalendarCategory, Event, Task } from '@calley/shared';

export function DayView() {
  const { currentDate } = useCalendarStore();
  const { data: categories = [] } = useCategories();

  // Fetch events for current day + 1 day buffer on each side
  const fetchStart = subDays(currentDate, 1).toISOString();
  const fetchEnd = addDays(currentDate, 2).toISOString();
  const { eventsByDate, isLoading } = useEventsByDate(fetchStart, fetchEnd);

  // Build category lookup map
  const categoryMap = useMemo(() => {
    const map = new Map<string, CalendarCategory>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  // Single day as an array (for reusing TimeGrid and AllDayRow)
  const days = useMemo(() => [currentDate], [currentDate]);

  // Build column data
  const { columns, allDayEventsByDate } = useMemo(() => {
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    const dayEvents: Event[] = eventsByDate.get(dateKey) ?? [];
    const dayTasks: Task[] = []; // Tasks integrated in Phase 3

    const cols = [
      {
        date: currentDate,
        dateKey,
        events: dayEvents.filter((e) => !e.isAllDay),
        tasks: dayTasks,
      },
    ];

    const allDay = new Map<string, Event[]>();
    const allDayEvents = dayEvents.filter((e) => e.isAllDay);
    if (allDayEvents.length > 0) {
      allDay.set(dateKey, allDayEvents);
    }

    return { columns: cols, allDayEventsByDate: allDay };
  }, [currentDate, eventsByDate]);

  if (isLoading) {
    return <DayViewSkeleton />;
  }

  const today = isToday(currentDate);

  return (
    <div className="flex h-full flex-col" role="grid" aria-label="Calendar day view">
      {/* Day header */}
      <div className="flex shrink-0 border-b border-[var(--border)]" role="row">
        {/* Empty cell for time gutter alignment */}
        <div className="w-14 shrink-0 border-r border-[var(--border)]" />

        <div
          className="flex flex-1 items-center gap-3 px-4 py-3"
          role="columnheader"
        >
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full text-xl font-semibold',
              today &&
                'bg-[var(--primary)] text-[var(--primary-foreground)]',
            )}
            aria-current={today ? 'date' : undefined}
          >
            {format(currentDate, 'd')}
          </div>
          <div className="flex flex-col">
            <span
              className={cn(
                'text-sm font-semibold uppercase tracking-wider',
                today ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]',
              )}
            >
              {format(currentDate, 'EEEE')}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {format(currentDate, 'MMMM yyyy')}
            </span>
          </div>
        </div>
      </div>

      {/* All-day events row */}
      <AllDayRow
        days={days}
        allDayEventsByDate={allDayEventsByDate}
        categories={categoryMap}
      />

      {/* Time grid — single column gets full width for detailed event blocks */}
      <TimeGrid
        columns={columns}
        categories={categoryMap}
      />
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────

function DayViewSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Header skeleton */}
      <div className="flex shrink-0 border-b border-[var(--border)]">
        <div className="w-14 shrink-0 border-r border-[var(--border)]" />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-[var(--muted)]" />
          <div className="flex flex-col gap-1">
            <div className="h-4 w-20 animate-pulse rounded bg-[var(--muted)]" />
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--muted)]" />
          </div>
        </div>
      </div>

      {/* Time grid skeleton */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-14 shrink-0 border-r border-[var(--border)]">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 border-b border-[var(--border)]" />
          ))}
        </div>
        <div className="flex-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 border-b border-[var(--border)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
