import { createFileRoute } from '@tanstack/react-router';

import { DayView } from '@/components/calendar/DayView';
import { MonthView } from '@/components/calendar/MonthView';
import { WeekView } from '@/components/calendar/WeekView';
import { useCalendarStore } from '@/stores/calendar-store';

export const Route = createFileRoute('/_app/calendar/')({
  component: CalendarPage,
});

export default function CalendarPage() {
  const { view } = useCalendarStore();

  return (
    <div className="h-full">
      {view === 'month' && <MonthView />}
      {view === 'week' && <WeekView />}
      {view === 'day' && <DayView />}
      {view === 'agenda' && <ViewPlaceholder name="Agenda" />}
    </div>
  );
}

function ViewPlaceholder({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">{name} View</h2>
        <p className="mt-2 text-[var(--muted-foreground)]">
          {name} view will be implemented in upcoming sections.
        </p>
      </div>
    </div>
  );
}
