import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { Repeat } from 'lucide-react';
import { memo } from 'react';

import { useUserTimezone } from '@/hooks/use-user-timezone';
import { cn } from '@/lib/utils';

import type { Event } from '@calley/shared';

interface EventPillProps {
  event: Event;
  categoryColor?: string;
  onClick?: (event: Event) => void;
}

export const EventPill = memo(function EventPill({
  event,
  categoryColor,
  onClick,
}: EventPillProps) {
  const userTimezone = useUserTimezone();
  const color = event.color ?? categoryColor ?? 'var(--primary)';
  const isRecurring = !!event.rrule || !!event.recurringEventId || event.isRecurringInstance;

  const timeLabel = event.isAllDay
    ? 'All day'
    : formatInTimeZone(parseISO(event.startAt), userTimezone, 'h:mm a');

  return (
    <button
      type="button"
      className={cn(
        'group flex w-full items-center gap-1 truncate rounded-[var(--radius-sm)] px-1.5 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80',
      )}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderLeft: `3px solid ${color}`,
      }}
      onClick={() => onClick?.(event)}
      aria-label={`${event.title}, ${timeLabel}`}
    >
      {!event.isAllDay && (
        <span className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
          {formatInTimeZone(parseISO(event.startAt), userTimezone, 'h:mm')}
        </span>
      )}
      <span className="truncate font-medium">{event.title}</span>
      {isRecurring && (
        <Repeat
          className="ml-auto h-2.5 w-2.5 shrink-0 text-[var(--muted-foreground)]"
          aria-label="Recurring"
        />
      )}
    </button>
  );
});
