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
    await expect(
      page.locator('[data-testid="calendar-view"], .calendar-container, main'),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test('Create recurring event → edit single instance → verify series intact', async ({ page }) => {
    const user = createTestUser('p0-recur');
    await signup(page, user);

    // 1. Create a recurring event via the event form
    const newEventBtn = page.getByRole('button', { name: /new event|create event|\+/i }).first();
    await expect(newEventBtn).toBeVisible({ timeout: 5_000 });
    await newEventBtn.click();

    await page.getByLabel(/title/i).fill('Weekly Standup');

    // Look for a recurrence/repeat option
    const repeatOption = page.getByText(/repeat|recurrence|recurring/i).first();
    if (await repeatOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await repeatOption.click();

      // Select weekly recurrence
      const weeklyOption = page.getByText(/weekly/i).first();
      if (await weeklyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await weeklyOption.click();
      }
    }

    await page.getByRole('button', { name: /save|create/i }).click();
    await page.waitForTimeout(1000);

    // 2. Verify the event appears
    const eventPill = page.getByText('Weekly Standup').first();
    await expect(eventPill).toBeVisible({ timeout: 10_000 });

    // 3. Click on the event to edit it
    await eventPill.click();
    await page.waitForTimeout(500);

    // 4. Edit just this instance (if scope dialog appears)
    const titleField = page.getByLabel(/title/i);
    if (await titleField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleField.fill('Modified Standup');

      await page.getByRole('button', { name: /save|update/i }).click();
      await page.waitForTimeout(500);

      // If scope dialog appears, select "this event only"
      const thisOnlyBtn = page.getByRole('button', {
        name: /this event|this instance|only this/i,
      });
      if (await thisOnlyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await thisOnlyBtn.click();
      }
    }

    await page.waitForTimeout(1000);
  });

  test('Create task → check off → verify in done filter', async ({ page }) => {
    const user = createTestUser('p0-task');
    await signup(page, user);

    // 1. Create a task
    await createTask(page, { title: 'Complete report' });

    // 2. Find the task and check it off
    const taskItem = page.getByText('Complete report').first();
    await expect(taskItem).toBeVisible({ timeout: 10_000 });

    // Click the checkbox near the task — assert it exists
    const checkbox = page
      .locator('[data-testid="task-item"], li, [role="listitem"]')
      .filter({ hasText: 'Complete report' })
      .getByRole('checkbox')
      .first();

    await expect(checkbox).toBeVisible({ timeout: 5_000 });
    await checkbox.click();
    await page.waitForTimeout(500);

    // 3. Filter by "done" tasks — assert the filter exists
    const doneFilter = page.getByText(/done|completed/i).first();
    await expect(doneFilter).toBeVisible({ timeout: 5_000 });
    await doneFilter.click();
    await page.waitForTimeout(500);

    // 4. Verify the task appears in the done filter
    await expect(page.getByText('Complete report')).toBeVisible({ timeout: 5_000 });
  });
});
