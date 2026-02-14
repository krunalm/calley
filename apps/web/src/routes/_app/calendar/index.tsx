import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/calendar/')({
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Calendar</h2>
        <p className="mt-2 text-[var(--muted-foreground)]">
          Calendar views will be built in sections 2.5-2.8.
        </p>
      </div>
    </div>
  );
}
