import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { useMemo } from 'react';

import { useCategories } from '@/hooks/use-categories';
import { useEventsByDate } from '@/hooks/use-events';
import { cn } from '@/lib/utils';
import { useCalendarStore } from '@/stores/calendar-store';

import { AllDayRow } from './AllDayRow';
import { TimeGrid } from './TimeGrid';

import type { CalendarCategory, Event, Task } from '@calley/shared';

export function WeekView() {
  const { currentDate } = useCalendarStore();
  const { data: categories = [] } = useCategories();

  // Calculate week boundaries
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });

  // Fetch events for visible week + 1 week buffer
  const fetchStart = subWeeks(weekStart, 1).toISOString();
  const fetchEnd = addWeeks(weekEnd, 1).toISOString();
  const { eventsByDate, isLoading } = useEventsByDate(fetchStart, fetchEnd);

  // Build category lookup map
  const categoryMap = useMemo(() => {
    const map = new Map<string, CalendarCategory>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  // Generate days of the week
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart.getTime(), weekEnd.getTime()],
  );

  // Build column data and separate all-day events
  const { columns, allDayEventsByDate } = useMemo(() => {
    const cols = days.map((day: Date) => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const dayEvents: Event[] = eventsByDate.get(dateKey) ?? [];
      const dayTasks: Task[] = []; // Tasks integrated in Phase 3

      return {
        date: day,
        dateKey,
        events: dayEvents.filter((e) => !e.isAllDay),
        tasks: dayTasks,
      };
    });

    const allDay = new Map<string, Event[]>();
    for (const day of days) {
      const dateKey = format(day, 'yyyy-MM-dd');
      const dayEvents: Event[] = eventsByDate.get(dateKey) ?? [];
      const allDayEvents = dayEvents.filter((e) => e.isAllDay);
      if (allDayEvents.length > 0) {
        allDay.set(dateKey, allDayEvents);
      }
    }

    return { columns: cols, allDayEventsByDate: allDay };
  }, [days, eventsByDate]);

  if (isLoading) {
    return <WeekViewSkeleton />;
  }

  return (
    <div className="flex h-full flex-col" role="grid" aria-label="Calendar week view">
      {/* Week header with day names and dates */}
      <WeekHeader days={days} />

      {/* All-day events row */}
      <AllDayRow
        days={days}
        allDayEventsByDate={allDayEventsByDate}
        categories={categoryMap}
      />

      {/* Time grid */}
      <TimeGrid
        columns={columns}
        categories={categoryMap}
      />
    </div>
  );
}

// ─── Week Header ──────────────────────────────────────────────────────

function WeekHeader({ days }: { days: Date[] }) {
  const { setDate, setView } = useCalendarStore();

  return (
    <div className="flex shrink-0 border-b border-[var(--border)]" role="row">
      {/* Empty cell for time gutter alignment */}
      <div className="w-14 shrink-0 border-r border-[var(--border)]" />

      {/* Day columns */}
      {days.map((day) => {
        const today = isToday(day);
        return (
          <div
            key={day.toISOString()}
            className="flex flex-1 flex-col items-center border-r border-[var(--border)] py-2"
            role="columnheader"
          >
            <span
              className={cn(
                'text-[10px] font-semibold uppercase tracking-wider',
                today ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]',
              )}
            >
              {format(day, 'EEE')}
            </span>
            <button
              type="button"
              onClick={() => {
                setDate(day);
                setView('day');
              }}
              className={cn(
                'mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors hover:bg-[var(--accent-ui)]/10',
                today &&
                  'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--color-accent-hover)]',
              )}
              aria-current={today ? 'date' : undefined}
              aria-label={format(day, 'EEEE, MMMM d, yyyy')}
            >
              {format(day, 'd')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────

function WeekViewSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Header skeleton */}
      <div className="flex shrink-0 border-b border-[var(--border)]">
        <div className="w-14 shrink-0 border-r border-[var(--border)]" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center border-r border-[var(--border)] py-2">
            <div className="h-3 w-6 animate-pulse rounded bg-[var(--muted)]" />
            <div className="mt-1 h-8 w-8 animate-pulse rounded-full bg-[var(--muted)]" />
          </div>
        ))}
      </div>

      {/* Time grid skeleton */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-14 shrink-0 border-r border-[var(--border)]">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 border-b border-[var(--border)]" />
          ))}
        </div>
        <div className="flex flex-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-[var(--border)]">
              {Array.from({ length: 12 }).map((_, j) => (
                <div key={j} className="h-24 border-b border-[var(--border)]" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
