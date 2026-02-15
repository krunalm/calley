import { createFileRoute } from '@tanstack/react-router';

import { AgendaView } from '@/components/calendar/AgendaView';
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
      {view === 'agenda' && <AgendaView />}
    </div>
  );
}
