import { useDroppable } from '@dnd-kit/core';
import { format, getHours, getMinutes } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { QuickCreatePopover } from '@/components/events/QuickCreatePopover';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { cn } from '@/lib/utils';

import { EventBlock } from './EventBlock';
import { TaskMarker } from './TaskMarker';

import type { CalendarCategory, Event, Task } from '@calley/shared';

/** Height of each 30-minute slot in pixels */
export const SLOT_HEIGHT = 48;

/** Total height for 24 hours (48 slots × SLOT_HEIGHT) */
export const GRID_HEIGHT = 48 * SLOT_HEIGHT;

/** Hours displayed in the time gutter */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface TimeGridColumn {
  date: Date;
  dateKey: string;
  events: Event[];
  tasks: Task[];
}

interface TimeGridProps {
  columns: TimeGridColumn[];
  categories: Map<string, CalendarCategory>;
  onEventClick?: (event: Event) => void;
  onTaskClick?: (task: Task) => void;
  onTaskToggle?: (task: Task) => void;
}

export const TimeGrid = memo(function TimeGrid({
  columns,
  categories,
  onEventClick,
  onTaskClick,
  onTaskToggle,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userTimezone = useUserTimezone();

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const hours = getHours(now);
    const minutes = getMinutes(now);
    const minutesSinceMidnight = hours * 60 + minutes;
    const scrollTarget = (minutesSinceMidnight / (24 * 60)) * GRID_HEIGHT - 200;
    scrollRef.current.scrollTop = Math.max(0, scrollTarget);
  }, []);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="relative flex" style={{ height: GRID_HEIGHT }}>
        {/* Time gutter */}
        <TimeGutter userTimezone={userTimezone} />

        {/* Columns */}
        <div className="relative flex flex-1" style={{ minHeight: GRID_HEIGHT }}>
          {columns.map((col) => (
            <TimeGridColumnView
              key={col.dateKey}
              column={col}
              categories={categories}
              userTimezone={userTimezone}
              onEventClick={onEventClick}
              onTaskClick={onTaskClick}
              onTaskToggle={onTaskToggle}
            />
          ))}

          {/* Current time indicator */}
          <CurrentTimeIndicator />
        </div>
      </div>
    </div>
  );
});

// ─── Time Gutter ──────────────────────────────────────────────────────

