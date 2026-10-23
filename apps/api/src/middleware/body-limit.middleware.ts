import { AppError } from '../lib/errors';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024; // 1MB

/**
 * Middleware that rejects requests with bodies exceeding the specified size.
 * Checks the Content-Length header and rejects oversized requests early.
 *
 * This is the cheap first line of defense only: a chunked request carries no
 * Content-Length and sails past this check. The streaming byte limit that
 * covers those is enforced at the HTTP server layer — see
 * `lib/request-body-guard.ts`, wired up in `index.ts` — and mirrored by
 * `client_max_body_size` in the bundled nginx.
 */
export function bodyLimit(
  maxBytes: number = DEFAULT_MAX_BODY_SIZE,
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const contentLength = c.req.header('content-length');

    if (contentLength) {
      const length = parseInt(contentLength, 10);
      // Reject malformed Content-Length headers to prevent size check bypass
      if (Number.isNaN(length)) {
        throw new AppError(400, 'BAD_REQUEST', 'Invalid Content-Length header');
      }
      if (length > maxBytes) {
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
