import { Hono } from 'hono';

import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { sseService } from '../services/sse.service';

import type { AppVariables } from '../types/hono';

const stream = new Hono<{ Variables: AppVariables }>();

// Auth required for SSE stream
stream.use('/*', authMiddleware);

// Rate limit: max 5 connections per user (enforced by sseService, but also at HTTP level)
stream.use(
  '/*',
  rateLimit({
    limit: 10,
    windowSeconds: 60,
    keyPrefix: 'sse',
  }),
);

/**
 * GET /stream
 *
 * Server-Sent Events stream. Requires valid session cookie.
 * Connection kept alive with heartbeat every 30 seconds.
 * Auto-reconnects on client side (EventSource built-in).
 */
stream.get('/', (c) => {
  const userId = c.get('userId')!;

  const readable = new ReadableStream({
    start(controller) {
      // Register the connection
      const connection = sseService.addConnection(userId, controller);

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
  });

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
