import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { lazy, Suspense } from 'react';

import { DndCalendarProvider } from '@/components/calendar/DndCalendarProvider';
import { viewSwitchVariants } from '@/lib/motion';
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
  const view = useCalendarStore((s) => s.view);
  const viewDirection = useCalendarStore((s) => s.viewDirection);
  const prefersReducedMotion = useReducedMotion();

  const ViewComponent = {
    month: LazyMonthView,
    week: LazyWeekView,
    day: LazyDayView,
    agenda: LazyAgendaView,
  }[view];

  return (
    <DndCalendarProvider>
      <div className="h-full overflow-hidden">
        <AnimatePresence mode="wait" custom={viewDirection}>
          <motion.div
            key={view}
            custom={viewDirection}
            variants={prefersReducedMotion ? undefined : viewSwitchVariants}
            initial={prefersReducedMotion ? false : 'initial'}
            animate="animate"
            exit={prefersReducedMotion ? undefined : 'exit'}
            className="h-full"
          >
            <Suspense fallback={<CalendarViewSkeleton />}>
              <ViewComponent />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
    </DndCalendarProvider>
  );
}
