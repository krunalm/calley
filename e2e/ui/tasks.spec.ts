import { expect, test } from '../support/fixtures';

import type { Page } from '@playwright/test';

/**
 * Task panel UI: opening the panel, the task drawer, completion,
 * filtering and the multi-select bulk actions.
 */

const TASK_PANEL = '[role="complementary"][aria-label="Task panel"]';

async function openTaskPanel(page: Page) {
  const panel = page.locator(TASK_PANEL);
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /toggle task panel/i }).click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

async function openTaskDrawer(page: Page) {
  await openTaskPanel(page);
  await page.getByRole('button', { name: /create new task/i }).click();

  const drawer = page.getByRole('dialog').first();
  await expect(drawer).toBeVisible();
  return drawer;
}

/**
 * Open an existing task for editing, waiting for the stored title to land in
 * the form. The drawer mounts before its prefill resolves, so filling too
 * early appends to an empty field and then gets the stored value written in
 * front of it.
 */
async function openTaskForEdit(page: Page, title: string) {
  await page.getByRole('button', { name: `Edit task: ${title}` }).click();

  const drawer = page.getByRole('dialog').first();
  await expect(drawer).toBeVisible();
  await expect(page.getByLabel(/^title$/i)).toHaveValue(title, { timeout: 20_000 });
  return drawer;
}

async function createTaskViaDrawer(page: Page, title: string) {
  const drawer = await openTaskDrawer(page);
  await page.getByLabel(/^title$/i).fill(title);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(drawer).toBeHidden({ timeout: 20_000 });
}

