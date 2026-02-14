import { cors } from 'hono/cors';

export function createCorsMiddleware() {
  const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';

  return cors({
    origin,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  });
}
