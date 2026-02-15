import { cn } from '@/lib/utils';
import { useCalendarStore } from '@/stores/calendar-store';

import type { CalendarView } from '@/stores/calendar-store';

const views: { value: CalendarView; label: string; mobileOnly?: boolean }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' },
];

export function ViewSwitcher() {
  const { view, setView } = useCalendarStore();

  return (
    <div
      className="flex items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0.5"
      role="tablist"
      aria-label="Calendar view"
    >
      {views.map((v) => (
        <button
          key={v.value}
          role="tab"
          aria-selected={view === v.value}
          className={cn(
            'rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium transition-colors',
            // Hide month/week on small tablets (show only day + agenda on mobile)
            (v.value === 'month' || v.value === 'week') && 'hidden lg:block',
            view === v.value
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
          )}
          onClick={() => setView(v.value)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
