import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Middleware that aborts requests exceeding the specified timeout.
 * Prevents hung requests from consuming server resources indefinitely.
 */
export function requestTimeout(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      // Race the request handler against a timeout promise.
      // The timeout promise resolves rejection via setTimeout directly,
      // avoiding AbortController event listener leaks.
      const result = await Promise.race([
        next(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new AppError(408, 'REQUEST_TIMEOUT', 'Request timed out'));
          }, timeoutMs);
        }),
      ]);
      return result;
    } catch (err) {
      if (err instanceof AppError && err.code === 'REQUEST_TIMEOUT') {
        logger.warn(
          { method: c.req.method, path: c.req.path },
          `Request timed out after ${timeoutMs}ms`,
        );
        throw err;
      }
      throw err;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
