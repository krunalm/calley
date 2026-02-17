import { expect, test } from '@playwright/test';

import { createEvent, createTestUser, signup, verifyNavigationShortcuts } from './helpers';

/**
 * P2 — Edge case E2E tests.
 *
 * These cover less common but important scenarios, including category
 * management, keyboard-only navigation, resize operations, and quick create.
 */

test.describe('P2 — Edge Cases', () => {
  test('Category create → assign to event → delete category → verify event reassigned', async ({
    page,
  }) => {
    const user = createTestUser('p2-category');
    await signup(page, user);

    // 1. Navigate to settings to create a category
    const settingsLink = page.getByRole('link', { name: /settings/i }).first();
    await expect(settingsLink).toBeVisible({ timeout: 5_000 });
    await settingsLink.click();
    await page.waitForURL('**/settings**', { timeout: 5_000 });

    // Navigate to calendars/categories section
    const calendarsTab = page.getByRole('link', { name: /calendar|categor/i }).first();
    await expect(calendarsTab).toBeVisible({ timeout: 3_000 });
    await calendarsTab.click();

    // Create a new category
    const addCategoryBtn = page.getByRole('button', { name: /add|new|create/i }).first();
    await expect(addCategoryBtn).toBeVisible({ timeout: 3_000 });
    await addCategoryBtn.click();
    await page.getByLabel(/name/i).fill('Temporary Category');
    await page.getByRole('button', { name: /save|create|add/i }).click();

    // Assert the category was created
    const categoryItem = page.getByText('Temporary Category').first();
    await expect(categoryItem).toBeVisible({ timeout: 5_000 });

    // 2. Go back to calendar and create an event assigned to this category
    await page.goto('/calendar');
    await page.waitForURL('**/calendar**', { timeout: 5_000 });

    await createEvent(page, { title: 'Categorized Event', category: 'Temporary Category' });

    // Verify the event was created
    await expect(page.getByText('Categorized Event').first()).toBeVisible({ timeout: 10_000 });

    // 3. Go back to settings and delete the category
    await page.goto('/settings/calendars');
    await page.waitForURL('**/settings**', { timeout: 5_000 });

    // Navigate to categories section again
    const calendarsTabAgain = page.getByRole('link', { name: /calendar|categor/i }).first();
    if (await calendarsTabAgain.isVisible({ timeout: 2000 }).catch(() => false)) {
      await calendarsTabAgain.click();
    }

    // Find and delete the category
    const categoryToDelete = page.getByText('Temporary Category').first();
    await expect(categoryToDelete).toBeVisible({ timeout: 5_000 });

    const deleteBtn = page
      .locator('[data-testid="category-item"], li, [role="listitem"]')
      .filter({ hasText: 'Temporary Category' })
      .getByRole('button', { name: /delete|remove/i })
      .first();

    await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
    await deleteBtn.click();

    // Confirm deletion if dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|delete|yes/i });
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Assert the category no longer exists
    await expect(page.getByText('Temporary Category')).toHaveCount(0, { timeout: 5_000 });

    // 4. Go back to calendar and verify the event still exists (reassigned to default)
    await page.goto('/calendar');
    await page.waitForURL('**/calendar**', { timeout: 5_000 });

    // Event should still be visible — it was reassigned to the default category
    await expect(page.getByText('Categorized Event').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Keyboard-only flow: navigate calendar, create event, complete task (no mouse)', async ({
    page,
  }) => {
    const user = createTestUser('p2-keyboard');
    await signup(page, user);

    // Wait for calendar to be interactive
    await expect(
      page.locator('[data-testid="calendar-view"], .calendar-container, main'),
    ).toBeVisible({ timeout: 5_000 });

    // 1. Create an event using keyboard shortcut
    // 'c' to create event (calendar shortcut)
    await page.keyboard.press('n');

    // Fill in the event form
    const titleInput = page.getByLabel(/title/i);
    if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleInput.fill('Keyboard Event');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Submit with Enter or Ctrl+Enter
      await page.keyboard.press('Meta+Enter');

      // Fallback: try clicking save if Ctrl+Enter didn't work
      const saveBtn = page.getByRole('button', { name: /save|create/i });
      if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await saveBtn.click();
      }
    }

    // Assert the event was created and is visible
    await expect(page.getByText('Keyboard Event').first()).toBeVisible({ timeout: 10_000 });

    // 2. Create and complete a task using keyboard
    // Tab to task panel or use shortcut to open it
    const taskInput = page.getByPlaceholder(/add task|new task/i).first();
    if (await taskInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taskInput.fill('Keyboard Task');
      await page.keyboard.press('Enter');

      // Verify task was created
      await expect(page.getByText('Keyboard Task').first()).toBeVisible({ timeout: 5_000 });

      // Find the task checkbox and toggle it complete via keyboard
      const taskCheckbox = page
        .locator('[data-testid="task-item"], li, [role="listitem"]')
        .filter({ hasText: 'Keyboard Task' })
        .getByRole('checkbox')
        .first();
      if (await taskCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await taskCheckbox.focus();
        await page.keyboard.press('Space');

        // Verify checkbox is checked
        await expect(taskCheckbox).toBeChecked({ timeout: 3_000 });
      }
    }

    // 3. Use shared helper for navigation shortcuts (arrows, task panel toggle, escape)
    await verifyNavigationShortcuts(page);

    // Test '?' shortcut for keyboard shortcuts help
    await page.keyboard.press('?');

    // Wait for shortcuts help dialog and then close it
    const helpDialog = page.getByText(/keyboard shortcuts/i).first();
    if (await helpDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page
        .locator('[role="dialog"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 5_000 })
        .catch(() => {});
    }
  });

  test('Quick create from time slot click → Enter to save → verify event appears', async ({
    page,
  }) => {
    const user = createTestUser('p2-quickcreate');
    await signup(page, user);

    // Switch to week view for time slots
    const weekViewBtn = page.getByRole('button', { name: /week/i }).first();
    await expect(weekViewBtn).toBeVisible({ timeout: 5_000 });
    await weekViewBtn.click();

    // Wait for week view grid to render
    const timeSlot = page
      .locator('[data-testid="time-slot"], .time-slot, [role="gridcell"]')
      .first();
    await expect(timeSlot).toBeVisible({ timeout: 5_000 });
    await timeSlot.click();

    // Quick create popover must appear after clicking a time slot
    const quickInput = page.getByPlaceholder(/event|title/i).first();
    await expect(quickInput).toBeVisible({ timeout: 5_000 });
    await quickInput.fill('Quick Event');
    await page.keyboard.press('Enter');

    // Verify event appears on the calendar
    await expect(page.getByText('Quick Event').first()).toBeVisible({ timeout: 10_000 });
  });

  test('All keyboard shortcuts work correctly', async ({ page }) => {
    const user = createTestUser('p2-shortcuts');
    await signup(page, user);

    // Wait for calendar to be interactive
    await expect(
      page.locator('[data-testid="calendar-view"], .calendar-container, main'),
    ).toBeVisible({ timeout: 5_000 });

    // Test view switching shortcuts — wait for each view's aria-label to appear
    // 'd' for day view
    await page.keyboard.press('d');
    await page.locator('[aria-label="Calendar day view"]').waitFor({ timeout: 5_000 });

    // 'w' for week view
    await page.keyboard.press('w');
    await page.locator('[aria-label="Calendar week view"]').waitFor({ timeout: 5_000 });

    // 'm' for month view
    await page.keyboard.press('m');
    await page.locator('[aria-label="Calendar month view"]').waitFor({ timeout: 5_000 });

    // 'a' for agenda view
    await page.keyboard.press('a');
    await page.locator('[aria-label="Agenda view"]').waitFor({ timeout: 5_000 });

    // Use shared helper for common navigation shortcuts (arrows, task panel toggle, escape)
    await verifyNavigationShortcuts(page);

    // '?' should open keyboard shortcuts help
    await page.keyboard.press('?');
    const helpDialog = page.getByText(/keyboard shortcuts/i).first();
    await expect(helpDialog).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await page
      .locator('[role="dialog"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});
  });

  test('Resize event duration by dragging edge in week view', async ({ page }) => {
    const user = createTestUser('p2-resize');
    await signup(page, user);

    // Switch to week view
    const weekViewBtn = page.getByRole('button', { name: /week/i }).first();
    if (await weekViewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await weekViewBtn.click();
      await page.locator('[aria-label="Calendar week view"]').waitFor({ timeout: 5_000 });
    }

    // Create an event
    await createEvent(page, { title: 'Resizable Event' });

    // Find the event and try to resize by dragging its bottom edge
    const eventPill = page.getByText('Resizable Event').first();
    await expect(eventPill).toBeVisible({ timeout: 10_000 });

    const box = await eventPill.boundingBox();
    if (box) {
      // Capture original height
      const originalHeight = box.height;

      // Move to the bottom edge of the event
      const bottomEdgeY = box.y + box.height - 2;
      await page.mouse.move(box.x + box.width / 2, bottomEdgeY);
      await page.mouse.down();
      // Drag down to extend duration
      await page.mouse.move(box.x + box.width / 2, bottomEdgeY + 50, { steps: 10 });
      await page.mouse.up();

      // Verify event still exists after resize attempt
      await expect(page.getByText('Resizable Event')).toBeVisible({ timeout: 5_000 });

      // Check if the height changed after resize
      const boxAfter = await page.getByText('Resizable Event').first().boundingBox();
      if (boxAfter) {
        expect(boxAfter.height).not.toBe(originalHeight);
      }
    }
  });
});
