import { useDraggable } from '@dnd-kit/core';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { Repeat } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { EventDetailPopover } from '@/components/events/EventDetailPopover';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { registerEventElement, unregisterEventElement } from '@/lib/keyboard-utils';
import { cn } from '@/lib/utils';

import type { Event } from '@calley/shared';

interface EventPillProps {
  event: Event;
  categoryColor?: string;
  onClick?: (event: Event) => void;
  /** When true, clicking opens the EventDetailPopover instead of calling onClick */
  showPopover?: boolean;
  /** Enable drag-and-drop for this pill */
  draggable?: boolean;
}

export const EventPill = memo(function EventPill({
  event,
  categoryColor,
  onClick,
  showPopover = true,
  draggable = true,
}: EventPillProps) {
  const userTimezone = useUserTimezone();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const color = event.color ?? categoryColor ?? 'var(--primary)';
  const isRecurring = !!event.rrule || !!event.recurringEventId || event.isRecurringInstance;

  const dragId = `pill-move-${event.id}-${event.instanceDate ?? ''}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { type: 'event-move', event },
    disabled: !draggable,
  });

  const timeLabel = event.isAllDay
    ? 'All day'
    : formatInTimeZone(parseISO(event.startAt), userTimezone, 'h:mm a');

  // Register this element in the event WeakMap so the centralized
  // Shift+Enter handler in useKeyboardShortcuts can look up the event.
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = buttonRef.current;
    if (el) {
      registerEventElement(el, event);
      return () => unregisterEventElement(el);
    }
  }, [event]);

  const handleClick = useCallback(() => {
    if (isDragging) return;
    if (showPopover) {
      setPopoverOpen(true);
    } else {
      onClick?.(event);
    }
  }, [event, onClick, showPopover, isDragging]);

  const pill = (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex w-full cursor-grab items-center gap-1 truncate rounded-[var(--radius-sm)] px-1.5 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80',
        isDragging && 'opacity-50',
      )}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderLeft: `3px solid ${color}`,
      }}
      aria-label={`${event.title}, ${timeLabel}`}
      {...attributes}
      {...listeners}
    >
      <button
        ref={buttonRef}
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        onClick={handleClick}
        tabIndex={0}
        data-event-id={event.id}
        aria-label={`${event.title}, ${timeLabel}. Shift+Enter to move with keyboard.`}
      >
        {!event.isAllDay && (
          <span className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
            {formatInTimeZone(parseISO(event.startAt), userTimezone, 'h:mm')}
          </span>
        )}
        <span className="truncate font-medium">{event.title}</span>
      </button>
      {isRecurring && (
        <Repeat
          className="ml-auto h-2.5 w-2.5 shrink-0 text-[var(--muted-foreground)]"
          aria-label="Recurring"
        />
      )}
    </div>
  );

  if (!showPopover) return pill;

  return (
    <EventDetailPopover event={event} open={popoverOpen} onOpenChange={setPopoverOpen}>
      {pill}
    </EventDetailPopover>
  );
});
