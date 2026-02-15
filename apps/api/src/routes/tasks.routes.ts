import { Hono } from 'hono';

import {
  bulkCompleteTasksSchema,
  bulkDeleteTasksSchema,
  createTaskSchema,
  listTasksQuerySchema,
  reorderTasksSchema,
  taskIdParamSchema,
  taskScopeQuerySchema,
  updateTaskSchema,
} from '@calley/shared';

import { authMiddleware } from '../middleware/auth.middleware';
import { doubleSubmitCsrf } from '../middleware/csrf.middleware';
import { validate } from '../middleware/validate.middleware';
import { taskService } from '../services/task.service';

import type { AppVariables } from '../types/hono';
import type {
  BulkCompleteTasksInput,
  BulkDeleteTasksInput,
  CreateTaskInput,
  ListTasksQuery,
  ReorderTasksInput,
  TaskScopeQuery,
  UpdateTaskInput,
} from '@calley/shared';

const tasksRouter = new Hono<{ Variables: AppVariables }>();

// All task routes require authentication
tasksRouter.use('/*', authMiddleware);

// ─── PATCH /tasks/reorder — Reorder tasks (must be before /:id routes) ──

tasksRouter.patch('/reorder', doubleSubmitCsrf, validate('json', reorderTasksSchema), async (c) => {
  const userId = c.get('userId')!;
  const { ids } = c.get('validatedBody') as ReorderTasksInput;

  await taskService.reorderTasks(userId, ids);
  return c.body(null, 204);
});

// ─── PATCH /tasks/bulk-complete — Bulk complete tasks (must be before /:id) ──

tasksRouter.patch(
  '/bulk-complete',
  doubleSubmitCsrf,
  validate('json', bulkCompleteTasksSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { ids } = c.get('validatedBody') as BulkCompleteTasksInput;

    const count = await taskService.bulkComplete(userId, ids);
    return c.json({ count });
  },
);

// ─── POST /tasks/bulk-delete — Bulk delete tasks (must be before /:id) ──

tasksRouter.post(
  '/bulk-delete',
  doubleSubmitCsrf,
  validate('json', bulkDeleteTasksSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { ids } = c.get('validatedBody') as BulkDeleteTasksInput;

    const count = await taskService.bulkDelete(userId, ids);
    return c.json({ count });
  },
);

// ─── GET /tasks — List tasks with filters ──────────────────────────

tasksRouter.get('/', validate('query', listTasksQuerySchema), async (c) => {
  const userId = c.get('userId')!;
  const filters = c.get('validatedQuery') as ListTasksQuery;

  const result = await taskService.listTasks(userId, filters);
  return c.json(result);
});

// ─── POST /tasks — Create a new task ───────────────────────────────

tasksRouter.post('/', doubleSubmitCsrf, validate('json', createTaskSchema), async (c) => {
  const userId = c.get('userId')!;
  const data = c.get('validatedBody') as CreateTaskInput;

  const task = await taskService.createTask(userId, data);
  return c.json(task, 201);
});

// ─── GET /tasks/:id — Get a single task ────────────────────────────

tasksRouter.get('/:id', validate('param', taskIdParamSchema), async (c) => {
  const userId = c.get('userId')!;
  const { id } = c.get('validatedParam') as { id: string };

  const task = await taskService.getTask(userId, id);
  return c.json(task);
});

// ─── PATCH /tasks/:id — Update a task ──────────────────────────────

tasksRouter.patch(
  '/:id',
  doubleSubmitCsrf,
  validate('param', taskIdParamSchema),
  validate('json', updateTaskSchema),
  validate('query', taskScopeQuerySchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };
    const data = c.get('validatedBody') as UpdateTaskInput;
    const { scope, instanceDate } = c.get('validatedQuery') as TaskScopeQuery;

    const task = await taskService.updateTask(userId, id, data, scope, instanceDate);
    return c.json(task);
  },
);

// ─── DELETE /tasks/:id — Delete a task ─────────────────────────────

tasksRouter.delete(
  '/:id',
  doubleSubmitCsrf,
  validate('param', taskIdParamSchema),
  validate('query', taskScopeQuerySchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };
    const { scope, instanceDate } = c.get('validatedQuery') as TaskScopeQuery;

    await taskService.deleteTask(userId, id, scope, instanceDate);
    return c.body(null, 204);
  },
);

// ─── PATCH /tasks/:id/toggle — Toggle task completion ──────────────

tasksRouter.patch(
  '/:id/toggle',
  doubleSubmitCsrf,
  validate('param', taskIdParamSchema),
  async (c) => {
    const userId = c.get('userId')!;
    const { id } = c.get('validatedParam') as { id: string };

    const task = await taskService.toggleTask(userId, id);
    return c.json(task);
  },
);

export default tasksRouter;
