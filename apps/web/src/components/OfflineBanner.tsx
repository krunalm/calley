import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WifiOff } from 'lucide-react';

import { useOnlineStatus } from '@/hooks/use-online-status';

/**
 * Banner displayed at the top of the app when the browser goes offline.
 * Automatically hides when connectivity is restored.
 *
 * Spec §8.4: "Handle network offline gracefully — show banner,
 * disable mutations, auto-retry when online."
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          className="flex items-center justify-center gap-2 bg-[var(--color-warning,#d4a017)] px-4 py-1.5 text-sm font-medium text-white"
          role="alert"
          aria-live="assertive"
          initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <WifiOff className="h-4 w-4" />
          You are offline. Changes will sync when you reconnect.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
