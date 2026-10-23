import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isToday,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { useCallback, useMemo } from 'react';

import { useCategories } from '@/hooks/use-categories';
import { useEventsByDate } from '@/hooks/use-events';
import { useToggleTask } from '@/hooks/use-task-mutations';
import { useTasksByDate } from '@/hooks/use-tasks';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { segmentEventForDay } from '@/lib/event-segments';
import { cn } from '@/lib/utils';
import { useCalendarStore } from '@/stores/calendar-store';
import { useUIStore } from '@/stores/ui-store';

import { AllDayRow } from './AllDayRow';
import { TimeGrid } from './TimeGrid';

import type { CalendarCategory, Event, Task } from '@calley/shared';

// Only unfinished tasks are shown on the calendar grid: completed ones keep
// their place in the task panel, where they are expected, without burying the
// days' remaining work.
const CALENDAR_TASK_STATUSES = ['todo', 'in_progress'];

export function WeekView() {
  const { currentDate } = useCalendarStore();
  const { data: categories = [] } = useCategories();
  const userTimezone = useUserTimezone();
  const { openTaskDrawer } = useUIStore();
  const toggleTask = useToggleTask();

  // Calculate week boundaries and generate days
  const { weekStart, weekEnd, days } = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
    const we = endOfWeek(currentDate, { weekStartsOn: 0 });
    return { weekStart: ws, weekEnd: we, days: eachDayOfInterval({ start: ws, end: we }) };
  }, [currentDate]);

  // Fetch events for visible week + 1 week buffer
  const fetchStart = subWeeks(weekStart, 1).toISOString();
  const fetchEnd = addWeeks(weekEnd, 1).toISOString();
  const { eventsByDate, isLoading } = useEventsByDate(fetchStart, fetchEnd);
  const { tasksByDate } = useTasksByDate({
    dueStart: fetchStart,
    dueEnd: fetchEnd,
    status: CALENDAR_TASK_STATUSES,
  });

  // Build category lookup map
  const categoryMap = useMemo(() => {
    const map = new Map<string, CalendarCategory>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  // Build column data and separate all-day events
  const { columns, allDayEventsByDate } = useMemo(() => {
    const cols = days.map((day: Date) => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const dayEvents: Event[] = eventsByDate.get(dateKey) ?? [];
      const dayTasks: Task[] = tasksByDate.get(dateKey) ?? [];

      // Clamp timed events to this day so a block never wraps below zero
      // (cross-midnight events appear as two day-true segments instead).
      const timedEvents = dayEvents
        .filter((e) => !e.isAllDay)
        .map((e) => segmentEventForDay(e, day, userTimezone))
        .filter((e): e is Event => e !== null);

      return {
        date: day,
        dateKey,
        events: timedEvents,
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
  }, [days, eventsByDate, tasksByDate, userTimezone]);

  const handleTaskClick = useCallback(
    (task: Task) => openTaskDrawer({ taskId: task.id, instanceDate: task.instanceDate }),
    [openTaskDrawer],
  );

  const handleTaskToggle = useCallback(
    (task: Task) => {
      // Toggling by id would mark an entire recurring series done — a checkbox
      // on one occurrence must not do that, so only one-off tasks toggle from
      // the grid; recurring ones go through the drawer's scope dialog.
      if (!task.rrule && !task.recurringTaskId && !task.isRecurringInstance) {
        toggleTask.mutate(task.id);
      }
    },
    [toggleTask],
  );

  if (isLoading) {
    return <WeekViewSkeleton />;
  }

  return (
    <div className="flex h-full flex-col" role="grid" aria-label="Calendar week view">
      {/* Week header with day names and dates */}
      <WeekHeader days={days} />

      {/* All-day events row */}
      <AllDayRow days={days} allDayEventsByDate={allDayEventsByDate} categories={categoryMap} />

      {/* Time grid */}
      <TimeGrid
        columns={columns}
        categories={categoryMap}
        onTaskClick={handleTaskClick}
        onTaskToggle={handleTaskToggle}
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
          <div
            key={i}
            className="flex flex-1 flex-col items-center border-r border-[var(--border)] py-2"
          >
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
