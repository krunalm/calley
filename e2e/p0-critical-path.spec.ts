import { expect, test } from '@playwright/test';

import { createEvent, createTask, createTestUser, login, logout, signup } from './helpers';

/**
 * P0 — Critical path E2E tests.
 *
 * These cover the most essential user journeys that must work for the app
 * to be considered functional. If any of these fail, the app is broken.
 */

test.describe('P0 — Critical Path', () => {
  test('Signup → create first event → view in month view → verify event pill appears', async ({
    page,
  }) => {
    const user = createTestUser('p0-signup');

    // 1. Sign up a new user
    await signup(page, user);
    await expect(page).toHaveURL(/\/calendar/);

    // 2. Create an event
    await createEvent(page, { title: 'My First Event' });

    // 3. Verify the event appears in the calendar view
    const eventPill = page.getByText('My First Event');
    await expect(eventPill).toBeVisible({ timeout: 10_000 });
  });

  test('Login → logout → login again → verify session', async ({ page }) => {
    const user = createTestUser('p0-session');

    // 1. Sign up and get to calendar
    await signup(page, user);
    await expect(page).toHaveURL(/\/calendar/);

    // 2. Logout
    await logout(page);
    await expect(page).toHaveURL(/\/login/);

    // 3. Login again with same credentials
    await login(page, user);
    await expect(page).toHaveURL(/\/calendar/);

    // 4. Verify the calendar page is accessible (session is valid)
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('Create recurring event → edit single instance → verify series intact', async ({ page }) => {
    const user = createTestUser('p0-recur');
    await signup(page, user);

    // 1. Create a recurring event via the event form
    const createBtn = page.getByRole('button', { name: /create new/i });
    await expect(createBtn).toBeVisible({ timeout: 5_000 });
    await createBtn.click();
    await page.getByRole('menuitem', { name: /new event/i }).click();

    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await page.getByLabel(/^title$/i).fill('Weekly Standup');

    // Open the Repeat select — it renders as a button with current value text
    const repeatTrigger = drawer.locator('button').filter({ hasText: 'Does not repeat' }).first();
    if (await repeatTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await repeatTrigger.click();
      // Select Weekly from the Select dropdown
      await page
        .getByRole('option', { name: /^weekly$/i })
        .first()
        .click();
    }

    await page.getByRole('button', { name: /^create$/i }).click();
    await drawer.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});

    // 2. Verify the event appears
    const eventPill = page.getByText('Weekly Standup').first();
    await expect(eventPill).toBeVisible({ timeout: 10_000 });

    // 3. Click on the event to open the EventDetailPopover
    await eventPill.click();

    // 4. Click the Edit button in the popover (aria-label="Edit event")
    const editBtn = page.getByRole('button', { name: /edit event/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    // 5. The EventDrawer opens in edit mode — modify the title
    const editDrawer = page.locator('[role="dialog"]').first();
    await expect(editDrawer).toBeVisible({ timeout: 5_000 });

    const titleField = page.getByLabel(/^title$/i);
    await expect(titleField).toBeVisible({ timeout: 5_000 });
    await titleField.fill('Modified Standup');
    await page.getByRole('button', { name: /^save$/i }).click();

    // 6. The RecurrenceScopeDialog appears — select "This event" and confirm
    // The radio option "This event" is pre-selected by default (value: 'instance')
    // Just click the Save button in the scope dialog
    const scopeSaveBtn = page.getByRole('button', { name: /^save$/i }).first();
    await expect(scopeSaveBtn).toBeVisible({ timeout: 5_000 });
    await scopeSaveBtn.click();

    // Wait for dialogs to close
    await editDrawer.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});

    // 7. Verify the edited instance shows the modified title
    await expect(page.getByText('Modified Standup').first()).toBeVisible({ timeout: 10_000 });

    // 8. Navigate forward and verify the rest of the series still has the original title
    const dateHeader = page.locator('h2').first();
    const headerBefore = await dateHeader.textContent();
    await page.keyboard.press('ArrowRight');
    await expect(dateHeader).not.toContainText(headerBefore ?? '', { timeout: 5_000 });

    await expect(page.getByText('Weekly Standup').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Create task → check off → verify in done filter', async ({ page }) => {
    const user = createTestUser('p0-task');
    await signup(page, user);

    // 1. Create a task
    await createTask(page, { title: 'Complete report' });

    // 2. Find the task and check it off
    const taskItem = page.getByText('Complete report').first();
    await expect(taskItem).toBeVisible({ timeout: 10_000 });

    // Click the checkbox near the task — TaskItem has role="listitem"
    const checkbox = page
      .locator('[role="listitem"]')
      .filter({ hasText: 'Complete report' })
      .getByRole('checkbox')
      .first();
    await expect(checkbox).toBeVisible({ timeout: 5_000 });
    await checkbox.click();
    await expect(checkbox).toBeChecked({ timeout: 5_000 });

    // 3. Toggle "Show done" filter to reveal completed tasks
    const showDoneBtn = page.getByRole('button', { name: /show done/i });
    await expect(showDoneBtn).toBeVisible({ timeout: 5_000 });
    await showDoneBtn.click();

    // 4. Verify the task is still visible (now in the completed section)
    await expect(page.getByText('Complete report')).toBeVisible({ timeout: 5_000 });
  });
});
