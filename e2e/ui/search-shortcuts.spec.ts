import { expect, test } from '../support/fixtures';

import type { ApiSession } from '../support/api';
import type { Page } from '@playwright/test';

/**
 * Command palette search and the global keyboard shortcuts.
 */

async function blurInputs(page: Page) {
  await page.locator('body').click({ position: { x: 4, y: 4 }, force: true });
}

async function openSearch(page: Page) {
  await page.getByRole('button', { name: /search/i }).click();

  const input = page.getByPlaceholder(/search events and tasks/i);
  await expect(input).toBeVisible();
  return input;
}

async function seedEvent(api: ApiSession, title: string) {
  const category = await api.defaultCategory();
  const start = new Date(Date.now() + 2 * 3_600_000);
  return api.createEvent({
    title,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3_600_000).toISOString(),
    categoryId: category.id,
  });
}

test.describe('UI — search modal', () => {
  test('opens from the topbar button', async ({ authedPage }) => {
    await openSearch(authedPage);
  });

  test('opens with Cmd/Ctrl+K', async ({ authedPage }) => {
    await blurInputs(authedPage);
    await authedPage.keyboard.press('ControlOrMeta+k');

    await expect(authedPage.getByPlaceholder(/search events and tasks/i)).toBeVisible();
  });

  test('shows a prompt before anything is typed', async ({ authedPage }) => {
    await openSearch(authedPage);

    await expect(authedPage.getByText(/type to search events and tasks/i)).toBeVisible();
  });

  test('closes with Escape', async ({ authedPage }) => {
    const input = await openSearch(authedPage);
    await authedPage.keyboard.press('Escape');

    await expect(input).toBeHidden();
  });

  test('closes with a second Cmd/Ctrl+K', async ({ authedPage }) => {
    const input = await openSearch(authedPage);
    await authedPage.keyboard.press('ControlOrMeta+k');

    await expect(input).toBeHidden();
  });

  test('finds a matching event', async ({ authedPage, api }) => {
    await seedEvent(api, 'Budget workshop');
    const input = await openSearch(authedPage);
    await input.fill('budget');

    await expect(authedPage.getByRole('option', { name: /budget workshop/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('finds a matching task', async ({ authedPage, api, category }) => {
    await api.createTask({ title: 'Order stationery', categoryId: category.id });
    const input = await openSearch(authedPage);
    await input.fill('stationery');

    await expect(authedPage.getByRole('option', { name: /order stationery/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('groups results by events and tasks', async ({ authedPage, api, category }) => {
    await seedEvent(api, 'Zebra briefing');
    await api.createTask({ title: 'Zebra follow-up', categoryId: category.id });

    const input = await openSearch(authedPage);
    await input.fill('zebra');

    await expect(authedPage.getByText('Events', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(authedPage.getByText('Tasks', { exact: true })).toBeVisible();
  });

  test('reports when nothing matches', async ({ authedPage }) => {
    const input = await openSearch(authedPage);
    await input.fill('qqzzxxnothing');

    await expect(authedPage.getByText(/no results found/i)).toBeVisible({ timeout: 20_000 });
  });

  test('does not search on a single character', async ({ authedPage, api }) => {
    await seedEvent(api, 'Budget workshop');
    const input = await openSearch(authedPage);
    await input.fill('b');

    await expect(authedPage.getByText(/type to search events and tasks/i)).toBeVisible();
  });

  test('selecting an event navigates to its day', async ({ authedPage, api }) => {
    await seedEvent(api, 'Navigate target');
    const input = await openSearch(authedPage);
    await input.fill('navigate');

    const option = authedPage.getByRole('option', { name: /navigate target/i });
    await expect(option).toBeVisible({ timeout: 20_000 });
    await option.click();

    await expect(authedPage.locator('[aria-label="Calendar day view"]')).toBeVisible({
      timeout: 20_000,
    });
  });

  test('keyboard selection works with the arrow keys and Enter', async ({ authedPage, api }) => {
    await seedEvent(api, 'Keyboard target');
    const input = await openSearch(authedPage);
    await input.fill('keyboard');
    await expect(authedPage.getByRole('option', { name: /keyboard target/i })).toBeVisible({
      timeout: 20_000,
    });

    await authedPage.keyboard.press('ArrowDown');
    await authedPage.keyboard.press('Enter');

    await expect(authedPage.locator('[aria-label="Calendar day view"]')).toBeVisible({
      timeout: 20_000,
    });
  });

  test('clears the query when reopened', async ({ authedPage }) => {
    const input = await openSearch(authedPage);
    await input.fill('temporary');
    await authedPage.keyboard.press('Escape');

    const reopened = await openSearch(authedPage);
    await expect(reopened).toHaveValue('');
  });

  test("never surfaces another account's records", async ({ authedPage, otherApi }) => {
    await seedEvent(otherApi, 'Confidential briefing');
    const input = await openSearch(authedPage);
    await input.fill('confidential');

    await expect(authedPage.getByText(/no results found/i)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('UI — keyboard shortcuts help', () => {
  test('? opens the shortcuts dialog', async ({ authedPage }) => {
    await blurInputs(authedPage);
    await authedPage.keyboard.press('?');

    await expect(
      authedPage.getByRole('dialog').getByRole('heading', { name: 'Keyboard Shortcuts' }),
    ).toBeVisible();
  });

  test('lists the view shortcuts', async ({ authedPage }) => {
    await blurInputs(authedPage);
    await authedPage.keyboard.press('?');
    const dialog = authedPage.getByRole('dialog');

    await expect(dialog.getByText(/month view/i)).toBeVisible();
    await expect(dialog.getByText(/week view/i)).toBeVisible();
    await expect(dialog.getByText(/day view/i)).toBeVisible();
  });

  test('Escape closes the shortcuts dialog', async ({ authedPage }) => {
    await blurInputs(authedPage);
    await authedPage.keyboard.press('?');
    const heading = authedPage
      .getByRole('dialog')
      .getByRole('heading', { name: 'Keyboard Shortcuts' });
    await expect(heading).toBeVisible();

    await authedPage.keyboard.press('Escape');
    await expect(heading).toBeHidden();
  });
});

test.describe('UI — shortcut guards', () => {
  test('typing in a text field does not trigger view shortcuts', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /create new/i }).click();
    await authedPage.getByRole('menuitem', { name: /new event/i }).click();
    await expect(authedPage.getByRole('dialog').first()).toBeVisible();

    // "d" would switch to day view if shortcuts were not guarded.
    await authedPage.getByLabel(/^title$/i).fill('day and week');

    await expect(authedPage.getByLabel(/^title$/i)).toHaveValue('day and week');
    await expect(authedPage.getByRole('dialog').first()).toBeVisible();
  });

  test('Cmd/Ctrl+K still works while typing in a field', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /create new/i }).click();
    await authedPage.getByRole('menuitem', { name: /new event/i }).click();
    await authedPage.getByLabel(/^title$/i).fill('Something');

    await authedPage.keyboard.press('ControlOrMeta+k');
    await expect(authedPage.getByPlaceholder(/search events and tasks/i)).toBeVisible();
  });

  test('Escape closes the search rather than the app shell', async ({ authedPage }) => {
    await blurInputs(authedPage);
    await authedPage.keyboard.press('ControlOrMeta+k');
    await authedPage.keyboard.press('Escape');

    await expect(authedPage.getByRole('button', { name: /user menu/i })).toBeVisible();
  });
});
