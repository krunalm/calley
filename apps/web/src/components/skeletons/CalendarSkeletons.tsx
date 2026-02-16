/**
 * Skeleton loading screens for all calendar views and the task panel.
 * These provide visual placeholders while data is being fetched,
 * preventing layout shift and improving perceived performance.
 */

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Skeleton for MonthView — 6 weeks x 7 days grid */
export function MonthViewSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-[var(--border)]">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="border-r border-[var(--border)] px-2 py-1.5 text-center text-xs font-semibold text-[var(--muted-foreground)]"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        {Array.from({ length: 6 }).map((_, weekIdx) => (
          <div key={weekIdx} className="grid flex-1 grid-cols-7">
            {Array.from({ length: 7 }).map((_, dayIdx) => (
              <div
                key={dayIdx}
                className="min-h-[100px] border-b border-r border-[var(--border)] p-1 sm:min-h-[120px]"
              >
                <div className="mb-1 h-4 w-4 animate-pulse self-end rounded-full bg-[var(--muted)]" />
                {dayIdx % 3 === 0 && (
                  <div className="mt-1 h-4 w-3/4 animate-pulse rounded bg-[var(--muted)]" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for WeekView — time ruler + 7-column grid */
export function WeekViewSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-[var(--border)]">
        <div className="border-r border-[var(--border)] p-1" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center border-r border-[var(--border)] py-2">
            <div className="h-3 w-8 animate-pulse rounded bg-[var(--muted)]" />
            <div className="mt-1 h-6 w-6 animate-pulse rounded-full bg-[var(--muted)]" />
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 12 }).map((_, row) => (
          <div
            key={row}
            className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-[var(--border)]"
          >
            <div className="border-r border-[var(--border)] p-1">
              <div className="h-3 w-10 animate-pulse rounded bg-[var(--muted)]" />
            </div>
            {Array.from({ length: 7 }).map((_, col) => (
              <div key={col} className="h-16 border-r border-[var(--border)]">
                {row === 3 && col === 2 && (
                  <div className="m-1 h-10 animate-pulse rounded bg-[var(--muted)]" />
                )}
                {row === 5 && col === 4 && (
                  <div className="m-1 h-6 animate-pulse rounded bg-[var(--muted)]" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for DayView — single column time grid */
export function DayViewSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-center border-b border-[var(--border)] py-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--muted)]" />
      </div>
      {/* Time grid */}
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 14 }).map((_, row) => (
          <div key={row} className="grid grid-cols-[56px_1fr] border-b border-[var(--border)]">
            <div className="border-r border-[var(--border)] p-1">
              <div className="h-3 w-10 animate-pulse rounded bg-[var(--muted)]" />
            </div>
            <div className="h-16">
              {row === 4 && <div className="m-1 h-12 animate-pulse rounded bg-[var(--muted)]" />}
              {row === 8 && <div className="m-1 h-8 animate-pulse rounded bg-[var(--muted)]" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for AgendaView — chronological list grouped by date */
export function AgendaViewSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 7 }).map((_, groupIdx) => (
        <div key={groupIdx}>
          {/* Date header */}
          <div className="mb-2 flex items-center gap-2">
            <div className="h-4 w-24 animate-pulse rounded bg-[var(--muted)]" />
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          {/* Items */}
          {Array.from({ length: groupIdx % 3 === 0 ? 3 : 2 }).map((_, itemIdx) => (
            <div key={itemIdx} className="mb-2 flex items-center gap-3 rounded-[var(--radius)] p-2">
              <div className="h-10 w-1 animate-pulse rounded-full bg-[var(--muted)]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--muted)]" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for TaskPanel */
export function TaskPanelSkeleton() {
  return (
    <div className="space-y-3 p-3">
      {/* Group header skeleton */}
      <div className="flex items-center gap-2 px-2">
        <div className="h-3 w-16 animate-pulse rounded bg-[var(--muted)]" />
        <div className="h-3 w-4 animate-pulse rounded bg-[var(--muted)]" />
      </div>
      {/* Task item skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-[var(--radius)] px-2 py-1.5">
          <div className="h-4 w-1 animate-pulse rounded-full bg-[var(--muted)]" />
          <div className="h-4 w-4 animate-pulse rounded bg-[var(--muted)]" />
          <div className="h-4 flex-1 animate-pulse rounded bg-[var(--muted)]" />
        </div>
      ))}
      {/* Second group */}
      <div className="flex items-center gap-2 px-2 pt-2">
        <div className="h-3 w-20 animate-pulse rounded bg-[var(--muted)]" />
        <div className="h-3 w-4 animate-pulse rounded bg-[var(--muted)]" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={`g2-${i}`}
          className="flex items-center gap-2.5 rounded-[var(--radius)] px-2 py-1.5"
        >
          <div className="h-4 w-1 animate-pulse rounded-full bg-[var(--muted)]" />
          <div className="h-4 w-4 animate-pulse rounded bg-[var(--muted)]" />
          <div className="h-4 flex-1 animate-pulse rounded bg-[var(--muted)]" />
        </div>
      ))}
    </div>
  );
}
