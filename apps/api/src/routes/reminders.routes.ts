import { Hono } from 'hono';

import {
  createReminderSchema,
  listRemindersQuerySchema,
  reminderIdParamSchema,
} from '@calley/shared';

import { authMiddleware } from '../middleware/auth.middleware';
import { doubleSubmitCsrf } from '../middleware/csrf.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { validate } from '../middleware/validate.middleware';
import { reminderService } from '../services/reminder.service';

import type { AppVariables } from '../types/hono';
import type { CreateReminderInput, ListRemindersQuery } from '@calley/shared';

const remindersRouter = new Hono<{ Variables: AppVariables }>();

// All reminder routes require authentication
remindersRouter.use('/*', authMiddleware);

// Rate limit: 30 requests per minute per user
remindersRouter.use(
  '/*',
  rateLimit({
    limit: 30,
    windowSeconds: 60,
    keyPrefix: 'reminders',
    keyFn: (c) => c.get('userId') ?? 'unknown',
  }),
);

// ─── GET /reminders — List reminders for an event or task ────────────

remindersRouter.get('/', validate('query', listRemindersQuerySchema), async (c) => {
  const userId = c.get('userId')!;
  const query = c.get('validatedQuery') as ListRemindersQuery;

  const result = await reminderService.listReminders(userId, query);
  return c.json(result);
});

// ─── POST /reminders — Create a reminder ─────────────────────────────

remindersRouter.post('/', doubleSubmitCsrf, validate('json', createReminderSchema), async (c) => {
  const userId = c.get('userId')!;
  const data = c.get('validatedBody') as CreateReminderInput;

  const reminder = await reminderService.createReminder(userId, data);
  return c.json(reminder, 201);
});

// ─── DELETE /reminders/:id — Delete a reminder ───────────────────────

remindersRouter.delete(
  '/:id',
  doubleSubmitCsrf,
  validate('param', reminderIdParamSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };

    await reminderService.deleteReminder(userId, id);
    return c.body(null, 204);
  },
);

export default remindersRouter;
