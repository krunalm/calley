import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  addMinutes,
  differenceInMinutes,
  getDate,
  getMonth,
  getYear,
  parseISO,
  set,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { RecurrenceScopeDialog } from '@/components/calendar/RecurrenceScopeDialog';
import { useUpdateEvent } from '@/hooks/use-event-mutations';
import { useKeyboardDnd } from '@/hooks/use-keyboard-dnd';
import { useUpdateTask } from '@/hooks/use-task-mutations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { registerEventPickUp } from '@/lib/keyboard-utils';

import type { EditScope, Event, Task } from '@calley/shared';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

interface KeyboardDndContextValue {
  pickUp: (event: Event) => void;
  isMoving: boolean;
}

const KeyboardDndContext = createContext<KeyboardDndContextValue>({
  pickUp: () => {},
  isMoving: false,
});

/**
 * Access the keyboard-based DnD context to allow event pills/blocks
 * to be picked up via Enter/Space keypress.
 */
export function useKeyboardDndContext() {
  return useContext(KeyboardDndContext);
}

interface DndCalendarProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the calendar area in a DndContext for event drag & drop
 * AND task-to-calendar drag & drop.
 * Handles move (time-based and date-based) operations.
 */
export function DndCalendarProvider({ children }: DndCalendarProviderProps) {
  const userTimezone = useUserTimezone();
  const updateEvent = useUpdateEvent();
  const updateTask = useUpdateTask();
  const keyboardDnd = useKeyboardDnd();

  // Register the keyboard DnD pickUp function globally so the central
  // useKeyboardShortcuts hook can trigger it on Shift+Enter.
  useEffect(() => {
    return registerEventPickUp(keyboardDnd.pickUp);
  }, [keyboardDnd.pickUp]);

  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [pendingDrop, setPendingDrop] = useState<
    | { kind: 'event'; event: Event; newStartAt: string; newEndAt: string }
    | { kind: 'task'; task: Task; newDueAt: string }
    | null
  >(null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);

  // Configure sensors with activation constraints to differentiate clicks from drags
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as
      | { event?: Event; task?: Task; type: string }
      | undefined;
    if (data?.type === 'task-to-calendar' && data.task) {
      setActiveTask(data.task);
    } else if (data?.event) {
      setActiveEvent(data.event);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveEvent(null);
      setActiveTask(null);

      const activeData = event.active.data.current as
        | { event?: Event; task?: Task; type: string }
        | undefined;
      const overData = event.over?.data.current as
        | { date: Date; hour?: number; minutes?: number; type: 'time-slot' | 'day-cell' }
        | undefined;

      if (!activeData || !overData) return;

      // ─── Task-to-calendar drop ──────────────────────────────────
      if (activeData.type === 'task-to-calendar' && activeData.task) {
        const task = activeData.task;
        let newDueAt: Date;

        if (overData.type === 'time-slot') {
          // Drop on a time slot: set due date + time
          const dropTime = new Date(overData.date);
          dropTime.setHours(overData.hour ?? 0, overData.minutes ?? 0, 0, 0);
          newDueAt = fromZonedTime(dropTime, userTimezone);
        } else if (overData.type === 'day-cell') {
          // Drop on a day cell (month view): set due date at noon
          const dropDate = overData.date;
          const noonZoned = set(dropDate, { hours: 12, minutes: 0, seconds: 0 });
          newDueAt = fromZonedTime(noonZoned, userTimezone);
        } else {
          return;
        }

        const newDueAtStr = newDueAt.toISOString();

        // Don't update if same
        if (newDueAtStr === task.dueAt) return;

        const isRecurringTask =
          !!task.rrule || !!task.recurringTaskId || !!task.isRecurringInstance;

        if (isRecurringTask) {
          setPendingDrop({ kind: 'task', task, newDueAt: newDueAtStr });
          setScopeDialogOpen(true);
        } else {
          updateTask.mutate({
            taskId: task.id,
            data: { dueAt: newDueAtStr },
          });
        }

        return;
      }

      // ─── Event drag (existing logic) ────────────────────────────
      if (!activeData.event) return;

      const draggedEvent = activeData.event;
      const eventStart = parseISO(draggedEvent.startAt);
      const eventEnd = parseISO(draggedEvent.endAt);
      const durationMinutes = differenceInMinutes(eventEnd, eventStart);

      let newStart: Date;
      let newEnd: Date;

      if (activeData.type === 'event-resize' && overData.type === 'time-slot') {
        // Resize: keep start, change end
        newStart = eventStart;
        const dropTime = new Date(overData.date);
        dropTime.setHours(overData.hour ?? 0, overData.minutes ?? 0, 0, 0);
        newEnd = fromZonedTime(dropTime, userTimezone);
        // Ensure minimum 15-minute duration
        if (differenceInMinutes(newEnd, newStart) < 15) {
          newEnd = addMinutes(newStart, 15);
        }
      } else if (overData.type === 'time-slot') {
        // Move to a time slot: preserve duration
        const dropTime = new Date(overData.date);
        dropTime.setHours(overData.hour ?? 0, overData.minutes ?? 0, 0, 0);
        newStart = fromZonedTime(dropTime, userTimezone);
        newEnd = addMinutes(newStart, durationMinutes);
      } else if (overData.type === 'day-cell') {
        // Move to a day cell (month view): change date, keep time (timezone-aware)
        const dropDate = overData.date;
        const zonedStart = toZonedTime(eventStart, userTimezone);
        const updatedZoned = set(zonedStart, {
          year: getYear(dropDate),
          month: getMonth(dropDate),
          date: getDate(dropDate),
        });
        newStart = fromZonedTime(updatedZoned, userTimezone);
        newEnd = addMinutes(newStart, durationMinutes);
      } else {
        return;
      }

      const newStartAt = newStart.toISOString();
      const newEndAt = newEnd.toISOString();

      // If same position, no-op
      if (newStartAt === draggedEvent.startAt && newEndAt === draggedEvent.endAt) return;

      const isRecurring =
        !!draggedEvent.rrule || !!draggedEvent.recurringEventId || draggedEvent.isRecurringInstance;

      if (isRecurring) {
        setPendingDrop({ kind: 'event', event: draggedEvent, newStartAt, newEndAt });
        setScopeDialogOpen(true);
      } else {
        updateEvent.mutate({
          eventId: draggedEvent.id,
          data: { startAt: newStartAt, endAt: newEndAt },
        });
      }
    },
    [userTimezone, updateEvent, updateTask],
  );

  const handleScopeConfirm = useCallback(
    (scope: EditScope) => {
      if (!pendingDrop) return;

      if (pendingDrop.kind === 'event') {
        const { event: evt, newStartAt, newEndAt } = pendingDrop;
        updateEvent.mutate({
          eventId: evt.recurringEventId ?? evt.id,
          data: { startAt: newStartAt, endAt: newEndAt },
          scope,
          instanceDate: evt.instanceDate ?? evt.startAt,
        });
      } else {
        const { task, newDueAt } = pendingDrop;
        updateTask.mutate({
          taskId: task.recurringTaskId ?? task.id,
          data: { dueAt: newDueAt },
          scope,
          instanceDate: task.instanceDate ?? task.dueAt ?? undefined,
        });
      }

      setPendingDrop(null);
      setScopeDialogOpen(false);
    },
    [pendingDrop, updateEvent, updateTask],
  );

  const handleScopeCancel = useCallback(() => {
    setPendingDrop(null);
    setScopeDialogOpen(false);
  }, []);

  const keyboardDndValue: KeyboardDndContextValue = {
    pickUp: keyboardDnd.pickUp,
    isMoving: keyboardDnd.isMoving,
  };

  return (
    <KeyboardDndContext.Provider value={keyboardDndValue}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
        {children}

        {/* Ghost overlay during drag */}
        <DragOverlay dropAnimation={null}>
          {activeEvent && (
            <div
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-medium shadow-[var(--shadow-md)]"
              style={{ opacity: 0.85, maxWidth: 200 }}
            >
              {activeEvent.title}
            </div>
          )}
          {activeTask && (
            <div
              className="rounded-[var(--radius-sm)] border border-[var(--primary)] bg-[var(--surface)] px-2 py-1 text-xs font-medium shadow-[var(--shadow-md)]"
              style={{ opacity: 0.85, maxWidth: 200 }}
            >
              {activeTask.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <RecurrenceScopeDialog
        open={scopeDialogOpen}
        onClose={handleScopeCancel}
        onConfirm={handleScopeConfirm}
        action="edit"
      />
    </KeyboardDndContext.Provider>
  );
}
