import { logger } from '../lib/logger';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

export const requestLogger: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const start = Date.now();
  const requestId = c.get('requestId');

  const log = logger.child({ requestId });
  c.set('log', log);

  log.debug(
    {
      method: c.req.method,
      path: c.req.path,
    },
    'Request received',
  );

  await next();

  const duration = Date.now() - start;

  const logFn = c.res.status >= 500 ? log.error : c.res.status >= 400 ? log.warn : log.info;

  logFn.call(
    log,
    {
      method: c.req.method,
      path: c.req.path,
      statusCode: c.res.status,
      duration,
    },
    'Request completed',
  );
};
