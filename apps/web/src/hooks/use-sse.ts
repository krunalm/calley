import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { queryKeys } from '@/lib/query-keys';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** Maximum reconnect delay in ms (30 seconds) */
const MAX_RECONNECT_DELAY = 30_000;

/** Base reconnect delay in ms */
const BASE_RECONNECT_DELAY = 1_000;

/**
 * Hook that establishes an SSE connection to the backend and
 * invalidates relevant TanStack Query caches on server-pushed events.
 *
 * Must be used inside a QueryClientProvider.
 * Call once at the app root level (e.g., in the authenticated layout).
 */
export function useSSE() {
  const queryClient = useQueryClient();
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      if (!mounted) return;

      // Connect to SSE stream. withCredentials ensures the session cookie
      // is sent with the request. The server also supports a ?token= query
      // param as a fallback for programmatic clients.
      const es = new EventSource(`${API_URL}/stream`, {
        withCredentials: true,
      });

      eventSourceRef.current = es;

      es.onopen = () => {
        retryCountRef.current = 0;
      };

      // ─── Event handlers ─────────────────────────────────────

      es.addEventListener('event:created', () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      });

      es.addEventListener('event:updated', (e) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
        // Notify about concurrent edits from another tab/device
        try {
          const data = JSON.parse(e.data) as { title?: string };
          if (data.title) {
            toast.info(`Event updated: ${data.title}`, { duration: 3000 });
          }
        } catch {
          // Silent refresh is fine
        }
      });

      es.addEventListener('event:deleted', () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      });

      es.addEventListener('task:created', () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      });

      es.addEventListener('task:updated', (e) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        try {
          const data = JSON.parse(e.data) as { title?: string };
          if (data.title) {
            toast.info(`Task updated: ${data.title}`, { duration: 3000 });
          }
        } catch {
          // Silent refresh is fine
        }
      });

      es.addEventListener('task:deleted', () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      });

      es.addEventListener('category:updated', () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
        // Events and tasks reference categories
        queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      });

      es.addEventListener('category:deleted', () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      });

      es.addEventListener('reminder:fired', (e) => {
        try {
          const data = JSON.parse(e.data) as {
            title: string;
            itemType: string;
          };
          const label = data.itemType === 'task' ? 'Task' : 'Event';
          toast.info(`${label} reminder: ${data.title}`, {
            duration: 8000,
          });
        } catch {
          toast.info('You have a reminder', {
            duration: 8000,
          });
        }
      });

      // ─── Error & reconnect ──────────────────────────────────

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        if (!mounted) return;

        // Exponential backoff with jitter
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, retryCountRef.current) + Math.random() * 1000,
          MAX_RECONNECT_DELAY,
        );
        retryCountRef.current++;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [queryClient]);
}
