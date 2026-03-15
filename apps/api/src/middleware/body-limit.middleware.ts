import { AppError } from '../lib/errors';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024; // 1MB

/**
 * Middleware that rejects requests with bodies exceeding the specified size.
 * Checks the Content-Length header and rejects oversized requests early.
 */
export function bodyLimit(
  maxBytes: number = DEFAULT_MAX_BODY_SIZE,
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const contentLength = c.req.header('content-length');

    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (!Number.isNaN(length) && length > maxBytes) {
        throw new AppError(
          413,
          'PAYLOAD_TOO_LARGE',
          `Request body must not exceed ${Math.round(maxBytes / 1024)}KB`,
        );
      }
    }

    await next();
  };
}
