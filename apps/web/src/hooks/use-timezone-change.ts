import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { queryKeys } from '@/lib/query-keys';
import { useCalendarStore } from '@/stores/calendar-store';

/**
 * Hook that detects browser timezone changes (e.g. user travels,
 * DST transition occurs, or system timezone is changed) and
 * invalidates cached calendar data so views re-render with
 * correct local times.
 *
 * Spec §8.4: "Handle timezone changes and DST transitions."
 *
 * Checks every 60 seconds whether the detected timezone has changed.
 */
export function useTimezoneChange() {
  const queryClient = useQueryClient();
  const setDate = useCalendarStore((s) => s.setDate);
  const lastTimezoneRef = useRef(Intl.DateTimeFormat().resolvedOptions().timeZone);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (currentTz !== lastTimezoneRef.current) {
        lastTimezoneRef.current = currentTz;

        // Invalidate all date-dependent caches so views re-render
        queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });

        // Nudge the calendar store to trigger a re-render
        setDate(new Date());
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [queryClient, setDate]);
}
