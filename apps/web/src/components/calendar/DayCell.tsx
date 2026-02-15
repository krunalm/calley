import { format, isSameDay } from 'date-fns';
import { memo, useCallback, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { getNowInUserTimezone, useCalendarStore } from '@/stores/calendar-store';
import { useUIStore } from '@/stores/ui-store';

import { EventPill } from './EventPill';
import { MoreIndicator } from './MoreIndicator';
import { TaskPill } from './TaskPill';

import type { CalendarCategory, Event, Task } from '@calley/shared';

const MAX_VISIBLE_ITEMS = 3;

interface DayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  events: Event[];
  tasks: Task[];
  categories: Map<string, CalendarCategory>;
  onEventClick?: (event: Event) => void;
  onTaskToggle?: (task: Task) => void;
  onTaskClick?: (task: Task) => void;
}

export const DayCell = memo(function DayCell({
  date,
  isCurrentMonth,
  events,
  tasks,
  categories,
  onEventClick,
  onTaskToggle,
  onTaskClick,
}: DayCellProps) {
  const { setDate, setView } = useCalendarStore();
  const { openEventDrawer } = useUIStore();

  const today = isSameDay(date, getNowInUserTimezone());
  const allItems = useMemo(() => [...events, ...tasks], [events, tasks]);
  const visibleEvents = events.slice(0, MAX_VISIBLE_ITEMS);
  const remainingSlots = MAX_VISIBLE_ITEMS - visibleEvents.length;
  const visibleTasks = tasks.slice(0, Math.max(0, remainingSlots));
  const visibleCount = visibleEvents.length + visibleTasks.length;
  const overflowCount = allItems.length - visibleCount;

  const handleDateClick = useCallback(() => {
    setDate(date);
    setView('day');
  }, [date, setDate, setView]);

  const handleEmptyClick = useCallback(() => {
    openEventDrawer({ defaultDate: date });
  }, [date, openEventDrawer]);

  const getCategoryColor = useCallback(
    (categoryId: string) => categories.get(categoryId)?.color,
    [categories],
  );

  return (
    <div
      className={cn(
        'flex min-h-[100px] flex-col border-b border-r border-[var(--border)] p-1 sm:min-h-[120px]',
        !isCurrentMonth && 'bg-[var(--muted)]/30',
      )}
      role="gridcell"
      aria-label={format(date, 'EEEE, MMMM d, yyyy')}
    >
      {/* Date number */}
      <button
        type="button"
        onClick={handleDateClick}
        className={cn(
          'mb-0.5 flex h-6 w-6 items-center justify-center self-end rounded-full text-xs font-medium transition-colors hover:bg-[var(--accent-ui)]',
          !isCurrentMonth && 'text-[var(--muted-foreground)]',
          today &&
            'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--color-accent-hover)]',
        )}
        aria-current={today ? 'date' : undefined}
      >
        {format(date, 'd')}
      </button>

      {/* Items */}
      <div className="flex flex-1 flex-col gap-0.5">
        {visibleEvents.map((event) => (
          <EventPill
            key={event.id + (event.instanceDate ?? '')}
            event={event}
            categoryColor={getCategoryColor(event.categoryId)}
            onClick={onEventClick}
          />
        ))}

        {visibleTasks.map((task) => (
          <TaskPill
            key={task.id + (task.instanceDate ?? '')}
            task={task}
            categoryColor={getCategoryColor(task.categoryId)}
            onToggle={onTaskToggle}
            onClick={onTaskClick}
          />
        ))}

        {overflowCount > 0 && <MoreIndicator count={overflowCount} onClick={handleDateClick} />}
      </div>

      {/* Click empty area to quick-create */}
      {allItems.length === 0 && (
        <button
          type="button"
          className="flex-1"
          onClick={handleEmptyClick}
          aria-label={`Create event on ${format(date, 'MMMM d')}`}
        />
      )}
    </div>
  );
});
