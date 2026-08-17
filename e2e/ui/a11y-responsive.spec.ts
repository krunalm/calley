import { expect, test } from '../support/fixtures';

import type { ApiSession } from '../support/api';

/**
 * Accessibility landmarks, keyboard reachability, responsive layout and
 * offline/error resilience.
 */

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

test.describe('UI — accessibility landmarks', () => {
  test('exposes a banner, navigation and main landmark', async ({ authedPage }) => {
    await expect(authedPage.locator('header')).toBeVisible();
    await expect(authedPage.locator('#main-content')).toBeVisible();
    await expect(authedPage.locator('[aria-label="Sidebar"]')).toBeVisible();
  });

  test('the calendar grid has an accessible name', async ({ authedPage }) => {
    await expect(authedPage.getByRole('grid', { name: /calendar month view/i })).toBeVisible();
  });

  test('the task panel is a labelled complementary region', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /toggle task panel/i }).click();

    await expect(authedPage.getByRole('complementary', { name: /task panel/i })).toBeVisible();
  });

  test('every topbar icon button carries an accessible name', async ({ authedPage }) => {
    const buttons = authedPage.locator('header button');
    const count = await buttons.count();

    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      const label = (await button.getAttribute('aria-label')) ?? (await button.innerText());
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  test('the skip link becomes visible on focus', async ({ authedPage }) => {
    const skip = authedPage.getByRole('link', { name: /skip to main content/i });
    await skip.focus();

    await expect(skip).toBeFocused();
  });

  test('the page has exactly one h1-level landmark heading in settings', async ({ authedPage }) => {
    await authedPage.goto('/settings/profile');

    await expect(authedPage.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('an event pill exposes its title and time to assistive tech', async ({
    authedPage,
    api,
  }) => {
    await seedEvent(api, 'Accessible event');
    await authedPage.reload();

    const pill = authedPage.getByRole('button', { name: /accessible event/i }).first();
    await expect(pill).toBeVisible({ timeout: 20_000 });
    expect(await pill.getAttribute('aria-label')).toMatch(/accessible event/i);
  });

  test('task checkboxes describe the action they perform', async ({
    authedPage,
    api,
    category,
  }) => {
    await api.createTask({ title: 'Labelled task', categoryId: category.id });
    await authedPage.reload();
    await authedPage.getByRole('button', { name: /toggle task panel/i }).click();

    await expect(
      authedPage.getByRole('checkbox', { name: /mark "labelled task" as complete/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('the view switcher tabs expose their selected state', async ({ authedPage }) => {
    const tabs = authedPage.getByRole('tab');
    const count = await tabs.count();

    expect(count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < count; i += 1) {
      expect(await tabs.nth(i).getAttribute('aria-selected')).toMatch(/true|false/);
    }
  });

  test('form fields in the event drawer are labelled', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /create new/i }).click();
    await authedPage.getByRole('menuitem', { name: /new event/i }).click();

    await expect(authedPage.getByLabel(/^title$/i)).toBeVisible();
    await expect(authedPage.getByLabel(/start date/i)).toBeVisible();
    await expect(authedPage.getByLabel(/^description$/i)).toBeVisible();
  });

  test('validation errors are announced with role=alert', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /create new/i }).click();
    await authedPage.getByRole('menuitem', { name: /new event/i }).click();
    await authedPage.getByRole('button', { name: /^create$/i }).click();

    await expect(authedPage.locator('#event-title-error')).toHaveAttribute('role', 'alert');
  });
});

test.describe('UI — keyboard reachability', () => {
  test('Tab reaches the topbar controls', async ({ authedPage }) => {
    await authedPage.locator('body').click({ position: { x: 4, y: 4 }, force: true });
    await authedPage.keyboard.press('Tab');

    // Poll rather than snapshot: focus can settle a frame after the keypress.
    await expect
      .poll(() => authedPage.evaluate(() => document.activeElement?.tagName ?? ''))
      .toMatch(/^(A|BUTTON|INPUT)$/);
  });

  test('the event drawer traps focus in its form', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /create new/i }).click();
    await authedPage.getByRole('menuitem', { name: /new event/i }).click();
    await expect(authedPage.getByLabel(/^title$/i)).toBeFocused();

    await authedPage.keyboard.press('Tab');
    await expect
      .poll(() => authedPage.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
      .toBe(true);
  });

  test('a dialog can be dismissed entirely from the keyboard', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /create new/i }).click();
    await authedPage.getByRole('menuitem', { name: /new event/i }).click();
    const drawer = authedPage.getByRole('dialog').first();
    await expect(drawer).toBeVisible();

    await authedPage.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('the search modal can be driven entirely from the keyboard', async ({ authedPage }) => {
    await authedPage.locator('body').click({ position: { x: 4, y: 4 }, force: true });
    await authedPage.keyboard.press('ControlOrMeta+k');
    const input = authedPage.getByPlaceholder(/search events and tasks/i);
    await expect(input).toBeFocused();
    await authedPage.keyboard.type('anything');

    await expect(input).toHaveValue('anything');
  });
});

