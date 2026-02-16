import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { DndCalendarProvider } from '@/components/calendar/DndCalendarProvider';
import { useCalendarStore } from '@/stores/calendar-store';

// Lazy load each calendar view — only the active view is loaded
const LazyMonthView = lazy(() =>
  import('@/components/calendar/MonthView').then((m) => ({ default: m.MonthView })),
);
const LazyWeekView = lazy(() =>
  import('@/components/calendar/WeekView').then((m) => ({ default: m.WeekView })),
);
const LazyDayView = lazy(() =>
  import('@/components/calendar/DayView').then((m) => ({ default: m.DayView })),
);
const LazyAgendaView = lazy(() =>
  import('@/components/calendar/AgendaView').then((m) => ({ default: m.AgendaView })),
);

export const Route = createFileRoute('/_app/calendar/')({
  component: CalendarPage,
});

function CalendarViewSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--primary)]" />
    </div>
  );
}

export default function CalendarPage() {
  const { view } = useCalendarStore();

  return (
    <DndCalendarProvider>
      <div className="h-full">
        <Suspense fallback={<CalendarViewSkeleton />}>
          {view === 'month' && <LazyMonthView />}
          {view === 'week' && <LazyWeekView />}
          {view === 'day' && <LazyDayView />}
          {view === 'agenda' && <LazyAgendaView />}
        </Suspense>
      </div>
    </DndCalendarProvider>
  );
}
