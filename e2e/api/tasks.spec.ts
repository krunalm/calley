import { errorBody } from '../support/api';
import { ANCHOR, isoPlusDays } from '../support/dates';
import { expect, test } from '../support/fixtures';

/**
 * Task contract: CRUD, filters and sorting, completion toggling,
 * reordering and bulk operations.
 */

function taskPayload(categoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Write the report',
    categoryId,
    ...overrides,
  };
}

test.describe('API — create task', () => {
  test('creates a task with sensible defaults', async ({ api, category }) => {
    const res = await api.post('/tasks', taskPayload(category.id));
    expect(res.status()).toBe(201);

    const task = (await res.json()) as Record<string, unknown>;
    expect(task.title).toBe('Write the report');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('none');
    expect(task.completedAt).toBeNull();
  });

  test('accepts a due date', async ({ api, category }) => {
    const due = isoPlusDays(ANCHOR, 2);
    const task = await api.createTask(taskPayload(category.id, { dueAt: due }));

    expect(new Date(task.dueAt!).toISOString()).toBe(due);
  });

  test('accepts a null due date', async ({ api, category }) => {
    const task = await api.createTask(taskPayload(category.id, { dueAt: null }));
    expect(task.dueAt).toBeNull();
  });

  test('accepts each priority level', async ({ api, category }) => {
    for (const priority of ['low', 'medium', 'high'] as const) {
      const task = await api.createTask(taskPayload(category.id, { priority }));
      expect(task.priority).toBe(priority);
    }
  });

  test('stores a description', async ({ api, category }) => {
    const task = await api.createTask(
      taskPayload(category.id, { description: 'Cover Q3 numbers' }),
    );
    expect(task.description).toBe('Cover Q3 numbers');
  });

  test('strips script tags out of the description', async ({ api, category }) => {
    const task = await api.createTask(
      taskPayload(category.id, { description: 'plan<script>evil()</script>' }),
    );

    expect(task.description).not.toContain('<script');
    expect(task.description).not.toContain('evil(');
    expect(task.description).toContain('plan');
  });

  test('strips inline event handlers out of the description', async ({ api, category }) => {
    const task = await api.createTask(
      taskPayload(category.id, { description: '<img src=x onerror="alert(1)">caption' }),
    );

    expect(task.description).not.toContain('onerror');
  });

  test('keeps allowed formatting tags in the description', async ({ api, category }) => {
    const task = await api.createTask(
      taskPayload(category.id, { description: '<b>bold</b> and <i>italic</i>' }),
    );

    expect(task.description).toContain('bold');
    expect(task.description).toContain('italic');
  });

  test('rejects an empty title', async ({ api, category }) => {
    const res = await api.post('/tasks', taskPayload(category.id, { title: '  ' }));
    expect(res.status()).toBe(400);
  });

  test('rejects a title longer than 200 characters', async ({ api, category }) => {
    const res = await api.post('/tasks', taskPayload(category.id, { title: 'x'.repeat(201) }));
    expect(res.status()).toBe(400);
  });

  test('rejects a description longer than 5000 characters', async ({ api, category }) => {
    const res = await api.post(
      '/tasks',
      taskPayload(category.id, { description: 'x'.repeat(5001) }),
    );
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown priority', async ({ api, category }) => {
    const res = await api.post('/tasks', taskPayload(category.id, { priority: 'urgent' }));
    expect(res.status()).toBe(400);
  });

  test('rejects a non-ISO due date', async ({ api, category }) => {
    const res = await api.post('/tasks', taskPayload(category.id, { dueAt: 'tomorrow' }));
    expect(res.status()).toBe(400);
  });

  test('rejects a missing category', async ({ api }) => {
    const res = await api.post('/tasks', { title: 'Orphan' });
    expect(res.status()).toBe(400);
  });

  test('rejects a category that does not exist', async ({ api }) => {
    const res = await api.post('/tasks', taskPayload('a'.repeat(24)));
    expect(res.status()).toBe(404);
  });

  test("rejects another user's category", async ({ api, otherApi }) => {
    const foreign = await otherApi.defaultCategory();

    const res = await api.post('/tasks', taskPayload(foreign.id));
    expect(res.status()).toBe(404);
  });

  test('creating a task requires authentication', async ({ anonApi, category }) => {
    const res = await anonApi.post('/tasks', taskPayload(category.id));
    expect(res.status()).toBe(401);
  });

  test('creates an inline reminder when a due date is present', async ({ api, category }) => {
    const task = await api.createTask(
      taskPayload(category.id, {
        dueAt: isoPlusDays(ANCHOR, 2),
        reminder: { minutesBefore: 30, method: 'push' },
      }),
    );

    const reminders = (await (
      await api.get('/reminders', { itemType: 'task', itemId: task.id })
    ).json()) as { minutesBefore: number }[];

    expect(reminders).toHaveLength(1);
    expect(reminders[0].minutesBefore).toBe(30);
  });
});

