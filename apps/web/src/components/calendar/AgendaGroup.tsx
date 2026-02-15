import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { Calendar, CheckCircle2, Circle, Clock, MapPin, Repeat } from 'lucide-react';
import { memo } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { cn } from '@/lib/utils';

import type { CalendarCategory, Event, Task } from '@calley/shared';

// ─── AgendaEventItem ────────────────────────────────────────────────

interface AgendaEventItemProps {
  event: Event;
  categoryColor?: string;
  onClick?: (event: Event) => void;
}

export const AgendaEventItem = memo(function AgendaEventItem({
  event,
  categoryColor,
  onClick,
}: AgendaEventItemProps) {
  const userTimezone = useUserTimezone();
  const color = event.color ?? categoryColor ?? 'var(--primary)';
  const isRecurring = !!event.rrule || !!event.recurringEventId || event.isRecurringInstance;

  const timeLabel = event.isAllDay
    ? 'All day'
    : `${formatInTimeZone(parseISO(event.startAt), userTimezone, 'h:mm a')} – ${formatInTimeZone(parseISO(event.endAt), userTimezone, 'h:mm a')}`;

  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-[var(--radius)] p-3 text-left transition-colors hover:bg-[var(--accent-ui)]"
      style={{ borderLeft: `4px solid ${color}` }}
      onClick={() => onClick?.(event)}
      aria-label={`${event.title}, ${timeLabel}`}
    >
      <div className="mt-0.5 shrink-0">
        <Calendar className="h-4 w-4 text-[var(--muted-foreground)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{event.title}</span>
          {isRecurring && (
            <Repeat
              className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]"
              aria-label="Recurring"
            />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeLabel}
          </span>
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

// ─── AgendaTaskItem ─────────────────────────────────────────────────

interface AgendaTaskItemProps {
  task: Task;
  categoryColor?: string;
  onToggle?: (task: Task) => void;
  onClick?: (task: Task) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-blue-500',
  none: 'text-[var(--muted-foreground)]',
};

export const AgendaTaskItem = memo(function AgendaTaskItem({
  task,
  categoryColor,
  onToggle,
  onClick,
}: AgendaTaskItemProps) {
  const userTimezone = useUserTimezone();
  const isDone = task.status === 'done';
  const color = categoryColor ?? 'var(--primary)';
  const isRecurring = !!task.rrule || !!task.recurringTaskId || task.isRecurringInstance;

  const timeLabel = task.dueAt
    ? formatInTimeZone(parseISO(task.dueAt), userTimezone, 'h:mm a')
    : null;

  return (
    <div
      className={cn(
        'flex w-full items-start gap-3 rounded-[var(--radius)] p-3 transition-colors hover:bg-[var(--accent-ui)]',
        isDone && 'opacity-50',
      )}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="mt-0.5 shrink-0">
        <Checkbox
          checked={isDone}
          onCheckedChange={() => onToggle?.(task)}
          className="h-4 w-4"
          aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'complete'}`}
        />
      </div>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onClick?.(task)}>
        <div className="flex items-center gap-2">
          <span className={cn('truncate font-medium', isDone && 'line-through')}>{task.title}</span>
          {task.priority !== 'none' && (
            <span className={cn('shrink-0', PRIORITY_COLORS[task.priority])}>
              {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            </span>
          )}
          {isRecurring && (
            <Repeat
              className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]"
              aria-label="Recurring"
            />
          )}
        </div>
        {timeLabel && (
          <div className="mt-1 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
            <Clock className="h-3 w-3" />
            {timeLabel}
          </div>
        )}
      </button>
    </div>
  );
});

// ─── AgendaGroup ────────────────────────────────────────────────────

interface AgendaGroupProps {
  date: Date;
  events: Event[];
  tasks: Task[];
  categoryMap: Map<string, CalendarCategory>;
  isToday: boolean;
  onEventClick?: (event: Event) => void;
  onTaskClick?: (task: Task) => void;
  onTaskToggle?: (task: Task) => void;
}

export const AgendaGroup = memo(function AgendaGroup({
  date,
  events,
  tasks,
  categoryMap,
  isToday,
  onEventClick,
  onTaskClick,
  onTaskToggle,
}: AgendaGroupProps) {
  const userTimezone = useUserTimezone();
  const dayLabel = formatInTimeZone(date, userTimezone, 'EEEE');
  const dateLabel = formatInTimeZone(date, userTimezone, 'MMMM d, yyyy');
  const hasItems = events.length > 0 || tasks.length > 0;

  return (
    <div className="border-b border-[var(--border)]">
      {/* Date header */}
      <div
        className={cn(
          'sticky top-0 z-10 flex items-baseline gap-2 border-b border-[var(--border)] bg-[var(--background)] px-4 py-2',
          isToday && 'bg-[color-mix(in_srgb,var(--primary)_5%,transparent)]',
        )}
      >
        <span
          className={cn(
            'text-sm font-semibold',
            isToday ? 'text-[var(--primary)]' : 'text-[var(--foreground)]',
          )}
        >
          {dayLabel}
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">{dateLabel}</span>
        {isToday && (
          <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--primary-foreground)]">
            Today
          </span>
        )}
      </div>

      {/* Items */}
      <div className="px-4 py-2">
        {!hasItems && (
          <p className="py-2 text-center text-xs text-[var(--muted-foreground)]">
            No events or tasks
          </p>
        )}

        {/* Events first, then tasks */}
        {events.map((event) => (
          <AgendaEventItem
            key={event.isRecurringInstance ? `${event.id}-${event.instanceDate}` : event.id}
            event={event}
            categoryColor={categoryMap.get(event.categoryId)?.color}
            onClick={onEventClick}
          />
        ))}
        {tasks.map((task) => (
          <AgendaTaskItem
            key={task.isRecurringInstance ? `${task.id}-${task.instanceDate}` : task.id}
            task={task}
            categoryColor={categoryMap.get(task.categoryId)?.color}
            onToggle={onTaskToggle}
            onClick={onTaskClick}
          />
        ))}
      </div>
    </div>
  );
});
