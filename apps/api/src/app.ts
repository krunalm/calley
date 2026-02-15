import { Hono } from 'hono';

import { createCorsMiddleware } from './middleware/cors.middleware';
import { errorHandler } from './middleware/error-handler.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { rateLimit } from './middleware/rate-limit.middleware';
import { requestId } from './middleware/request-id.middleware';
import { securityHeaders } from './middleware/security-headers.middleware';
import auth from './routes/auth.routes';
import categoriesRouter from './routes/categories.routes';
import eventsRouter from './routes/events.routes';
import health from './routes/health.routes';
import tasksRouter from './routes/tasks.routes';

import type { AppVariables } from './types/hono';

export const app = new Hono<{ Variables: AppVariables }>();

// Global middleware — order matters
app.use('*', requestId);
app.use('*', requestLogger);
app.use('*', securityHeaders);
app.use('*', createCorsMiddleware());
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

// Event routes (auth required, handled per-route in events.routes.ts)
app.route('/events', eventsRouter);

// Task routes (auth required, handled per-route in tasks.routes.ts)
app.route('/tasks', tasksRouter);

// Category routes (auth required, handled per-route in categories.routes.ts)
app.route('/categories', categoriesRouter);
