import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

import { useCategories } from '@/hooks/use-categories';
import { useEventsByDate } from '@/hooks/use-events';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { useCalendarStore } from '@/stores/calendar-store';

import { DayCell } from './DayCell';

import type { CalendarCategory, Event, Task } from '@calley/shared';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView() {
  const { currentDate } = useCalendarStore();
  const { data: categories = [] } = useCategories();

  // Calculate date range for the visible grid, including buffer for prefetch
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  // Fetch events for visible range + 1 month buffer
  const fetchStart = subMonths(gridStart, 1).toISOString();
  const fetchEnd = addMonths(gridEnd, 1).toISOString();
  const { eventsByDate, isLoading } = useEventsByDate(fetchStart, fetchEnd);

  // Build category lookup map
  const categoryMap = useMemo(() => {
    const map = new Map<string, CalendarCategory>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  // Generate grid days
  const gridStartTime = gridStart.getTime();
  const gridEndTime = gridEnd.getTime();
  const days = useMemo(
    () => eachDayOfInterval({ start: new Date(gridStartTime), end: new Date(gridEndTime) }),
    [gridStartTime, gridEndTime],
  );

  // Split days into weeks
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  const prefersReducedMotion = useReducedMotion();

  if (isLoading) {
    return <MonthViewSkeleton />;
  }

  return (
    <div className="flex h-full flex-col" role="grid" aria-label="Calendar month view">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[var(--border)]" role="row">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="border-r border-[var(--border)] px-2 py-1.5 text-center text-xs font-semibold text-[var(--muted-foreground)]"
            role="columnheader"
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day.charAt(0)}</span>
          </div>
        ))}
      </div>

      {/* Grid with staggered reveal */}
      <motion.div
        className="flex flex-1 flex-col"
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial={prefersReducedMotion ? false : 'initial'}
        animate="animate"
      >
        {weeks.map((week, weekIdx) => (
          <motion.div
            key={weekIdx}
            className="grid flex-1 grid-cols-7"
            role="row"
            variants={prefersReducedMotion ? undefined : staggerItem}
          >
            {week.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayEvents: Event[] = eventsByDate.get(dateKey) ?? [];
              const dayTasks: Task[] = []; // Tasks will be integrated in Phase 3

              return (
                <DayCell
                  key={dateKey}
                  date={day}
                  isCurrentMonth={isSameMonth(day, currentDate)}
                  events={dayEvents}
                  tasks={dayTasks}
                  categories={categoryMap}
                />
              );
            })}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function MonthViewSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Day headers skeleton */}
      <div className="grid grid-cols-7 border-b border-[var(--border)]">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="border-r border-[var(--border)] px-2 py-1.5 text-center text-xs font-semibold text-[var(--muted-foreground)]"
          >
            {day}
          </div>
        ))}
      </div>
      {/* Grid skeleton */}
      <div className="flex flex-1 flex-col">
        {Array.from({ length: 6 }).map((_, weekIdx) => (
          <div key={weekIdx} className="grid flex-1 grid-cols-7">
            {Array.from({ length: 7 }).map((_, dayIdx) => (
              <div
                key={dayIdx}
                className="min-h-[100px] animate-pulse border-b border-r border-[var(--border)] p-1 sm:min-h-[120px]"
              >
                <div className="mb-1 h-4 w-4 self-end rounded-full bg-[var(--muted)]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
