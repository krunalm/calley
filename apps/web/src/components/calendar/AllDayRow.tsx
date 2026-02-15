import { format } from 'date-fns';
import { memo, useMemo } from 'react';

import { EventPill } from './EventPill';

import type { CalendarCategory, Event } from '@calley/shared';

const MAX_VISIBLE_ALL_DAY = 3;

interface AllDayRowProps {
  days: Date[];
  allDayEventsByDate: Map<string, Event[]>;
  categories: Map<string, CalendarCategory>;
  onEventClick?: (event: Event) => void;
}

export const AllDayRow = memo(function AllDayRow({
  days,
  allDayEventsByDate,
  categories,
  onEventClick,
}: AllDayRowProps) {
  // Check if there are any all-day events at all
  const hasAllDayEvents = useMemo(
    () => allDayEventsByDate.size > 0,
    [allDayEventsByDate],
  );

  if (!hasAllDayEvents) return null;

  return (
    <div className="flex shrink-0 border-b border-[var(--border)]" role="row">
      {/* Label for time gutter alignment */}
      <div className="flex w-14 shrink-0 items-start justify-end border-r border-[var(--border)] px-1 py-1">
        <span className="text-[10px] text-[var(--muted-foreground)]">all-day</span>
      </div>

      {/* Day columns */}
      {days.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const events = allDayEventsByDate.get(dateKey) ?? [];
        const visible = events.slice(0, MAX_VISIBLE_ALL_DAY);
        const overflow = events.length - visible.length;

        return (
          <div
            key={dateKey}
            className="flex flex-1 flex-col gap-0.5 border-r border-[var(--border)] px-0.5 py-1"
          >
            {visible.map((event) => (
              <EventPill
                key={event.id + (event.instanceDate ?? '')}
                event={event}
                categoryColor={categories.get(event.categoryId)?.color}
                onClick={onEventClick}
              />
            ))}
            {overflow > 0 && (
              <span className="px-1 text-[10px] text-[var(--muted-foreground)]">
                +{overflow} more
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
