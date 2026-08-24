import { Hono } from 'hono';

import { bodyLimit } from './middleware/body-limit.middleware';
import { createCorsMiddleware } from './middleware/cors.middleware';
import { errorHandler } from './middleware/error-handler.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { rateLimit } from './middleware/rate-limit.middleware';
import { requestId } from './middleware/request-id.middleware';
import { requestTimeout } from './middleware/request-timeout.middleware';
import { securityHeaders } from './middleware/security-headers.middleware';
import auth from './routes/auth.routes';
import categoriesRouter from './routes/categories.routes';
import eventsRouter from './routes/events.routes';
import health from './routes/health.routes';
import pushSubscriptionsRouter from './routes/push-subscriptions.routes';
import remindersRouter from './routes/reminders.routes';
import searchRouter from './routes/search.routes';
import streamRouter from './routes/stream.routes';
import tasksRouter from './routes/tasks.routes';

import type { AppVariables } from './types/hono';

export const app = new Hono<{ Variables: AppVariables }>();

// Global middleware — order matters
app.use('*', requestId);
app.use('*', requestLogger);
app.use('*', securityHeaders);
app.use('*', createCorsMiddleware());
app.use('*', bodyLimit(1024 * 1024)); // 1MB max body size
app.use('*', requestTimeout(30_000)); // 30s request timeout
app.use(
  '*',
  rateLimit({
    limit: 100,
    windowSeconds: 60,
    keyPrefix: 'global',
  }),
);

// Global error handler
app.onError(errorHandler);

// ─── API surface ────────────────────────────────────────────────────

/**
 * Every route the API serves, assembled once and mounted under each supported
 * base path.
 *
 * SPECS.md §API, the README, both `.env.example` files and the deployment
 * health checks all name `/api/v1` as the base — and the documented OAuth
 * redirect URIs are `/api/v1/auth/oauth/<provider>/callback`. That prefix was
 * never actually mounted: routes existed at `/v1` and at the root only. A
 * developer who followed the documented setup got an app whose every request
 * 404'd into a silent bounce back to /login, and the documented OAuth callbacks
 * could not resolve at all.
 *
 * Rather than pick one prefix and break the other clients, the same router is
 * mounted at all three. Hono routers are stateless, so this costs matching, not
 * duplicated handlers.
 */
function createApiRoutes() {
  const api = new Hono<{ Variables: AppVariables }>();

  // Health checks (no auth required)
  api.route('/', health);

  // Auth routes (rate limiting applied per-route in auth.routes.ts)
  api.route('/', auth);

  api.route('/events', eventsRouter);
  api.route('/tasks', tasksRouter);
  api.route('/categories', categoriesRouter);
  api.route('/reminders', remindersRouter);
  api.route('/search', searchRouter);
  api.route('/push-subscriptions', pushSubscriptionsRouter);
  api.route('/stream', streamRouter);

  return api;
}

/** Base paths the API answers on, in the order they should be matched. */
export const API_BASE_PATHS = ['/api/v1', '/v1', '/'] as const;

for (const basePath of API_BASE_PATHS) {
  app.route(basePath, createApiRoutes());
}
