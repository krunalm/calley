import { Hono } from 'hono';

import { createCorsMiddleware } from './middleware/cors.middleware';
import { errorHandler } from './middleware/error-handler.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { rateLimit } from './middleware/rate-limit.middleware';
import { requestId } from './middleware/request-id.middleware';
import { securityHeaders } from './middleware/security-headers.middleware';
import health from './routes/health.routes';

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
