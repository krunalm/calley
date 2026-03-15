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

// Health check routes (no auth required)
app.route('/', health);

// Auth routes (rate limiting applied per-route in auth.routes.ts)
app.route('/', auth);

// ─── API v1 routes ──────────────────────────────────────────────────
const v1 = new Hono<{ Variables: AppVariables }>();

v1.route('/events', eventsRouter);
v1.route('/tasks', tasksRouter);
v1.route('/categories', categoriesRouter);
v1.route('/reminders', remindersRouter);
v1.route('/search', searchRouter);
v1.route('/push-subscriptions', pushSubscriptionsRouter);
v1.route('/stream', streamRouter);

app.route('/v1', v1);

// Backwards-compatible routes (same as /v1, for existing clients)
app.route('/events', eventsRouter);
app.route('/tasks', tasksRouter);
app.route('/categories', categoriesRouter);
app.route('/reminders', remindersRouter);
app.route('/search', searchRouter);
app.route('/push-subscriptions', pushSubscriptionsRouter);
app.route('/stream', streamRouter);