const TimeGutter = memo(function TimeGutter({ userTimezone }: { userTimezone: string }) {
  const now = useMemo(() => new Date(), []);
  return (
    <div
      className="sticky left-0 z-10 w-14 shrink-0 border-r border-[var(--border)] bg-[var(--surface)]"
      aria-hidden="true"
    >
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="relative border-b border-[var(--border)]"
          style={{ height: SLOT_HEIGHT * 2 }}
        >
          {hour > 0 && (
            <span className="absolute -top-2.5 right-2 text-[10px] text-[var(--muted-foreground)]">
              {formatHourLabel(hour, userTimezone, now)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});

function formatHourLabel(hour: number, timezone: string, reference: Date): string {
  const d = new Date(reference);
  d.setHours(hour, 0, 0, 0);
  return formatInTimeZone(d, timezone, 'h a');
}

// ─── Column ───────────────────────────────────────────────────────────

interface TimeGridColumnViewProps {
  column: TimeGridColumn;
  categories: Map<string, CalendarCategory>;
  userTimezone: string;
  onEventClick?: (event: Event) => void;
  onTaskClick?: (task: Task) => void;
  onTaskToggle?: (task: Task) => void;
}

const TimeGridColumnView = memo(function TimeGridColumnView({
  column,
  categories,
  userTimezone,
  onEventClick,
  onTaskClick,
  onTaskToggle,
}: TimeGridColumnViewProps) {
  // Compute event layout with overlap handling
  const layoutEvents = useMemo(
    () => computeEventLayout(column.events, userTimezone),
    [column.events, userTimezone],
  );

  return (
    <div className="relative flex-1 border-r border-[var(--border)]">
      {/* Slot grid lines with QuickCreatePopover */}
      {HOURS.map((hour) => (
        <div key={hour} style={{ height: SLOT_HEIGHT * 2 }}>
          <TimeSlot date={column.date} hour={hour} isHalfHour={false} />
          <TimeSlot date={column.date} hour={hour} isHalfHour />
        </div>
      ))}

      {/* Positioned event blocks */}
      {layoutEvents.map((le: LayoutEvent) => (
        <EventBlock
          key={le.event.id + (le.event.instanceDate ?? '')}
          event={le.event}
          topPx={le.topPx}
          heightPx={le.heightPx}
          leftPercent={le.leftPercent}
          widthPercent={le.widthPercent}
          categoryColor={categories.get(le.event.categoryId)?.color}
          onClick={onEventClick}
        />
      ))}

      {/* Task markers */}
      {column.tasks
        .filter((t) => t.dueAt)
        .map((task) => {
          const topPx = getTimePosition(task.dueAt!, userTimezone);
          return (
            <TaskMarker
              key={task.id + (task.instanceDate ?? '')}
              task={task}
              topPx={topPx}
              categoryColor={categories.get(task.categoryId)?.color}
              onClick={onTaskClick}
              onToggle={onTaskToggle}
            />
          );
        })}
    </div>
  );
});

// ─── Time Slot (with QuickCreatePopover) ─────────────────────────────

function TimeSlot({ date, hour, isHalfHour }: { date: Date; hour: number; isHalfHour: boolean }) {
  const [open, setOpen] = useState(false);
  const minutes = isHalfHour ? 30 : 0;

  const droppableId = `slot-${format(date, 'yyyy-MM-dd')}-${hour}-${minutes}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: 'time-slot', date, hour, minutes },
  });

  const defaultTime = useMemo(() => {
    const d = new Date(date);
    d.setHours(hour, minutes, 0, 0);
    return d;
  }, [date, hour, minutes]);

  return (
    <QuickCreatePopover
      open={open}
      onOpenChange={setOpen}
      defaultDate={date}
      defaultTime={defaultTime}
    >
      <button
        ref={setNodeRef}
        type="button"
        className={cn(
          'block h-1/2 w-full hover:bg-[var(--accent-ui)]/5',
          isHalfHour
            ? 'border-b border-[var(--border)]'
            : 'border-b border-dashed border-[var(--border)]/50',
          isOver && 'bg-[var(--primary)]/10',
        )}
        onClick={() => setOpen(true)}
        aria-label={`Create event at ${hour}:${isHalfHour ? '30' : '00'} on ${format(date, 'EEEE, MMMM d')}`}
      />
    </QuickCreatePopover>
  );
}

// ─── Current Time Indicator ───────────────────────────────────────────

function CurrentTimeIndicator() {
  const [position, setPosition] = useState(() => getCurrentTimePosition());

  useEffect(() => {
    const interval = setInterval(() => {
      setPosition(getCurrentTimePosition());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (position < 0) return null;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20"
      style={{ top: position }}
      aria-hidden="true"
    >
      <div className="relative flex items-center">
        <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
        <div className="h-[2px] flex-1 bg-red-500" />
      </div>
    </div>
  );
}

function getCurrentTimePosition(): number {
  const now = new Date();
  const hours = getHours(now);
  const minutes = getMinutes(now);
  const minutesSinceMidnight = hours * 60 + minutes;
  return (minutesSinceMidnight / (24 * 60)) * GRID_HEIGHT;
}

// ─── Event Layout Algorithm ───────────────────────────────────────────

export interface LayoutEvent {
  event: Event;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
}

function getTimePosition(isoString: string, timezone: string): number {
  const date = new Date(isoString);
  const formatted = formatInTimeZone(date, timezone, 'HH:mm');
  const [h, m] = formatted.split(':').map(Number);
  const minutesSinceMidnight = h * 60 + m;
  return (minutesSinceMidnight / (24 * 60)) * GRID_HEIGHT;
}

/**
 * Computes overlap layout for events in a single column.
 * Events that overlap in time are placed side-by-side with reduced width.
 */
function computeEventLayout(events: Event[], timezone: string): LayoutEvent[] {
  // Filter to timed events only (all-day handled separately in AllDayRow)
  const timedEvents = events.filter((e) => !e.isAllDay);
  if (timedEvents.length === 0) return [];

  // Calculate positions
  const positioned = timedEvents.map((event) => {
    const topPx = getTimePosition(event.startAt, timezone);
    const bottomPx = getTimePosition(event.endAt, timezone);
    const heightPx = Math.max(bottomPx - topPx, SLOT_HEIGHT / 2); // minimum height
    return { event, topPx, heightPx };
  });

  // Sort by start time, then by duration (longer first)
  positioned.sort((a, b) => a.topPx - b.topPx || b.heightPx - a.heightPx);

  // Assign columns using a greedy algorithm
  const columns: { topPx: number; heightPx: number; colIndex: number }[][] = [];
  const eventColMap = new Map<string, { colIndex: number }>();

  for (const item of positioned) {
    let placed = false;

    for (let col = 0; col < columns.length; col++) {
      const lastInCol = columns[col][columns[col].length - 1];
      if (lastInCol.topPx + lastInCol.heightPx <= item.topPx) {
        columns[col].push({ ...item, colIndex: col });
        eventColMap.set(item.event.id + (item.event.instanceDate ?? ''), {
          colIndex: col,
        });
        placed = true;
        break;
      }
    }

    if (!placed) {
      const colIndex = columns.length;
      columns.push([{ ...item, colIndex }]);
      eventColMap.set(item.event.id + (item.event.instanceDate ?? ''), {
        colIndex,
      });
    }
  }

  return positioned.map((item) => {
    const key = item.event.id + (item.event.instanceDate ?? '');
    const colInfo = eventColMap.get(key)!;

    // Find how many columns overlap with this event
    const overlapCols = findOverlapColumns(item, positioned, eventColMap);
    const widthPercent = 100 / overlapCols;
    const leftPercent = colInfo.colIndex * widthPercent;

    return {
      ...item,
      leftPercent,
      widthPercent,
    };
  });
}

/**
 * Find the maximum number of simultaneously overlapping events for a given event.
 */
function findOverlapColumns(
  target: { event: Event; topPx: number; heightPx: number },
  allItems: { event: Event; topPx: number; heightPx: number }[],
  colMap: Map<string, { colIndex: number }>,
): number {
  const targetEnd = target.topPx + target.heightPx;
  let maxCol = 0;

  for (const item of allItems) {
    const itemEnd = item.topPx + item.heightPx;
    // Check overlap
    if (item.topPx < targetEnd && itemEnd > target.topPx) {
      const key = item.event.id + (item.event.instanceDate ?? '');
      const colInfo = colMap.get(key);
      if (colInfo) {
        maxCol = Math.max(maxCol, colInfo.colIndex + 1);
      }
    }
  }

  return Math.max(maxCol, 1);
}
