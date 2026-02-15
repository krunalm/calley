import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCalendarStore } from '@/stores/calendar-store';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const MiniCalendar = memo(function MiniCalendar() {
  const { currentDate, setDate, setView } = useCalendarStore();
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(currentDate));

  useEffect(() => {
    setDisplayMonth(startOfMonth(currentDate));
  }, [currentDate]);

  const monthStart = startOfMonth(displayMonth);
  const monthEnd = endOfMonth(displayMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  function handlePrev() {
    setDisplayMonth((d) => subMonths(d, 1));
  }

  function handleNext() {
    setDisplayMonth((d) => addMonths(d, 1));
  }

  function handleDayClick(day: Date) {
    setDate(day);
    setView('day');
  }

  return (
    <div className="px-2 py-2">
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handlePrev}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium select-none">{format(displayMonth, 'MMM yyyy')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleNext}
          aria-label="Next month"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 text-center">
        {DAY_LABELS.map((label) => (
          <span key={label} className="text-[10px] font-medium text-[var(--muted-foreground)]">
            {label}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 text-center">
        {days.map((day) => {
          const selected = isSameDay(day, currentDate);
          const today = isToday(day);
          const inMonth = isSameMonth(day, displayMonth);

          return (
            <button
              key={day.toISOString()}
              onClick={() => handleDayClick(day)}
              className={cn(
                'mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition-colors',
                !inMonth && 'text-[var(--muted-foreground)] opacity-40',
                inMonth && !selected && !today && 'hover:bg-[var(--accent-ui)]',
                today && !selected && 'font-semibold text-[var(--primary)]',
                selected && 'bg-[var(--primary)] font-semibold text-[var(--primary-foreground)]',
              )}
              aria-label={format(day, 'EEEE, MMMM d, yyyy')}
              aria-current={today ? 'date' : undefined}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
});
