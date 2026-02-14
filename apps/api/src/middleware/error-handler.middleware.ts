import { ZodError } from 'zod';

import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

import type { AppVariables } from '../types/hono';
import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const errorHandler: ErrorHandler<{ Variables: AppVariables }> = (err, c) => {
  const requestId = c.get('requestId');
  const log = c.get('log') || logger.child({ requestId });

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      log.error({ err, statusCode: err.statusCode, code: err.code }, err.message);
    } else {
      log.warn({ statusCode: err.statusCode, code: err.code }, err.message);
    }

    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      err.statusCode as ContentfulStatusCode,
    );
  }

  if (err instanceof ZodError) {
    log.warn({ issues: err.issues }, 'Validation error');
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: err.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        },
      },
      400,
    );
  }

  log.error({ err }, 'Unhandled error');

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    500,
  );
};