test.describe('API — read tasks', () => {
  test('fetches a single task by id', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    const res = await api.get(`/tasks/${created.id}`);
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(created.id);
  });

  test('returns 404 for an unknown task', async ({ api }) => {
    expect((await api.get(`/tasks/${'a'.repeat(24)}`)).status()).toBe(404);
  });

  test('returns 400 for a malformed task id', async ({ api }) => {
    expect((await api.get('/tasks/not-a-cuid')).status()).toBe(400);
  });

  test("returns 404 for another user's task (no IDOR)", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignTask = await otherApi.createTask(taskPayload(foreignCategory.id));

    expect((await api.get(`/tasks/${foreignTask.id}`)).status()).toBe(404);
  });

  test('a new account starts with no tasks', async ({ api }) => {
    expect(await api.listTasks()).toEqual([]);
  });

  test('lists created tasks', async ({ api, category }) => {
    const a = await api.createTask(taskPayload(category.id, { title: 'A' }));
    const b = await api.createTask(taskPayload(category.id, { title: 'B' }));

    const ids = (await api.listTasks()).map((t) => t.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  test("never lists another user's tasks", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    await otherApi.createTask(taskPayload(foreignCategory.id));

    expect(await api.listTasks()).toEqual([]);
  });

  test('filters by status', async ({ api, category }) => {
    const todo = await api.createTask(taskPayload(category.id, { title: 'Todo' }));
    const done = await api.createTask(taskPayload(category.id, { title: 'Done' }));
    await api.patch(`/tasks/${done.id}/toggle`);

    const ids = (await api.listTasks({ status: 'done' })).map((t) => t.id);
    expect(ids).toContain(done.id);
    expect(ids).not.toContain(todo.id);
  });

  test('filters by several statuses at once', async ({ api, category }) => {
    const todo = await api.createTask(taskPayload(category.id));
    const inProgress = await api.createTask(taskPayload(category.id));
    await api.patch(`/tasks/${inProgress.id}`, { status: 'in_progress' });

    const ids = (await api.listTasks({ status: 'todo,in_progress' })).map((t) => t.id);
    expect(ids).toContain(todo.id);
    expect(ids).toContain(inProgress.id);
  });

  test('filters by priority', async ({ api, category }) => {
    const high = await api.createTask(taskPayload(category.id, { priority: 'high' }));
    const low = await api.createTask(taskPayload(category.id, { priority: 'low' }));

    const ids = (await api.listTasks({ priority: 'high' })).map((t) => t.id);
    expect(ids).toContain(high.id);
    expect(ids).not.toContain(low.id);
  });

  test('filters by a due-date window', async ({ api, category }) => {
    const soon = await api.createTask(taskPayload(category.id, { dueAt: isoPlusDays(ANCHOR, 1) }));
    const later = await api.createTask(
      taskPayload(category.id, { dueAt: isoPlusDays(ANCHOR, 30) }),
    );

    const ids = (
      await api.listTasks({
        dueStart: ANCHOR,
        dueEnd: isoPlusDays(ANCHOR, 7),
      })
    ).map((t) => t.id);

    expect(ids).toContain(soon.id);
    expect(ids).not.toContain(later.id);
  });

  test('sorts by due date', async ({ api, category }) => {
    const late = await api.createTask(
      taskPayload(category.id, { title: 'Late', dueAt: isoPlusDays(ANCHOR, 9) }),
    );
    const early = await api.createTask(
      taskPayload(category.id, { title: 'Early', dueAt: isoPlusDays(ANCHOR, 1) }),
    );

    const ordered = (await api.listTasks({ sort: 'due_at' })).map((t) => t.id);
    expect(ordered.indexOf(early.id)).toBeLessThan(ordered.indexOf(late.id));
  });

  test('sorts by priority, highest first', async ({ api, category }) => {
    const low = await api.createTask(taskPayload(category.id, { priority: 'low' }));
    const high = await api.createTask(taskPayload(category.id, { priority: 'high' }));

    const ordered = (await api.listTasks({ sort: 'priority' })).map((t) => t.id);
    expect(ordered.indexOf(high.id)).toBeLessThan(ordered.indexOf(low.id));
  });

  test('sorts by creation time, newest first', async ({ api, category }) => {
    const first = await api.createTask(taskPayload(category.id, { title: 'First' }));
    const second = await api.createTask(taskPayload(category.id, { title: 'Second' }));

    const ordered = (await api.listTasks({ sort: 'created_at' })).map((t) => t.id);
    expect(ordered.indexOf(second.id)).toBeLessThan(ordered.indexOf(first.id));
  });

  test('rejects an unknown status filter', async ({ api }) => {
    expect((await api.get('/tasks', { status: 'archived' })).status()).toBe(400);
  });

  test('rejects an unknown sort key', async ({ api }) => {
    expect((await api.get('/tasks', { sort: 'title' })).status()).toBe(400);
  });

  test('listing requires authentication', async ({ anonApi }) => {
    expect((await anonApi.get('/tasks')).status()).toBe(401);
  });
});

