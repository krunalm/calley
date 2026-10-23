import { Hono } from 'hono';

import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { MAX_QUEUE_BACKLOG_BYTES, sseService } from '../services/sse.service';

import type { AppVariables } from '../types/hono';

const stream = new Hono<{ Variables: AppVariables }>();

// Rate limit first (cheap, anonymous), then authenticate.
stream.use('/*', rateLimit({ limit: 10, windowSeconds: 60, keyPrefix: 'sse' }));

/**
 * Authentication happens exclusively via the session cookie, through the same
 * middleware as every other authenticated route.
 *
 * An earlier `?token=<sessionId>` fallback existed for EventSource reconnects,
 * but it weakened the security model in two ways that no longer pay for it:
 * browsers send `SameSite=Lax` cookies on the top-level GET navigations an
 * EventSource makes (and this app's stream is same-origin behind nginx), and
 * the fallback validated raw session IDs without the idle-session policy, so a
 * week-idle session that normal routes reject could still subscribe. Raw
 * session IDs in URLs also leak into logs, browser history, and Referer
 * headers. EventSource reconnects re-issue the same cookie-authenticated GET,
 * so nothing is lost by removing it.
 */
stream.use('/*', authMiddleware);

/**
 * GET /stream
 *
 * Server-Sent Events stream, authenticated by the session cookie.
 * Connection kept alive with heartbeat every 30 seconds.
 */
stream.get('/', async (c) => {
  const userId = c.get('userId')!;

  let registered: ReturnType<typeof sseService.addConnection> = null;

  const readable = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        // Register the connection
        const connection = sseService.addConnection(userId, controller);
        registered = connection;

        if (!connection) {
          // Global limit reached — close immediately
          try {
            controller.close();
          } catch {
            // Already closed
          }
          return;
        }

        // Send initial connected event
        const encoder = new TextEncoder();
        try {
          controller.enqueue(encoder.encode(':connected\n\n'));
        } catch {
          // Connection may have been immediately closed
        }

        // Clean up when the client disconnects
        // We use the request signal (AbortSignal) to detect disconnection
        const signal = c.req.raw.signal;
        if (signal) {
          const cleanup = () => {
            sseService.removeConnection(userId, connection);
          };

          if (signal.aborted) {
            cleanup();
          } else {
            signal.addEventListener('abort', cleanup, { once: true });
          }
        }
      },

      /**
       * The abort signal is the primary disconnect notification, but it does not
       * fire on every path — a consumer that releases its reader, or a runtime
       * that tears the stream down directly, only reaches `cancel`. Without this
       * the connection stays in the registry forever, counting against the
       * per-user cap and taking a write on every subsequent heartbeat.
       */
      cancel() {
        if (registered) {
          sseService.removeConnection(userId, registered);
          registered = null;
        }
      },
    },
    // Count queued bytes rather than chunks, so the service's backlog ceiling
    // reads off `desiredSize` directly. The default strategy counts chunks
    // against a high-water mark of 1, under which a byte-valued threshold can
    // never be reached.
    new ByteLengthQueuingStrategy({ highWaterMark: MAX_QUEUE_BACKLOG_BYTES }),
  );

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
});

export default stream;