test.describe('UI — task panel', () => {
  test('opens from the topbar toggle', async ({ authedPage }) => {
    await openTaskPanel(authedPage);
  });

  test('closes again from the same toggle', async ({ authedPage }) => {
    const panel = await openTaskPanel(authedPage);
    await authedPage.getByRole('button', { name: /toggle task panel/i }).click();

    await expect(panel).toBeHidden();
  });

  test('the t shortcut toggles the panel', async ({ authedPage }) => {
    await authedPage.locator('body').click({ position: { x: 4, y: 4 }, force: true });
    await authedPage.keyboard.press('t');

    await expect(authedPage.locator(TASK_PANEL)).toBeVisible();
  });

  test('has its own close button', async ({ authedPage }) => {
    const panel = await openTaskPanel(authedPage);
    await authedPage.getByRole('button', { name: /close task panel/i }).click();

    await expect(panel).toBeHidden();
  });

  test('shows an empty state for a new account', async ({ authedPage }) => {
    const panel = await openTaskPanel(authedPage);

    await expect(panel.getByText(/no tasks yet/i)).toBeVisible();
  });

  test('offers a priority filter and a completed toggle', async ({ authedPage }) => {
    const panel = await openTaskPanel(authedPage);

    await expect(panel.getByRole('combobox')).toBeVisible();
    await expect(panel.getByRole('button', { name: /show done/i })).toBeVisible();
  });

  test('lists tasks created through the API', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Seeded task', categoryId: category.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await expect(panel.getByText('Seeded task')).toBeVisible({ timeout: 20_000 });
  });

  test("never lists another account's tasks", async ({ authedPage, otherApi }) => {
    const foreignCategory = await otherApi.defaultCategory();
    await otherApi.createTask({ title: 'Foreign task', categoryId: foreignCategory.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await expect(panel.getByText('Foreign task')).toHaveCount(0);
  });
});

test.describe('UI — task drawer', () => {
  test('opens from the panel', async ({ authedPage }) => {
    const drawer = await openTaskDrawer(authedPage);
    await expect(drawer.getByText('New Task')).toBeVisible();
  });

  test('opens from the create dropdown', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /create new/i }).click();
    await authedPage.getByRole('menuitem', { name: /new task/i }).click();

    await expect(authedPage.getByRole('dialog').first()).toBeVisible();
  });

  test('renders the core fields', async ({ authedPage }) => {
    await openTaskDrawer(authedPage);

    await expect(authedPage.getByLabel(/^title$/i)).toBeVisible();
    await expect(authedPage.getByLabel(/due date/i)).toBeVisible();
    await expect(authedPage.getByLabel(/^description$/i)).toBeVisible();
  });

  test('requires a title', async ({ authedPage }) => {
    await openTaskDrawer(authedPage);
    await authedPage.getByRole('button', { name: /^create$/i }).click();

    await expect(authedPage.locator('#task-title-error')).toContainText(/title is required/i);
  });

  test('Escape closes the drawer', async ({ authedPage }) => {
    const drawer = await openTaskDrawer(authedPage);
    await authedPage.keyboard.press('Escape');

    await expect(drawer).toBeHidden();
  });

  test('cancelling creates nothing', async ({ authedPage, api }) => {
    await openTaskDrawer(authedPage);
    await authedPage.getByLabel(/^title$/i).fill('Abandoned task');
    await authedPage.getByRole('button', { name: /^cancel$/i }).click();

    expect(await api.listTasks()).toEqual([]);
  });

  test('reveals a due time field once a due date is set', async ({ authedPage }) => {
    await openTaskDrawer(authedPage);
    await expect(authedPage.getByLabel(/due time/i)).toHaveCount(0);

    await authedPage.getByLabel(/due date/i).fill('2031-05-04');
    await expect(authedPage.getByLabel(/due time/i)).toBeVisible();
  });

  test('creates a task and shows it in the panel', async ({ authedPage }) => {
    await createTaskViaDrawer(authedPage, 'Write the summary');

    // The optimistic entry and the server row can coexist for a frame, so
    // assert on the first match rather than requiring exactly one.
    await expect(authedPage.locator(TASK_PANEL).getByText('Write the summary').first()).toBeVisible(
      { timeout: 20_000 },
    );
  });

  test('the created task is persisted server-side', async ({ authedPage, api }) => {
    await createTaskViaDrawer(authedPage, 'Persisted task');

    await expect(async () => {
      expect((await api.listTasks()).map((t) => t.title)).toContain('Persisted task');
    }).toPass({ timeout: 20_000 });
  });

  test('stores the chosen priority', async ({ authedPage, api }) => {
    const drawer = await openTaskDrawer(authedPage);
    await authedPage.getByLabel(/^title$/i).fill('High priority task');
    await drawer.getByRole('combobox').first().click();
    await authedPage.getByRole('option', { name: 'High' }).click();
    await authedPage.getByRole('button', { name: /^create$/i }).click();
    await expect(drawer).toBeHidden({ timeout: 20_000 });

    await expect(async () => {
      const tasks = await api.listTasks();
      expect(tasks.find((t) => t.title === 'High priority task')?.priority).toBe('high');
    }).toPass({ timeout: 20_000 });
  });

  test('opens an existing task for editing', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Editable task', categoryId: category.id });
    await authedPage.reload();
    await openTaskPanel(authedPage);

    const drawer = await openTaskForEdit(authedPage, 'Editable task');
    await expect(drawer.getByText('Edit Task')).toBeVisible();
  });

  test('prefills the drawer when editing', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Prefilled task', categoryId: category.id });
    await authedPage.reload();
    await openTaskPanel(authedPage);

    await openTaskForEdit(authedPage, 'Prefilled task');
    await expect(authedPage.getByLabel(/^title$/i)).toHaveValue('Prefilled task');
  });

  test('renames a task', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Old name', categoryId: category.id });
    await authedPage.reload();
    await openTaskPanel(authedPage);

    await openTaskForEdit(authedPage, 'Old name');
    await authedPage.getByLabel(/^title$/i).fill('New name');
    await authedPage.getByRole('button', { name: /^save$/i }).click();

    await expect(async () => {
      expect((await api.listTasks()).map((t) => t.title)).toContain('New name');
    }).toPass({ timeout: 20_000 });
  });

  test('deletes a task from the drawer', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Doomed task', categoryId: category.id });
    await authedPage.reload();
    await openTaskPanel(authedPage);

    await openTaskForEdit(authedPage, 'Doomed task');
    await authedPage.getByRole('button', { name: /^delete$/i }).click();

    await expect(async () => {
      expect(await api.listTasks()).toEqual([]);
    }).toPass({ timeout: 20_000 });
  });
});

