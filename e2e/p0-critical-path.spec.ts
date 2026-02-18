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
    // The _app layout renders a <main> element
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('Create recurring event → edit single instance → verify series intact', async ({ page }) => {
    const user = createTestUser('p0-recur');
    await signup(page, user);

    // 1. Create a recurring event via the event form
    // Open the "Create new" dropdown and select "New Event"
    const createBtn = page.getByRole('button', { name: /create new/i });
    await expect(createBtn).toBeVisible({ timeout: 5_000 });
    await createBtn.click();
    await page.getByRole('menuitem', { name: /new event/i }).click();

    // Wait for the EventDrawer to appear
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await page.getByLabel(/^title$/i).fill('Weekly Standup');

    // Open the "Repeat" select — default value is "Does not repeat"
    const repeatTrigger = drawer.locator('button').filter({ hasText: 'Does not repeat' }).first();
    if (await repeatTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await repeatTrigger.click();

      // Select "Weekly" from the dropdown
      const weeklyOption = page.getByRole('option', { name: /^weekly$/i }).first();
      if (await weeklyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await weeklyOption.click();
      }
    }

    await page.getByRole('button', { name: /^create$/i }).click();

    // Wait for drawer to close
    await drawer.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});

    // 2. Verify the event appears
    const eventPill = page.getByText('Weekly Standup').first();
    await expect(eventPill).toBeVisible({ timeout: 10_000 });

    // 3. Click on the event to edit it — this opens EventDetailPopover
    await eventPill.click();

    // 4. Look for an edit button in the popover to open the edit drawer
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click();
    }

    // 5. Edit just this instance (if edit drawer/form appeared)
    const titleField = page.getByLabel(/^title$/i);
    if (await titleField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleField.fill('Modified Standup');

      await page.getByRole('button', { name: /^save$/i }).click();

      // If scope dialog appears for recurring event, select "This event"
      const thisEventOption = page.getByText('This event', { exact: true }).first();
      if (await thisEventOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await thisEventOption.click();
        // Confirm the scope selection
        const confirmBtn = page.getByRole('button', { name: /^save$/i }).last();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      }
    }

    // 6. Verify the edited instance shows the modified title
    await expect(page.getByText('Modified Standup').first()).toBeVisible({ timeout: 10_000 });

    // 7. Verify the rest of the series still has the original title
    // Navigate forward and wait for the date header to change
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

    // Click the checkbox near the task — TaskItem uses role="listitem"
    const checkbox = page
      .locator('[role="listitem"]')
      .filter({ hasText: 'Complete report' })
      .getByRole('checkbox')
      .first();

    await expect(checkbox).toBeVisible({ timeout: 5_000 });
    await checkbox.click();

    // Wait for checkbox to reflect checked state
    await expect(checkbox).toBeChecked({ timeout: 5_000 });

    // 3. Click "Show done" button to show completed tasks
    // The TaskFilter has a button toggling between "Show done" / "Hide done"
    const showDoneBtn = page.getByRole('button', { name: /show done/i });
    await expect(showDoneBtn).toBeVisible({ timeout: 5_000 });
    await showDoneBtn.click();

    // 4. Verify the task appears in the completed section
    await expect(page.getByText('Complete report')).toBeVisible({ timeout: 5_000 });
  });
});
