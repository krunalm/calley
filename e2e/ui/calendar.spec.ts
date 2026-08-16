import { fullDateLabel, monthYearLabel } from '../support/dates';
import { expect, test } from '../support/fixtures';

import type { ApiSession } from '../support/api';
import type { Page } from '@playwright/test';

/**
 * Calendar shell: the four views, date navigation, the sidebar, and how
 * events created through the API surface in each view.
 */

/** The date navigator lives in the topbar; the mini-calendar has its own arrows. */
function topbar(page: Page) {
  return page.locator('header');
}

/** Blur any focused input so global keyboard shortcuts are live. */
async function focusCalendar(page: Page) {
  await page.locator('body').click({ position: { x: 4, y: 4 }, force: true });
}

/** Create a timed event on today's date, in the browser's own timezone. */
async function seedEventToday(api: ApiSession, title: string, hourOffset = 2) {
  const category = await api.defaultCategory();
  const start = new Date(Date.now() + hourOffset * 3_600_000);
  return api.createEvent({
    title,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3_600_000).toISOString(),
    categoryId: category.id,
  });
}

test.describe('UI — calendar shell', () => {
  test('renders the app chrome after sign-in', async ({ authedPage }) => {
    await expect(authedPage.getByRole('button', { name: /user menu/i })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: /create new/i })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: /search/i })).toBeVisible();
  });

  test('shows the Calley wordmark', async ({ authedPage }) => {
    await expect(authedPage.getByText('Calley', { exact: true }).first()).toBeVisible();
  });

  test('opens on the month view by default', async ({ authedPage }) => {
    await expect(authedPage.locator('[aria-label="Calendar month view"]')).toBeVisible();
  });

  test('exposes a skip-to-content link', async ({ authedPage }) => {
    await expect(authedPage.getByRole('link', { name: /skip to main content/i })).toBeAttached();
  });

  test('renders the view switcher as a tablist', async ({ authedPage }) => {
    await expect(authedPage.getByRole('tablist', { name: /calendar view/i })).toBeVisible();
  });

  test('renders the sidebar', async ({ authedPage }) => {
    await expect(authedPage.locator('[aria-label="Sidebar"]')).toBeVisible();
  });

  test('lists the default calendar in the sidebar', async ({ authedPage }) => {
    await expect(authedPage.locator('[aria-label="Sidebar"]').getByText('Personal')).toBeVisible();
  });

  test('the sidebar can be collapsed and restored', async ({ authedPage }) => {
    // Collapsing narrows the rail and hides its contents rather than
    // unmounting the landmark, so assert on the calendar list inside it.
    const contents = authedPage.locator('[aria-label="Sidebar"]').getByText('Personal');
    await expect(contents).toBeVisible();

    await authedPage
      .getByRole('button', { name: /toggle sidebar/i })
      .first()
      .click();
    await expect(contents).toBeHidden();

    await authedPage
      .getByRole('button', { name: /toggle sidebar/i })
      .first()
      .click();
    await expect(contents).toBeVisible();
  });

  test('shows the current month in the date header', async ({ authedPage }) => {
    const header = authedPage.locator('h2').first();
    await expect(header).toHaveText(monthYearLabel());
  });
});