test.describe('UI — completing tasks', () => {
  test('checking a task marks it done', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Finish me', categoryId: category.id });
    await authedPage.reload();
    await openTaskPanel(authedPage);

    await authedPage.getByRole('checkbox', { name: /mark "finish me" as complete/i }).click();

    await expect(async () => {
      const tasks = await api.listTasks();
      expect(tasks.find((t) => t.title === 'Finish me')?.status).toBe('done');
    }).toPass({ timeout: 20_000 });
  });

  test('a completed task leaves the open list', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Disappearing task', categoryId: category.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await authedPage
      .getByRole('checkbox', { name: /mark "disappearing task" as complete/i })
      .click();

    await expect(panel.getByText('Disappearing task')).toHaveCount(0, { timeout: 20_000 });
  });

  test('"Show done" reveals completed tasks', async ({ authedPage, api, category }) => {
    const task = await api.createTask({ title: 'Already done', categoryId: category.id });
    await api.patch(`/tasks/${task.id}/toggle`);
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await expect(panel.getByText('Already done')).toHaveCount(0);
    await panel.getByRole('button', { name: /show done/i }).click();

    // The Completed group starts collapsed.
    const completedGroup = panel.getByRole('group', { name: /completed tasks/i });
    await expect(completedGroup).toBeVisible({ timeout: 20_000 });
    await completedGroup
      .getByRole('button', { name: /completed/i })
      .first()
      .click();

    await expect(completedGroup.getByText('Already done')).toBeVisible({ timeout: 20_000 });
  });

  test('unchecking a done task returns it to the open list', async ({
    authedPage,
    api,
    category,
  }) => {
    const task = await api.createTask({ title: 'Back to todo', categoryId: category.id });
    await api.patch(`/tasks/${task.id}/toggle`);
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await panel.getByRole('button', { name: /show done/i }).click();
    const completedGroup = panel.getByRole('group', { name: /completed tasks/i });
    await expect(completedGroup).toBeVisible({ timeout: 20_000 });
    await completedGroup
      .getByRole('button', { name: /completed/i })
      .first()
      .click();

    await authedPage.getByRole('checkbox', { name: /mark "back to todo" as incomplete/i }).click();

    await expect(async () => {
      const tasks = await api.listTasks();
      expect(tasks.find((t) => t.title === 'Back to todo')?.status).toBe('todo');
    }).toPass({ timeout: 20_000 });
  });
});

test.describe('UI — task filters and bulk actions', () => {
  test('filters the list by priority', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'High task', categoryId: category.id, priority: 'high' });
    await api.createTask({ title: 'Low task', categoryId: category.id, priority: 'low' });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await panel.getByRole('combobox').click();
    await authedPage.getByRole('option', { name: 'High' }).click();

    await expect(panel.getByText('High task')).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText('Low task')).toHaveCount(0);
  });

  test('entering select mode reveals the bulk toolbar', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Selectable task', categoryId: category.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await panel.getByRole('button', { name: /enter select mode/i }).click();

    await expect(panel.getByRole('button', { name: /select all/i })).toBeVisible();
    await expect(panel.getByRole('button', { name: /complete selected tasks/i })).toBeVisible();
    await expect(panel.getByRole('button', { name: /delete selected tasks/i })).toBeVisible();
  });

  test('bulk-completes the selected tasks', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Bulk one', categoryId: category.id });
    await api.createTask({ title: 'Bulk two', categoryId: category.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await panel.getByRole('button', { name: /enter select mode/i }).click();
    await panel.getByRole('button', { name: /select all/i }).click();
    await panel.getByRole('button', { name: /complete selected tasks/i }).click();

    await expect(async () => {
      const tasks = await api.listTasks();
      expect(tasks.every((t) => t.status === 'done')).toBe(true);
    }).toPass({ timeout: 20_000 });
  });

  test('bulk delete asks for confirmation first', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Bulk delete me', categoryId: category.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await panel.getByRole('button', { name: /enter select mode/i }).click();
    await panel.getByRole('button', { name: /select all/i }).click();
    await panel.getByRole('button', { name: /delete selected tasks/i }).click();

    await expect(authedPage.getByRole('dialog').getByText(/cannot be undone/i)).toBeVisible();
  });

  test('confirming bulk delete removes the tasks', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Bulk delete me', categoryId: category.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await panel.getByRole('button', { name: /enter select mode/i }).click();
    await panel.getByRole('button', { name: /select all/i }).click();
    await panel.getByRole('button', { name: /delete selected tasks/i }).click();
    await authedPage
      .getByRole('dialog')
      .getByRole('button', { name: /^delete \d+ task/i })
      .click();

    await expect(async () => {
      expect(await api.listTasks()).toEqual([]);
    }).toPass({ timeout: 20_000 });
  });

  test('cancelling the bulk delete keeps the tasks', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Keep me', categoryId: category.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await panel.getByRole('button', { name: /enter select mode/i }).click();
    await panel.getByRole('button', { name: /select all/i }).click();
    await panel.getByRole('button', { name: /delete selected tasks/i }).click();
    await authedPage
      .getByRole('dialog')
      .getByRole('button', { name: /^cancel$/i })
      .click();

    expect((await api.listTasks()).map((t) => t.title)).toContain('Keep me');
  });

  test('leaves select mode again', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Selectable task', categoryId: category.id });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await panel.getByRole('button', { name: /enter select mode/i }).click();
    await panel.getByRole('button', { name: /exit select mode/i }).click();

    await expect(panel.getByRole('button', { name: /select all/i })).toHaveCount(0);
  });

  test('groups overdue tasks separately', async ({ authedPage, api, category }) => {
    await api.createTask({
      title: 'Overdue task',
      categoryId: category.id,
      dueAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    });
    await authedPage.reload();
    const panel = await openTaskPanel(authedPage);

    await expect(panel.getByRole('group', { name: /overdue tasks/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
