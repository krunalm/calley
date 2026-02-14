import { endOfWeek, format, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCalendarStore } from '@/stores/calendar-store';

export function DateNavigator() {
  const { currentDate, view, navigate } = useCalendarStore();

  function getTitle(): string {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy');
      case 'week': {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
        if (weekStart.getMonth() === weekEnd.getMonth()) {
          return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'd, yyyy')}`;
        }
        if (weekStart.getFullYear() === weekEnd.getFullYear()) {
          return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
        }
        return `${format(weekStart, 'MMM d, yyyy')} – ${format(weekEnd, 'MMM d, yyyy')}`;
      }
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'agenda':
        return format(currentDate, 'MMMM yyyy');
      default:
        return format(currentDate, 'MMMM yyyy');
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => navigate('prev')}
        aria-label="Previous"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <h2 className="min-w-[120px] text-center font-display text-lg font-medium select-none sm:min-w-[160px]">
        {getTitle()}
      </h2>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => navigate('next')}
        aria-label="Next"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="ml-1 hidden h-8 text-xs sm:inline-flex"
        onClick={() => navigate('today')}
      >
        Today
      </Button>
    </div>
  );
}