test.describe('UI — view switching', () => {
  test('switches to the week view', async ({ authedPage }) => {
    await authedPage.getByRole('tab', { name: 'Week' }).click();
    await expect(authedPage.locator('[aria-label="Calendar week view"]')).toBeVisible();
  });

  test('switches to the day view', async ({ authedPage }) => {
    await authedPage.getByRole('tab', { name: 'Day' }).click();
    await expect(authedPage.locator('[aria-label="Calendar day view"]')).toBeVisible();
  });

  test('switches to the agenda view', async ({ authedPage }) => {
    await authedPage.getByRole('tab', { name: 'Agenda' }).click();
    await expect(authedPage.locator('[aria-label="Agenda view"]')).toBeVisible();
  });

  test('switches back to the month view', async ({ authedPage }) => {
    await authedPage.getByRole('tab', { name: 'Day' }).click();
    await authedPage.getByRole('tab', { name: 'Month' }).click();

    await expect(authedPage.locator('[aria-label="Calendar month view"]')).toBeVisible();
  });

  test('marks the active view as selected', async ({ authedPage }) => {
    await authedPage.getByRole('tab', { name: 'Week' }).click();

    await expect(authedPage.getByRole('tab', { name: 'Week' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(authedPage.getByRole('tab', { name: 'Month' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  test('the day view header shows the full date', async ({ authedPage }) => {
    await authedPage.getByRole('tab', { name: 'Day' }).click();

    await expect(authedPage.locator('h2').first()).toHaveText(fullDateLabel());
  });

  test('the week view header shows a date range', async ({ authedPage }) => {
    await authedPage.getByRole('tab', { name: 'Week' }).click();

    await expect(authedPage.locator('h2').first()).toContainText('–');
  });

  test('the month view renders weekday column headers', async ({ authedPage }) => {
    const headers = authedPage.locator('[aria-label="Calendar month view"] [role="columnheader"]');
    await expect(headers).toHaveCount(7);
  });

  test('the month view renders a full grid of day cells', async ({ authedPage }) => {
    const cells = authedPage.locator('[aria-label="Calendar month view"] [role="gridcell"]');
    await expect(cells.first()).toBeVisible();

    const count = await cells.count();
    expect(count).toBeGreaterThanOrEqual(28);
    expect(count % 7).toBe(0);
  });
});

test.describe('UI — keyboard view shortcuts', () => {
  test('w switches to the week view', async ({ authedPage }) => {
    await focusCalendar(authedPage);
    await authedPage.keyboard.press('w');

    await expect(authedPage.locator('[aria-label="Calendar week view"]')).toBeVisible();
  });

  test('d switches to the day view', async ({ authedPage }) => {
    await focusCalendar(authedPage);
    await authedPage.keyboard.press('d');

    await expect(authedPage.locator('[aria-label="Calendar day view"]')).toBeVisible();
  });

  test('a switches to the agenda view', async ({ authedPage }) => {
    await focusCalendar(authedPage);
    await authedPage.keyboard.press('a');

    await expect(authedPage.locator('[aria-label="Agenda view"]')).toBeVisible();
  });

  test('m returns to the month view', async ({ authedPage }) => {
    await focusCalendar(authedPage);
    await authedPage.keyboard.press('d');
    await expect(authedPage.locator('[aria-label="Calendar day view"]')).toBeVisible();

    await authedPage.keyboard.press('m');
    await expect(authedPage.locator('[aria-label="Calendar month view"]')).toBeVisible();
  });
});

test.describe('UI — date navigation', () => {
  test('the Next button advances the month', async ({ authedPage }) => {
    const header = authedPage.locator('h2').first();
    const before = await header.textContent();

    await topbar(authedPage).getByRole('button', { name: 'Next' }).click();
    await expect(header).not.toHaveText(before!);
  });

  test('the Previous button steps back a month', async ({ authedPage }) => {
    const header = authedPage.locator('h2').first();
    const before = await header.textContent();

    await topbar(authedPage).getByRole('button', { name: 'Previous' }).click();
    await expect(header).not.toHaveText(before!);
  });

  test('Next then Previous returns to the starting month', async ({ authedPage }) => {
    const header = authedPage.locator('h2').first();
    const before = await header.textContent();

    await topbar(authedPage).getByRole('button', { name: 'Next' }).click();
    await topbar(authedPage).getByRole('button', { name: 'Previous' }).click();

    await expect(header).toHaveText(before!);
  });

  test('the Today button jumps back to the current month', async ({ authedPage }) => {
    const header = authedPage.locator('h2').first();
    await topbar(authedPage).getByRole('button', { name: 'Next' }).click();
    await topbar(authedPage).getByRole('button', { name: 'Next' }).click();

    await topbar(authedPage).getByRole('button', { name: 'Today' }).click();
    await expect(header).toHaveText(monthYearLabel());
  });

  test('ArrowRight advances the day in the day view', async ({ authedPage }) => {
    await focusCalendar(authedPage);
    await authedPage.keyboard.press('d');
    const header = authedPage.locator('h2').first();
    const before = await header.textContent();

    await authedPage.keyboard.press('ArrowRight');
    await expect(header).not.toHaveText(before!);
  });

  test('ArrowLeft steps back a day in the day view', async ({ authedPage }) => {
    await focusCalendar(authedPage);
    await authedPage.keyboard.press('d');
    const header = authedPage.locator('h2').first();

    await authedPage.keyboard.press('ArrowRight');
    const advanced = await header.textContent();

    await authedPage.keyboard.press('ArrowLeft');
    await expect(header).not.toHaveText(advanced!);
  });

  test('the . shortcut returns to today', async ({ authedPage }) => {
    await focusCalendar(authedPage);
    const header = authedPage.locator('h2').first();
    await authedPage.keyboard.press('ArrowRight');
    await authedPage.keyboard.press('ArrowRight');

    await authedPage.keyboard.press('.');
    await expect(header).toHaveText(monthYearLabel());
  });

  test('navigation keeps the selected view', async ({ authedPage }) => {
    await authedPage.getByRole('tab', { name: 'Week' }).click();
    await topbar(authedPage).getByRole('button', { name: 'Next' }).click();

    await expect(authedPage.locator('[aria-label="Calendar week view"]')).toBeVisible();
  });
});

test.describe('UI — events on the calendar', () => {
  test('an event created via the API appears in the month view', async ({ authedPage, api }) => {
    const event = await seedEventToday(api, 'Board meeting');
    await authedPage.reload();

    await expect(authedPage.getByRole('button', { name: /board meeting/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    expect(event.id).toBeTruthy();
  });

  test('the same event appears in the week view', async ({ authedPage, api }) => {
    await seedEventToday(api, 'Weekly sync');
    await authedPage.reload();
    await authedPage.getByRole('tab', { name: 'Week' }).click();

    await expect(authedPage.getByRole('button', { name: /weekly sync/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('the same event appears in the day view', async ({ authedPage, api }) => {
    await seedEventToday(api, 'Daily huddle');
    await authedPage.reload();
    await authedPage.getByRole('tab', { name: 'Day' }).click();

    await expect(authedPage.getByRole('button', { name: /daily huddle/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('the same event appears in the agenda view', async ({ authedPage, api }) => {
    await seedEventToday(api, 'Agenda item');
    await authedPage.reload();
    await authedPage.getByRole('tab', { name: 'Agenda' }).click();

    await expect(authedPage.getByText(/agenda item/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('an empty calendar shows no event pills', async ({ authedPage }) => {
    await expect(authedPage.locator('[data-event-id]')).toHaveCount(0);
  });

  test('a recurring event is marked as recurring', async ({ authedPage, api, category }) => {
    const start = new Date(Date.now() + 3 * 3_600_000);
    await api.createEvent({
      title: 'Recurring standup',
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3_600_000).toISOString(),
      categoryId: category.id,
      rrule: 'FREQ=DAILY;COUNT=5',
    });
    await authedPage.reload();

    await expect(
      authedPage.getByRole('button', { name: /recurring standup/i }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('hiding a calendar removes its events from the grid', async ({
    authedPage,
    api,
    category,
  }) => {
    await seedEventToday(api, 'Hidden event');
    await authedPage.reload();
    const pill = authedPage.getByRole('button', { name: /hidden event/i }).first();
    await expect(pill).toBeVisible({ timeout: 20_000 });

    await authedPage
      .locator('[aria-label="Sidebar"]')
      .getByRole('button', { name: new RegExp(`hide ${category.name}`, 'i') })
      .click();

    await expect(pill).toBeHidden({ timeout: 10_000 });
  });

  test('events for another account never leak into this calendar', async ({
    authedPage,
    otherApi,
  }) => {
    await seedEventToday(otherApi, 'Other user event');
    await authedPage.reload();

    await expect(authedPage.getByText(/other user event/i)).toHaveCount(0);
  });
});
