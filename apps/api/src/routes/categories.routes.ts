import { Hono } from 'hono';

import { categoryIdParamSchema, createCategorySchema, updateCategorySchema } from '@calley/shared';

import { authMiddleware } from '../middleware/auth.middleware';
import { doubleSubmitCsrf } from '../middleware/csrf.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { validate } from '../middleware/validate.middleware';
import { categoryService } from '../services/category.service';

import type { AppVariables } from '../types/hono';
import type { CreateCategoryInput, UpdateCategoryInput } from '@calley/shared';

const categoriesRouter = new Hono<{ Variables: AppVariables }>();

// All category routes require authentication and rate limiting
categoriesRouter.use(
  '/*',
  rateLimit({ limit: 100, windowSeconds: 60, keyPrefix: 'categories' }),
  authMiddleware,
);

// ─── GET /categories — List all categories ──────────────────────────

categoriesRouter.get('/', async (c) => {
  const userId = c.get('userId')!;

  const categories = await categoryService.listCategories(userId);
  return c.json(categories);
});

// ─── POST /categories — Create a new category ──────────────────────

categoriesRouter.post('/', doubleSubmitCsrf, validate('json', createCategorySchema), async (c) => {
  const userId = c.get('userId')!;
  const data = c.get('validatedBody') as CreateCategoryInput;

  const category = await categoryService.createCategory(userId, data);
  return c.json(category, 201);
});

// ─── PATCH /categories/:id — Update a category ─────────────────────

categoriesRouter.patch(
  '/:id',
  doubleSubmitCsrf,
  validate('param', categoryIdParamSchema),
  validate('json', updateCategorySchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };
    const data = c.get('validatedBody') as UpdateCategoryInput;

    const category = await categoryService.updateCategory(userId, id, data);
    return c.json(category);
  },
);

// ─── DELETE /categories/:id — Delete a category ────────────────────

categoriesRouter.delete(
  '/:id',
  doubleSubmitCsrf,
  validate('param', categoryIdParamSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };

    await categoryService.deleteCategory(userId, id);
    return c.body(null, 204);
  },
);

export default categoriesRouter;