test.describe('API — update task', () => {
  test('updates the title', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    const res = await api.patch(`/tasks/${created.id}`, { title: 'Renamed task' });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { title: string }).title).toBe('Renamed task');
  });

  test('updates the priority', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    const res = await api.patch(`/tasks/${created.id}`, { priority: 'high' });
    expect(((await res.json()) as { priority: string }).priority).toBe('high');
  });

  test('updates the status to in_progress', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    const res = await api.patch(`/tasks/${created.id}`, { status: 'in_progress' });
    expect(((await res.json()) as { status: string }).status).toBe('in_progress');
  });

  test('setting the status to done stamps completedAt', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    const res = await api.patch(`/tasks/${created.id}`, { status: 'done' });
    const updated = (await res.json()) as { status: string; completedAt: string | null };

    expect(updated.status).toBe('done');
    expect(updated.completedAt).not.toBeNull();
  });

  test('clears the due date with null', async ({ api, category }) => {
    const created = await api.createTask(
      taskPayload(category.id, { dueAt: isoPlusDays(ANCHOR, 1) }),
    );

    const res = await api.patch(`/tasks/${created.id}`, { dueAt: null });
    expect(((await res.json()) as { dueAt: string | null }).dueAt).toBeNull();
  });

  test('moves a task to another category', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));
    const work = await api.createCategory('Work ' + Date.now(), '#10B981');

    const res = await api.patch(`/tasks/${created.id}`, { categoryId: work.id });
    expect(((await res.json()) as { categoryId: string }).categoryId).toBe(work.id);
  });

  test('leaves untouched fields alone', async ({ api, category }) => {
    const created = await api.createTask(
      taskPayload(category.id, { priority: 'high', description: 'Keep me' }),
    );

    await api.patch(`/tasks/${created.id}`, { title: 'New title' });

    const after = (await (await api.get(`/tasks/${created.id}`)).json()) as {
      priority: string;
      description: string;
    };
    expect(after.priority).toBe('high');
    expect(after.description).toBe('Keep me');
  });

  test('sanitizes HTML on update too', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    const res = await api.patch(`/tasks/${created.id}`, {
      description: '<script>steal()</script>ok',
    });
    const updated = (await res.json()) as { description: string };

    expect(updated.description).not.toContain('<script');
    expect(updated.description).toContain('ok');
  });

  test('rejects an unknown status', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    expect((await api.patch(`/tasks/${created.id}`, { status: 'blocked' })).status()).toBe(400);
  });

  test('rejects an empty title', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    expect((await api.patch(`/tasks/${created.id}`, { title: '' })).status()).toBe(400);
  });

  test('returns 404 for an unknown task', async ({ api }) => {
    expect((await api.patch(`/tasks/${'a'.repeat(24)}`, { title: 'x' })).status()).toBe(404);
  });

  test("cannot update another user's task", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignTask = await otherApi.createTask(taskPayload(foreignCategory.id));

    expect((await api.patch(`/tasks/${foreignTask.id}`, { title: 'Hijack' })).status()).toBe(404);
  });

  test('updating requires authentication', async ({ anonApi }) => {
    expect((await anonApi.patch(`/tasks/${'a'.repeat(24)}`, { title: 'x' })).status()).toBe(401);
  });
});

