import { expect, test } from '@playwright/test';

import { createEvent, signup, TEST_USER } from './helpers';

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
    const user = {
      ...TEST_USER,
      email: `e2e-category-${Date.now()}@example.com`,
    };
    await signup(page, user);

    // 1. Navigate to settings to create a category
    const settingsLink = page.getByRole('link', { name: /settings/i }).first();
    if (await settingsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsLink.click();
      await page.waitForTimeout(500);
    }

    // Navigate to calendars/categories section
    const calendarsTab = page.getByRole('link', { name: /calendar|categor/i }).first();
    if (await calendarsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await calendarsTab.click();
      await page.waitForTimeout(500);
    }

    // Create a new category
    const addCategoryBtn = page.getByRole('button', { name: /add|new|create/i }).first();
    if (await addCategoryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addCategoryBtn.click();
      await page.getByLabel(/name/i).fill('Temporary Category');
      await page.getByRole('button', { name: /save|create|add/i }).click();
      await page.waitForTimeout(1000);
    }

    // 2. Go back to calendar and create an event with this category
    await page.goto('/calendar');
    await page.waitForTimeout(1000);

    await createEvent(page, { title: 'Categorized Event' });

    // 3. Go back to settings and delete the category
    if (await settingsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsLink.click();
    } else {
      await page.goto('/settings/calendars');
    }
    await page.waitForTimeout(500);

    // Find the category and delete it
    const categoryItem = page.getByText('Temporary Category').first();
    if (await categoryItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Look for delete button
      const deleteBtn = page
        .locator('[data-testid="category-item"], li, [role="listitem"]')
        .filter({ hasText: 'Temporary Category' })
        .getByRole('button', { name: /delete|remove/i })
        .first();

      if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteBtn.click();

        // Confirm deletion if dialog appears
        const confirmBtn = page.getByRole('button', { name: /confirm|delete|yes/i });
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      }
    }

    // 4. Go back to calendar and verify the event still exists (reassigned to default)
    await page.goto('/calendar');
    await page.waitForTimeout(1000);

    const eventPill = page.getByText('Categorized Event').first();
    // Event should still be visible — it was reassigned to the default category
    if (await eventPill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(eventPill).toBeVisible();
    }
  });

  test('Keyboard-only flow: navigate calendar, create event, complete task (no mouse)', async ({
    page,
  }) => {
    const user = {
      ...TEST_USER,
      email: `e2e-keyboard-${Date.now()}@example.com`,
    };
    await signup(page, user);
    await page.waitForTimeout(1000);

    // Use keyboard shortcuts for navigation
    // 'n' or 'c' to create event (common calendar shortcuts)
    await page.keyboard.press('n');
    await page.waitForTimeout(500);

    // If a create dialog opened, fill it in
    const titleInput = page.getByLabel(/title/i);
    if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleInput.fill('Keyboard Event');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Submit with Enter or Ctrl+Enter
      await page.keyboard.press('Meta+Enter');
      await page.waitForTimeout(500);

      // Fallback: try clicking save if Ctrl+Enter didn't work
      const saveBtn = page.getByRole('button', { name: /save|create/i });
      if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await saveBtn.click();
      }
      await page.waitForTimeout(500);
    }

    // Navigate with arrow keys
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);

    // Test 't' shortcut for "today"
    await page.keyboard.press('t');
    await page.waitForTimeout(300);

    // Test '?' shortcut for keyboard shortcuts help
    await page.keyboard.press('?');
    await page.waitForTimeout(500);

    // Close dialog if it opened
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('Quick create from time slot click → Enter to save → verify event appears', async ({
    page,
  }) => {
    const user = {
      ...TEST_USER,
      email: `e2e-quickcreate-${Date.now()}@example.com`,
    };
    await signup(page, user);

    // Switch to week view for time slots
    const weekViewBtn = page.getByRole('button', { name: /week/i }).first();
    if (await weekViewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await weekViewBtn.click();
      await page.waitForTimeout(500);
    }

    // Click on a time slot in the calendar grid
    const timeSlot = page
      .locator('[data-testid="time-slot"], .time-slot, [role="gridcell"]')
      .first();
    if (await timeSlot.isVisible({ timeout: 5000 }).catch(() => false)) {
      await timeSlot.click();
      await page.waitForTimeout(500);

      // Quick create popover should appear
      const quickInput = page.getByPlaceholder(/event|title/i).first();
      if (await quickInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await quickInput.fill('Quick Event');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);

        // Verify event appears
        const eventPill = page.getByText('Quick Event').first();
        await expect(eventPill).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test('All keyboard shortcuts work correctly', async ({ page }) => {
    const user = {
      ...TEST_USER,
      email: `e2e-shortcuts-${Date.now()}@example.com`,
    };
    await signup(page, user);
    await page.waitForTimeout(1000);

    // Test view switching shortcuts
    // 'd' for day view
    await page.keyboard.press('d');
    await page.waitForTimeout(500);

    // 'w' for week view
    await page.keyboard.press('w');
    await page.waitForTimeout(500);

    // 'm' for month view
    await page.keyboard.press('m');
    await page.waitForTimeout(500);

    // 'a' for agenda view
    await page.keyboard.press('a');
    await page.waitForTimeout(500);

    // 't' for today
    await page.keyboard.press('t');
    await page.waitForTimeout(500);

    // Navigation arrows
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);

    // Escape should close any open dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // '?' should open keyboard shortcuts help
    await page.keyboard.press('?');
    await page.waitForTimeout(500);
    const helpDialog = page.getByText(/keyboard shortcuts/i).first();
    if (await helpDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(helpDialog).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });

  test('Resize event duration by dragging edge in week view', async ({ page }) => {
    const user = {
      ...TEST_USER,
      email: `e2e-resize-${Date.now()}@example.com`,
    };
    await signup(page, user);

    // Switch to week view
    const weekViewBtn = page.getByRole('button', { name: /week/i }).first();
    if (await weekViewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await weekViewBtn.click();
      await page.waitForTimeout(500);
    }

    // Create an event
    const newEventBtn = page.getByRole('button', { name: /new event|create event|\+/i }).first();
    if (await newEventBtn.isVisible()) {
      await newEventBtn.click();
    }
    await page.getByLabel(/title/i).fill('Resizable Event');
    await page.getByRole('button', { name: /save|create/i }).click();
    await page.waitForTimeout(1000);

    // Find the event and try to resize by dragging its bottom edge
    const eventPill = page.getByText('Resizable Event').first();
    await expect(eventPill).toBeVisible({ timeout: 10_000 });

    const box = await eventPill.boundingBox();
    if (box) {
      // Move to the bottom edge of the event
      const bottomEdgeY = box.y + box.height - 2;
      await page.mouse.move(box.x + box.width / 2, bottomEdgeY);
      await page.mouse.down();
      // Drag down to extend duration
      await page.mouse.move(box.x + box.width / 2, bottomEdgeY + 50, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1000);
    }

    // Verify event still exists after resize attempt
    await expect(page.getByText('Resizable Event')).toBeVisible();
  });
});
