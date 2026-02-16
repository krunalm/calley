import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Provides a global aria-live region for announcing dynamic changes
 * to screen readers (e.g., form errors, navigation changes, DnD feedback).
 */

type AnnounceFn = (message: string, politeness?: 'polite' | 'assertive') => void;

const announceRef: { current: AnnounceFn | null } = { current: null };

/**
 * Announce a message to screen readers via the global aria-live region.
 * Call from anywhere in the app after AriaLiveRegion is mounted.
 */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  announceRef.current?.(message, politeness);
}

export function AriaLiveRegion() {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const politeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const assertiveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const politeRafRef = useRef<number>();
  const assertiveRafRef = useRef<number>();

  const doAnnounce = useCallback(
    (message: string, politeness: 'polite' | 'assertive' = 'polite') => {
      if (politeness === 'assertive') {
        // Clear first to force re-announcement even if same message
        setAssertiveMessage('');
        clearTimeout(assertiveTimeoutRef.current);
        cancelAnimationFrame(assertiveRafRef.current!);
        assertiveRafRef.current = requestAnimationFrame(() => {
          setAssertiveMessage(message);
          assertiveTimeoutRef.current = setTimeout(() => setAssertiveMessage(''), 5000);
        });
      } else {
        setPoliteMessage('');
        clearTimeout(politeTimeoutRef.current);
        cancelAnimationFrame(politeRafRef.current!);
        politeRafRef.current = requestAnimationFrame(() => {
          setPoliteMessage(message);
          politeTimeoutRef.current = setTimeout(() => setPoliteMessage(''), 5000);
        });
      }
    },
    [],
  );

  // Register the announce function globally via effect (not during render)
  useEffect(() => {
    announceRef.current = doAnnounce;
    return () => {
      announceRef.current = null;
    };
  }, [doAnnounce]);

  // Clean up all timers and rAF handles on unmount
  useEffect(() => {
    return () => {
      clearTimeout(politeTimeoutRef.current);
      clearTimeout(assertiveTimeoutRef.current);
      cancelAnimationFrame(politeRafRef.current!);
      cancelAnimationFrame(assertiveRafRef.current!);
    };
  }, []);

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {politeMessage}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertiveMessage}
      </div>
    </>
  );
}
