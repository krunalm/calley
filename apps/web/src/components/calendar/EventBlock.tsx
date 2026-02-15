import { useDraggable } from '@dnd-kit/core';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { MapPin, Repeat } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import { EventDetailPopover } from '@/components/events/EventDetailPopover';
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
  /** When true, clicking opens the EventDetailPopover instead of calling onClick */
  showPopover?: boolean;
  /** Enable drag-and-drop for this block */
  draggable?: boolean;
}

export const EventBlock = memo(function EventBlock({
  event,
  topPx,
  heightPx,
  leftPercent,
  widthPercent,
  categoryColor,
  onClick,
  showPopover = true,
  draggable = true,
}: EventBlockProps) {
  const userTimezone = useUserTimezone();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const color = event.color ?? categoryColor ?? 'var(--primary)';
  const isRecurring = !!event.rrule || !!event.recurringEventId || event.isRecurringInstance;
  const isCompact = heightPx < 40;

  const startLabel = formatInTimeZone(parseISO(event.startAt), userTimezone, 'h:mm a');
  const endLabel = formatInTimeZone(parseISO(event.endAt), userTimezone, 'h:mm a');
  const timeLabel = `${startLabel} – ${endLabel}`;

  // Draggable for moving the event
  const moveId = `event-move-${event.id}-${event.instanceDate ?? ''}`;
  const {
    attributes: moveAttrs,
    listeners: moveListeners,
    setNodeRef: setMoveRef,
    isDragging: isMoveDragging,
  } = useDraggable({
    id: moveId,
    data: { type: 'event-move', event },
    disabled: !draggable,
  });

  // Draggable for resizing (bottom edge)
  const resizeId = `event-resize-${event.id}-${event.instanceDate ?? ''}`;
  const {
    attributes: resizeAttrs,
    listeners: resizeListeners,
    setNodeRef: setResizeRef,
    isDragging: isResizeDragging,
  } = useDraggable({
    id: resizeId,
    data: { type: 'event-resize', event },
    disabled: !draggable,
  });

  const isDragging = isMoveDragging || isResizeDragging;

  const handleClick = useCallback(() => {
    if (isDragging) return;
    if (showPopover) {
      setPopoverOpen(true);
    } else {
      onClick?.(event);
    }
  }, [event, onClick, showPopover, isDragging]);

  const block = (
    <div
      ref={setMoveRef}
      className={cn(
        'absolute z-10 flex cursor-grab flex-col overflow-hidden rounded-[var(--radius-sm)] border border-white/20 text-left transition-shadow hover:shadow-md',
        isCompact ? 'py-0' : 'py-1',
        isDragging && 'opacity-50',
      )}
      style={{
        top: topPx,
        height: heightPx,
        left: `${leftPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
        backgroundColor: `color-mix(in srgb, ${color} 20%, var(--surface))`,
        borderLeft: `3px solid ${color}`,
      }}
      aria-label={`${event.title}, ${timeLabel}`}
      {...moveAttrs}
      {...moveListeners}
    >
      {/* Click layer - separate from drag to avoid conflicts */}
      <button
        type="button"
        className="flex flex-1 flex-col overflow-hidden px-1.5 text-left"
        onClick={handleClick}
        tabIndex={-1}
      >
        {isCompact ? (
          <div className="flex items-center gap-1 overflow-hidden">
            <span className="truncate text-[11px] font-medium leading-tight">{event.title}</span>
            <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
              {startLabel}
            </span>
          </div>
        ) : (
          <>
            <span className="truncate text-xs font-semibold leading-tight">{event.title}</span>
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
              <Repeat
                className="mt-auto h-2.5 w-2.5 text-[var(--muted-foreground)]"
                aria-label="Recurring"
              />
            )}
          </>
        )}
      </button>

      {/* Resize handle at bottom */}
      {draggable && !isCompact && (
        <div
          ref={setResizeRef}
          className="absolute bottom-0 left-0 right-0 flex h-3 cursor-s-resize items-center justify-center"
          {...resizeAttrs}
          {...resizeListeners}
        >
          <div className="h-[2px] w-6 rounded-full bg-current opacity-30" />
        </div>
      )}
    </div>
  );

  if (!showPopover) return block;

  return (
    <EventDetailPopover event={event} open={popoverOpen} onOpenChange={setPopoverOpen}>
      {block}
    </EventDetailPopover>
  );
});