test.describe('API — toggle completion', () => {
  test('marks a todo task as done', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    const res = await api.patch(`/tasks/${created.id}/toggle`);
    expect(res.status()).toBe(200);

    const toggled = (await res.json()) as { status: string; completedAt: string | null };
    expect(toggled.status).toBe('done');
    expect(toggled.completedAt).not.toBeNull();
  });

  test('toggling a done task returns it to todo and clears completedAt', async ({
    api,
    category,
  }) => {
    const created = await api.createTask(taskPayload(category.id));
    await api.patch(`/tasks/${created.id}/toggle`);

    const res = await api.patch(`/tasks/${created.id}/toggle`);
    const toggled = (await res.json()) as { status: string; completedAt: string | null };

    expect(toggled.status).toBe('todo');
    expect(toggled.completedAt).toBeNull();
  });

  test('a completed task appears under the done filter', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));
    await api.patch(`/tasks/${created.id}/toggle`);

    const ids = (await api.listTasks({ status: 'done' })).map((t) => t.id);
    expect(ids).toContain(created.id);
  });

  test('returns 404 for an unknown task', async ({ api }) => {
    expect((await api.patch(`/tasks/${'a'.repeat(24)}/toggle`)).status()).toBe(404);
  });

  test("cannot toggle another user's task", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignTask = await otherApi.createTask(taskPayload(foreignCategory.id));

    expect((await api.patch(`/tasks/${foreignTask.id}/toggle`)).status()).toBe(404);
  });
});

test.describe('API — delete task', () => {
  test('deletes a task and returns 204', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));

    expect((await api.delete(`/tasks/${created.id}`)).status()).toBe(204);
  });

  test('a deleted task is no longer readable', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));
    await api.delete(`/tasks/${created.id}`);

    expect((await api.get(`/tasks/${created.id}`)).status()).toBe(404);
  });

  test('a deleted task drops out of the listing', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));
    await api.delete(`/tasks/${created.id}`);

    expect((await api.listTasks()).map((t) => t.id)).not.toContain(created.id);
  });

  test('deleting twice returns 404 the second time', async ({ api, category }) => {
    const created = await api.createTask(taskPayload(category.id));
    await api.delete(`/tasks/${created.id}`);

    expect((await api.delete(`/tasks/${created.id}`)).status()).toBe(404);
  });

  test("cannot delete another user's task", async ({ api, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    const foreignTask = await otherApi.createTask(taskPayload(foreignCategory.id));

    expect((await api.delete(`/tasks/${foreignTask.id}`)).status()).toBe(404);
    expect((await otherApi.get(`/tasks/${foreignTask.id}`)).status()).toBe(200);
  });
});

