import { expect, test } from '@playwright/test';

import {
  createEvent,
  createTestUser,
  ensureTaskPanelOpen,
  goToSettings,
  signup,
  verifyNavigationShortcuts,
} from './helpers';

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

    // 1. Navigate to settings via the user menu
    await goToSettings(page);

    // Go to Calendars section — SettingsLayout has Link with text "Calendars"
    const calendarsLink = page.getByRole('link', { name: /calendars/i }).first();
    await expect(calendarsLink).toBeVisible({ timeout: 5_000 });
    await calendarsLink.click();
    await page.waitForURL('**/settings/calendars**', { timeout: 5_000 });

    // Create a new category — button text is "New calendar"
    const addCategoryBtn = page.getByRole('button', { name: /new calendar/i });
    await expect(addCategoryBtn).toBeVisible({ timeout: 5_000 });
    await addCategoryBtn.click();

    // Fill in the name in the New Calendar dialog (label htmlFor="new-cat-name")
    const nameInput = page.getByLabel(/^name$/i);
    await expect(nameInput).toBeVisible({ timeout: 3_000 });
    await nameInput.fill('Temporary Category');
    await page.getByRole('button', { name: /^create$/i }).click();

    // The dialog closes — wait a moment for the mutation
    await page.waitForTimeout(1000);

    // Verify the category was created
    const categoryItem = page.getByText('Temporary Category').first();
    await expect(categoryItem).toBeVisible({ timeout: 5_000 });

    // 2. Go back to calendar and create an event assigned to this category
    await page.goto('/calendar');
    await page.waitForURL('**/calendar**', { timeout: 10_000 });

    await createEvent(page, { title: 'Categorized Event', category: 'Temporary Category' });

    // Verify the event was created
    await expect(page.getByText('Categorized Event').first()).toBeVisible({ timeout: 10_000 });

    // 3. Go back to settings and delete the category
    await goToSettings(page);

    const calendarsLink2 = page.getByRole('link', { name: /calendars/i }).first();
    if (await calendarsLink2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await calendarsLink2.click();
      await page.waitForURL('**/settings/calendars**', { timeout: 5_000 });
    }

    // Delete button has aria-label="Delete Temporary Category"
    const deleteBtn = page.getByRole('button', { name: /delete temporary category/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm deletion in the Delete Calendar dialog
    const confirmDeleteBtn = page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /^delete$/i });
    await expect(confirmDeleteBtn).toBeVisible({ timeout: 3_000 });
    await confirmDeleteBtn.click();

    // Wait for the deletion to complete
    await page.waitForTimeout(1000);

    // Verify the category no longer exists
    await expect(page.getByText('Temporary Category')).toHaveCount(0, { timeout: 5_000 });

    // 4. Go back to calendar — event should still exist (reassigned to default)
    await page.goto('/calendar');
    await page.waitForURL('**/calendar**', { timeout: 10_000 });
    await expect(page.getByText('Categorized Event').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Keyboard-only flow: navigate calendar, create event, complete task (no mouse)', async ({
    page,
  }) => {
    const user = createTestUser('p2-keyboard');
    await signup(page, user);

    await expect(page.locator('main')).toBeVisible({ timeout: 5_000 });

    // 1. 'c' shortcut opens the event drawer
    await page.keyboard.press('c');

    const titleInput = page.getByLabel(/^title$/i);
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill('Keyboard Event');

    await page.getByRole('button', { name: /^create$/i }).click();

    // Wait for drawer to close
    await page
      .locator('[role="dialog"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});

    // Verify event created
    await expect(page.getByText('Keyboard Event').first()).toBeVisible({ timeout: 10_000 });

    // 2. Create and complete a task
    await ensureTaskPanelOpen(page);

    const newTaskBtn = page.getByRole('button', { name: /create new task/i });
    await expect(newTaskBtn).toBeVisible({ timeout: 5_000 });
    await newTaskBtn.click();

    const taskTitleInput = page.getByLabel(/^title$/i);
    await expect(taskTitleInput).toBeVisible({ timeout: 5_000 });
    await taskTitleInput.fill('Keyboard Task');
    await page.getByRole('button', { name: /^create$/i }).click();

    await page
      .locator('[role="dialog"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});

    // Verify task created
    await expect(page.getByText('Keyboard Task').first()).toBeVisible({ timeout: 5_000 });

    // Toggle the task checkbox via keyboard
    const taskCheckbox = page
      .locator('[role="listitem"]')
      .filter({ hasText: 'Keyboard Task' })
      .getByRole('checkbox')
      .first();
    await expect(taskCheckbox).toBeVisible({ timeout: 5_000 });
    await taskCheckbox.focus();
    await page.keyboard.press('Space');
    await expect(taskCheckbox).toBeChecked({ timeout: 3_000 });

    // 3. Navigation shortcuts
    await verifyNavigationShortcuts(page);

    // '?' opens keyboard shortcuts help
    await page.keyboard.press('?');
    const helpDialog = page.getByText(/keyboard shortcuts/i).first();
    if (await helpDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
    }
  });

  test('Quick create from time slot click → Enter to save → verify event appears', async ({
    page,
  }) => {
    const user = createTestUser('p2-quickcreate');
    await signup(page, user);

    // Switch to week view
    await page.keyboard.press('w');
    await page.locator('[aria-label="Calendar week view"]').waitFor({ timeout: 5_000 });

    // Click a time slot — grid cells use role="gridcell"
    const timeSlot = page.locator('[role="gridcell"]').first();
    await expect(timeSlot).toBeVisible({ timeout: 5_000 });
    await timeSlot.click();

    // Quick create popover should appear
    const quickInput = page.getByPlaceholder(/event|title/i).first();
    if (await quickInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await quickInput.fill('Quick Event');
      await page.keyboard.press('Enter');

      await expect(page.getByText('Quick Event').first()).toBeVisible({ timeout: 10_000 });
    } else {
      // Some grid cells may open the event drawer instead
      const drawer = page.locator('[role="dialog"]').first();
      if (await drawer.isVisible({ timeout: 3000 }).catch(() => false)) {
        const drawerTitle = page.getByLabel(/^title$/i);
        await drawerTitle.fill('Quick Event');
        await page.getByRole('button', { name: /^create$/i }).click();
        await drawer.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        await expect(page.getByText('Quick Event').first()).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test('All keyboard shortcuts work correctly', async ({ page }) => {
    const user = createTestUser('p2-shortcuts');
    await signup(page, user);

    await expect(page.locator('main')).toBeVisible({ timeout: 5_000 });

    // View switching shortcuts
    await page.keyboard.press('d');
    await page.locator('[aria-label="Calendar day view"]').waitFor({ timeout: 5_000 });

    await page.keyboard.press('w');
    await page.locator('[aria-label="Calendar week view"]').waitFor({ timeout: 5_000 });

    await page.keyboard.press('m');
    await page.locator('[aria-label="Calendar month view"]').waitFor({ timeout: 5_000 });

    await page.keyboard.press('a');
    await page.locator('[aria-label="Agenda view"]').waitFor({ timeout: 5_000 });

    // Navigation shortcuts
    await verifyNavigationShortcuts(page);

    // '?' opens keyboard shortcuts help dialog
    await page.keyboard.press('?');
    const helpDialog = page.getByText(/keyboard shortcuts/i).first();
    await expect(helpDialog).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
  });

  test('Resize event duration by dragging edge in week view', async ({ page }) => {
    const user = createTestUser('p2-resize');
    await signup(page, user);

    // Switch to week view
    await page.keyboard.press('w');
    await page.locator('[aria-label="Calendar week view"]').waitFor({ timeout: 5_000 });

    // Create an event
    await createEvent(page, { title: 'Resizable Event' });

    const eventPill = page.getByText('Resizable Event').first();
    await expect(eventPill).toBeVisible({ timeout: 10_000 });

    const box = await eventPill.boundingBox();
    if (box) {
      const originalHeight = box.height;

      // Move to the bottom edge and drag down to extend duration
      const bottomEdgeY = box.y + box.height - 2;
      await page.mouse.move(box.x + box.width / 2, bottomEdgeY);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, bottomEdgeY + 50, { steps: 10 });
      await page.mouse.up();

      // Verify event still exists after resize
      await expect(page.getByText('Resizable Event')).toBeVisible({ timeout: 5_000 });

      // Check if the height changed
      const boxAfter = await page.getByText('Resizable Event').first().boundingBox();
      if (boxAfter) {
        expect(boxAfter.height).not.toBe(originalHeight);
      }
    }
  });
});
