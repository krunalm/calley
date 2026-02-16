import { useCallback, useEffect, useState } from 'react';

import { announce } from '@/components/ui/aria-live-region';
import { useUpdateEvent } from '@/hooks/use-event-mutations';

import type { Event } from '@calley/shared';

interface KeyboardDndState {
  /** The event currently "picked up" for keyboard move */
  pickedEvent: Event | null;
  /** Pick up an event for keyboard-based moving */
  pickUp: (event: Event) => void;
  /** Drop the currently held event (cancel the move) */
  cancel: () => void;
  /** Whether an event is currently being moved via keyboard */
  isMoving: boolean;
}

/**
 * Provides keyboard-driven drag-and-drop for calendar events.
 *
 * Usage:
 * - Focus an event pill/block and press Enter or Space to "pick up"
 * - Use Arrow keys (Up/Down) to change time by 30-minute increments
 * - Use Arrow keys (Left/Right) to change day
 * - Press Enter or Space to "drop" at the new position
 * - Press Escape to cancel
 *
 * The hook listens globally when an event is picked up and manages
 * the move via the updateEvent mutation.
 */
export function useKeyboardDnd(): KeyboardDndState {
  const [pickedEvent, setPickedEvent] = useState<Event | null>(null);
  const [offset, setOffset] = useState({ days: 0, minutes: 0 });
  const updateEvent = useUpdateEvent();

  const pickUp = useCallback((event: Event) => {
    setPickedEvent(event);
    setOffset({ days: 0, minutes: 0 });
    announce(
      `Picked up "${event.title}". Use arrow keys to move, Enter to drop, Escape to cancel.`,
      'assertive',
    );
  }, []);

  const cancel = useCallback(() => {
    if (pickedEvent) {
      announce(`Cancelled moving "${pickedEvent.title}"`, 'assertive');
    }
    setPickedEvent(null);
    setOffset({ days: 0, minutes: 0 });
  }, [pickedEvent]);

  const drop = useCallback(() => {
    if (!pickedEvent) return;

    if (offset.days === 0 && offset.minutes === 0) {
      announce(`Dropped "${pickedEvent.title}" at original position`, 'assertive');
      setPickedEvent(null);
      setOffset({ days: 0, minutes: 0 });
      return;
    }

    const start = new Date(pickedEvent.startAt);
    const end = new Date(pickedEvent.endAt);

    start.setDate(start.getDate() + offset.days);
    start.setMinutes(start.getMinutes() + offset.minutes);
    end.setDate(end.getDate() + offset.days);
    end.setMinutes(end.getMinutes() + offset.minutes);

    updateEvent.mutate({
      eventId: pickedEvent.id,
      data: {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      },
    });

    const dayDesc =
      offset.days !== 0
        ? `${Math.abs(offset.days)} day${Math.abs(offset.days) > 1 ? 's' : ''} ${offset.days > 0 ? 'forward' : 'back'}`
        : '';
    const timeDesc =
      offset.minutes !== 0
        ? `${Math.abs(offset.minutes)} minutes ${offset.minutes > 0 ? 'later' : 'earlier'}`
        : '';
    const desc = [dayDesc, timeDesc].filter(Boolean).join(' and ');

    announce(`Dropped "${pickedEvent.title}" ${desc}`, 'assertive');
    setPickedEvent(null);
    setOffset({ days: 0, minutes: 0 });
  }, [pickedEvent, offset, updateEvent]);

  useEffect(() => {
    if (!pickedEvent) return;

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setOffset((prev) => {
            const newMinutes = prev.minutes - 30;
            announce(
              `Move up 30 minutes (${Math.abs(prev.days)} days, ${Math.abs(newMinutes)} minutes offset)`,
            );
            return { ...prev, minutes: newMinutes };
          });
          break;

        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setOffset((prev) => {
            const newMinutes = prev.minutes + 30;
            announce(
              `Move down 30 minutes (${Math.abs(prev.days)} days, ${Math.abs(newMinutes)} minutes offset)`,
            );
            return { ...prev, minutes: newMinutes };
          });
          break;

        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          setOffset((prev) => {
            const newDays = prev.days - 1;
            announce(
              `Move 1 day earlier (${Math.abs(newDays)} days, ${Math.abs(prev.minutes)} minutes offset)`,
            );
            return { ...prev, days: newDays };
          });
          break;

        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          setOffset((prev) => {
            const newDays = prev.days + 1;
            announce(
              `Move 1 day later (${Math.abs(newDays)} days, ${Math.abs(prev.minutes)} minutes offset)`,
            );
            return { ...prev, days: newDays };
          });
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          drop();
          break;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          cancel();
          break;
      }
    }

    // Capture phase so we intercept before other handlers
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [pickedEvent, drop, cancel]);

  return {
    pickedEvent,
    pickUp,
    cancel,
    isMoving: !!pickedEvent,
  };
}