test.describe('API — reorder tasks', () => {
  test('applies the requested order', async ({ api, category }) => {
    const a = await api.createTask(taskPayload(category.id, { title: 'A' }));
    const b = await api.createTask(taskPayload(category.id, { title: 'B' }));
    const c = await api.createTask(taskPayload(category.id, { title: 'C' }));

    const res = await api.patch('/tasks/reorder', { ids: [c.id, b.id, a.id] });
    expect(res.status()).toBe(204);

    const ordered = (await api.listTasks({ sort: 'sort_order' })).map((t) => t.id);
    expect(ordered.indexOf(c.id)).toBeLessThan(ordered.indexOf(b.id));
    expect(ordered.indexOf(b.id)).toBeLessThan(ordered.indexOf(a.id));
  });

  test('rejects an empty id list', async ({ api }) => {
    expect((await api.patch('/tasks/reorder', { ids: [] })).status()).toBe(400);
  });

  test('rejects a malformed id', async ({ api }) => {
    expect((await api.patch('/tasks/reorder', { ids: ['nope'] })).status()).toBe(400);
  });

  test('ignores ids belonging to another user', async ({ api, category, otherApi }) => {
    const mine = await api.createTask(taskPayload(category.id));
    const foreignCategory = await otherApi.defaultCategory();
    const foreign = await otherApi.createTask(taskPayload(foreignCategory.id));

    const res = await api.patch('/tasks/reorder', { ids: [foreign.id, mine.id] });
    expect(res.status()).toBe(204);

    // The other user's task keeps its original ordering value.
    const theirs = (await (await otherApi.get(`/tasks/${foreign.id}`)).json()) as {
      sortOrder: number;
    };
    expect(theirs.sortOrder).toBe(0);
  });

  test('reordering requires authentication', async ({ anonApi }) => {
    expect((await anonApi.patch('/tasks/reorder', { ids: ['a'.repeat(24)] })).status()).toBe(401);
  });
});

test.describe('API — bulk operations', () => {
  test('bulk-complete marks every listed task done', async ({ api, category }) => {
    const a = await api.createTask(taskPayload(category.id));
    const b = await api.createTask(taskPayload(category.id));

    const res = await api.patch('/tasks/bulk-complete', { ids: [a.id, b.id] });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { count: number }).count).toBe(2);

    const done = (await api.listTasks({ status: 'done' })).map((t) => t.id);
    expect(done).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  test("bulk-complete only counts the caller's own tasks", async ({ api, category, otherApi }) => {
    const mine = await api.createTask(taskPayload(category.id));
    const foreignCategory = await otherApi.defaultCategory();
    const foreign = await otherApi.createTask(taskPayload(foreignCategory.id));

    const res = await api.patch('/tasks/bulk-complete', { ids: [mine.id, foreign.id] });
    expect(((await res.json()) as { count: number }).count).toBe(1);

    const theirs = (await (await otherApi.get(`/tasks/${foreign.id}`)).json()) as {
      status: string;
    };
    expect(theirs.status).toBe('todo');
  });

  test('bulk-complete rejects an empty list', async ({ api }) => {
    expect((await api.patch('/tasks/bulk-complete', { ids: [] })).status()).toBe(400);
  });

  test('bulk-complete rejects more than 100 ids', async ({ api }) => {
    const ids = Array.from({ length: 101 }, () => 'a'.repeat(24));
    expect((await api.patch('/tasks/bulk-complete', { ids })).status()).toBe(400);
  });

  test('bulk-delete removes every listed task', async ({ api, category }) => {
    const a = await api.createTask(taskPayload(category.id));
    const b = await api.createTask(taskPayload(category.id));

    const res = await api.post('/tasks/bulk-delete', { ids: [a.id, b.id] });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { count: number }).count).toBe(2);

    expect(await api.listTasks()).toEqual([]);
  });

  test("bulk-delete leaves other users' tasks alone", async ({ api, category, otherApi }) => {
    const mine = await api.createTask(taskPayload(category.id));
    const foreignCategory = await otherApi.defaultCategory();
    const foreign = await otherApi.createTask(taskPayload(foreignCategory.id));

    const res = await api.post('/tasks/bulk-delete', { ids: [mine.id, foreign.id] });
    expect(((await res.json()) as { count: number }).count).toBe(1);
    expect((await otherApi.get(`/tasks/${foreign.id}`)).status()).toBe(200);
  });

  test('bulk-delete rejects an empty list', async ({ api }) => {
    const res = await api.post('/tasks/bulk-delete', { ids: [] });
    expect(res.status()).toBe(400);
    expect((await errorBody(res)).code).toBe('VALIDATION_ERROR');
  });

  test('bulk operations require authentication', async ({ anonApi }) => {
    expect((await anonApi.post('/tasks/bulk-delete', { ids: ['a'.repeat(24)] })).status()).toBe(
      401,
    );
  });
});