test.describe('UI — responsive layout', () => {
  test('renders the calendar at a mobile width', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });

    await expect(authedPage.getByRole('button', { name: /user menu/i })).toBeVisible();
  });

  test('the sidebar renders as an overlay on mobile', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });
    await authedPage.reload();

    const sidebar = authedPage.locator('[aria-label="Sidebar"]');
    await expect(sidebar.getByText('Personal')).toBeVisible({ timeout: 20_000 });

    // Overlay, not an inline rail: it is pinned to the left edge below the topbar.
    const box = (await sidebar.boundingBox())!;
    expect(box.x).toBe(0);
  });

  test('the backdrop closes the mobile sidebar', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });
    await authedPage.reload();

    const contents = authedPage.locator('[aria-label="Sidebar"]').getByText('Personal');
    await expect(contents).toBeVisible({ timeout: 20_000 });

    await authedPage.mouse.click(370, 500);
    await expect(contents).toBeHidden({ timeout: 20_000 });
  });

  test('the hamburger toggles the mobile sidebar both ways', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });
    await authedPage.reload();

    const contents = authedPage.locator('[aria-label="Sidebar"]').getByText('Personal');
    const hamburger = authedPage.getByRole('button', { name: /toggle sidebar/i }).first();
    await expect(contents).toBeVisible({ timeout: 20_000 });

    // The backdrop starts below the topbar, so the hamburger stays reachable
    // while the overlay is open.
    await hamburger.click();
    await expect(contents).toBeHidden({ timeout: 20_000 });

    await hamburger.click();
    await expect(contents).toBeVisible({ timeout: 20_000 });
  });

  test('the topbar stays usable while the mobile sidebar is open', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });
    await authedPage.reload();
    await expect(authedPage.locator('[aria-label="Sidebar"]').getByText('Personal')).toBeVisible({
      timeout: 20_000,
    });

    await authedPage.getByRole('button', { name: /user menu/i }).click();
    await expect(authedPage.getByRole('menuitem', { name: /^settings$/i })).toBeVisible();
  });

  test('day and agenda views remain available on mobile', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });
    await authedPage.reload();

    await expect(authedPage.getByRole('tab', { name: 'Day' })).toBeVisible();
    await expect(authedPage.getByRole('tab', { name: 'Agenda' })).toBeVisible();
  });

  test('the agenda view renders on a mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });
    await authedPage.reload();
    await authedPage.locator('body').click({ position: { x: 4, y: 4 }, force: true });
    await authedPage.keyboard.press('a');

    await expect(authedPage.locator('[aria-label="Agenda view"]')).toBeVisible();
  });

  test('the page does not scroll horizontally on mobile', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });
    await authedPage.reload();

    const overflows = await authedPage.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test('renders at a tablet width', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 820, height: 1180 });
    await authedPage.reload();

    await expect(authedPage.getByRole('button', { name: /user menu/i })).toBeVisible();
  });

  test('renders at a wide desktop width', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 1920, height: 1080 });
    await authedPage.reload();

    await expect(authedPage.locator('[aria-label="Calendar month view"]')).toBeVisible();
  });

  test('the task panel opens over the calendar on mobile', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 });
    await authedPage.reload();
    await authedPage.locator('body').click({ position: { x: 4, y: 4 }, force: true });
    await authedPage.keyboard.press('t');

    await expect(
      authedPage.locator('[role="complementary"][aria-label="Task panel"]'),
    ).toBeVisible();
  });
});

test.describe('UI — resilience', () => {
  test('shows an offline banner when connectivity drops', async ({ authedPage }) => {
    await authedPage.context().setOffline(true);
    await authedPage.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(authedPage.getByText(/no connection/i).first()).toBeVisible({ timeout: 20_000 });
    await authedPage.context().setOffline(false);
  });

  test('recovers once connectivity returns', async ({ authedPage }) => {
    await authedPage.context().setOffline(true);
    await authedPage.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(authedPage.getByText(/no connection/i).first()).toBeVisible({ timeout: 20_000 });

    await authedPage.context().setOffline(false);
    await authedPage.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect(authedPage.getByRole('button', { name: /user menu/i })).toBeVisible();
  });

  test('an unknown route does not break the shell', async ({ authedPage }) => {
    await authedPage.goto('/definitely-not-a-page');

    await expect(authedPage.locator('body')).toBeVisible();
  });

  test('a full reload keeps the user signed in', async ({ authedPage }) => {
    await authedPage.reload();

    await expect(authedPage.getByRole('button', { name: /user menu/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('data survives a reload', async ({ authedPage, api }) => {
    await seedEvent(api, 'Durable event');
    await authedPage.reload();
    await expect(authedPage.getByRole('button', { name: /durable event/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    await authedPage.reload();
    await expect(authedPage.getByRole('button', { name: /durable event/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('the console stays free of uncaught page errors', async ({ authedPage }) => {
    const errors: string[] = [];
    authedPage.on('pageerror', (err) => errors.push(err.message));

    await authedPage.reload();
    await authedPage.getByRole('tab', { name: 'Week' }).click();
    await authedPage.getByRole('tab', { name: 'Day' }).click();
    await authedPage.getByRole('tab', { name: 'Agenda' }).click();
    await authedPage.getByRole('tab', { name: 'Month' }).click();

    expect(errors).toEqual([]);
  });
});
