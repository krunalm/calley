import { Hono } from 'hono';

import { searchQuerySchema } from '@calley/shared';

import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { validate } from '../middleware/validate.middleware';
import { searchService } from '../services/search.service';

import type { AppVariables } from '../types/hono';
import type { SearchQuery } from '@calley/shared';

const searchRouter = new Hono<{ Variables: AppVariables }>();

// Search requires authentication and has its own rate limit (30/min per user)
searchRouter.use(
  '/*',
  authMiddleware,
  rateLimit({
    limit: 30,
    windowSeconds: 60,
    keyPrefix: 'search',
    keyFn: (c) => c.get('userId') ?? 'anonymous',
  }),
);

// ─── GET /search?q=query&limit=20 — Full-text search ──────────────

searchRouter.get('/', validate('query', searchQuerySchema), async (c) => {
  const userId = c.get('userId')!;
  const { q, limit } = c.get('validatedQuery') as SearchQuery;

  const results = await searchService.search(userId, q, limit);
  return c.json(results);
});

export default searchRouter;
