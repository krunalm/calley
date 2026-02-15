import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { MapPin, Repeat } from 'lucide-react';
import { memo } from 'react';

import { useUserTimezone } from '@/hooks/use-user-timezone';
import { cn } from '@/lib/utils';

import type { Event } from '@calley/shared';

interface EventBlockProps {
  event: Event;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  categoryColor?: string;
  onClick?: (event: Event) => void;
}

export const EventBlock = memo(function EventBlock({
  event,
  topPx,
  heightPx,
  leftPercent,
  widthPercent,
  categoryColor,
  onClick,
}: EventBlockProps) {
  const userTimezone = useUserTimezone();
  const color = event.color ?? categoryColor ?? 'var(--primary)';
  const isRecurring = !!event.rrule || !!event.recurringEventId || event.isRecurringInstance;
  const isCompact = heightPx < 40;

  const startLabel = formatInTimeZone(parseISO(event.startAt), userTimezone, 'h:mm a');
  const endLabel = formatInTimeZone(parseISO(event.endAt), userTimezone, 'h:mm a');
  const timeLabel = `${startLabel} – ${endLabel}`;

  return (
    <button
      type="button"
      className={cn(
        'absolute z-10 flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-sm)] border border-white/20 px-1.5 text-left transition-shadow hover:shadow-md',
        isCompact ? 'py-0' : 'py-1',
      )}
      style={{
        top: topPx,
        height: heightPx,
        left: `${leftPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
        backgroundColor: `color-mix(in srgb, ${color} 20%, var(--surface))`,
        borderLeft: `3px solid ${color}`,
      }}
      onClick={() => onClick?.(event)}
      aria-label={`${event.title}, ${timeLabel}`}
    >
      {isCompact ? (
        // Single-line compact layout for short events
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="truncate text-[11px] font-medium leading-tight">
            {event.title}
          </span>
          <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
            {startLabel}
          </span>
        </div>
      ) : (
        // Full layout for events with enough height
        <>
          <span className="truncate text-xs font-semibold leading-tight">
            {event.title}
          </span>
          <span className="text-[10px] leading-tight text-[var(--muted-foreground)]">
            {timeLabel}
          </span>
          {event.location && heightPx >= 64 && (
            <span className="mt-0.5 flex items-center gap-0.5 truncate text-[10px] text-[var(--muted-foreground)]">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
          {isRecurring && heightPx >= 64 && (
            <Repeat className="mt-auto h-2.5 w-2.5 text-[var(--muted-foreground)]" aria-label="Recurring" />
          )}
        </>
      )}
    </button>
  );
});
