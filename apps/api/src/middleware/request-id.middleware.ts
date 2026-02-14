import { createId } from '@paralleldrive/cuid2';

import type { AppVariables } from '../types/hono';
import type { MiddlewareHandler } from 'hono';

export const requestId: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const id = createId();
  c.set('requestId', id);
  c.header('X-Request-ID', id);
  await next();
};
