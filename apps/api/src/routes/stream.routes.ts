import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';

import { lucia } from '../lib/lucia';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { validate } from '../middleware/validate.middleware';
import { sseService } from '../services/sse.service';

import type { AppVariables } from '../types/hono';

// ─── Zod schema for SSE query params ────────────────────────────────

const streamQuerySchema = z.object({
  token: z.string().min(1).optional(),
});

const stream = new Hono<{ Variables: AppVariables }>();

// Rate limit: max 10 requests per minute per user
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
 * Server-Sent Events stream. Authenticates via session cookie (preferred)
 * or via `?token=<sessionId>` query param as a resilient fallback for
 * browsers that don't send cookies on EventSource reconnect.
 * Connection kept alive with heartbeat every 30 seconds.
 */
stream.get('/', validate('query', streamQuerySchema), async (c) => {
  let userId: string | undefined;

  // 1. Try cookie-based auth (preferred)
  const sessionId = getCookie(c, lucia.sessionCookieName) ?? null;
  if (sessionId) {
    const { session, user } = await lucia.validateSession(sessionId);
    if (session && user) {
      userId = user.id;

      // Refresh session cookie if Lucia says the session was renewed
      if (session.fresh) {
        const sessionCookie = lucia.createSessionCookie(session.id);
        c.header('Set-Cookie', sessionCookie.serialize(), { append: true });
      }
    }
  }

  // 2. Fallback: token query param (for EventSource reconnects without cookies)
  if (!userId) {
    const { token } = c.get('validatedQuery') as z.infer<typeof streamQuerySchema>;
    if (token) {
      const { session, user } = await lucia.validateSession(token);
      if (session && user) {
        userId = user.id;
      }
    }
  }

  // 3. Neither worked — reject
  if (!userId) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  }

  const resolvedUserId = userId;

  let registered: ReturnType<typeof sseService.addConnection> = null;

  const readable = new ReadableStream({
    start(controller) {
      // Register the connection
      const connection = sseService.addConnection(resolvedUserId, controller);
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
          sseService.removeConnection(resolvedUserId, connection);
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
        sseService.removeConnection(resolvedUserId, registered);
        registered = null;
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
