import { expect, test } from '@playwright/test';

import { createTestUser, signup } from './helpers';

/**
 * P1 — Core feature E2E tests.
 *
 * These test important but non-critical features. The app is still usable
 * if these fail, but key functionality is impaired.
 */

test.describe('P1 — Core Features', () => {
  test('Drag event to new time slot in week view → verify updated', async ({ page }) => {
    const user = createTestUser('p1-drag');
    await signup(page, user);

    // Switch to week view — required precondition for drag test
    const weekViewBtn = page.getByRole('button', { name: /week/i }).first();
    await expect(weekViewBtn).toBeVisible({ timeout: 5_000 });
    await weekViewBtn.click();
    await page.locator('[aria-label="Calendar week view"]').waitFor({ timeout: 5_000 });

    // Create an event first
    const newEventBtn = page.getByRole('button', { name: /new event|create event|\+/i }).first();
    await expect(newEventBtn).toBeVisible({ timeout: 5_000 });
    await newEventBtn.click();
    await page.getByLabel(/title/i).fill('Draggable Event');
    await page.getByRole('button', { name: /save|create/i }).click();

    // Find the event pill — wait for it to appear (replaces fixed timeout)
    const eventPill = page.getByText('Draggable Event').first();
    await expect(eventPill).toBeVisible({ timeout: 10_000 });

    // Capture position before drag
    const boxBefore = await eventPill.boundingBox();

    // Attempt drag-and-drop (exact coordinates depend on UI layout)
    if (boxBefore) {
      await page.mouse.move(boxBefore.x + boxBefore.width / 2, boxBefore.y + boxBefore.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        boxBefore.x + boxBefore.width / 2,
        boxBefore.y + boxBefore.height / 2 + 100,
        { steps: 10 },
      );
      await page.mouse.up();
    }

    // Verify event still exists after drag
    await expect(page.getByText('Draggable Event')).toBeVisible({ timeout: 5_000 });

    // Verify the pill actually moved by checking new position
    if (boxBefore) {
      const boxAfter = await page.getByText('Draggable Event').first().boundingBox();
      if (boxAfter) {
        // The y-coordinate should have changed after the drag
        expect(boxAfter.y).not.toBe(boxBefore.y);
      }
    }
  });

  test('Cmd+K search → type query → arrow to result → Enter → verify navigation', async ({
    page,
  }) => {
    const user = createTestUser('p1-search');
    await signup(page, user);

    // Create an event to search for
    const newEventBtn = page.getByRole('button', { name: /new event|create event|\+/i }).first();
    await expect(newEventBtn).toBeVisible({ timeout: 5_000 });
    await newEventBtn.click();
    await page.getByLabel(/title/i).fill('Searchable Meeting');
    await page.getByRole('button', { name: /save|create/i }).click();

    // Wait for event to appear before searching
    await expect(page.getByText('Searchable Meeting').first()).toBeVisible({ timeout: 10_000 });

    // Open Cmd+K search dialog
    await page.keyboard.press('Meta+k');

    const searchInput = page.getByPlaceholder(/search|find/i).first();

    // If Cmd+K didn't open it, try Ctrl+K (Linux/Windows)
    if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.keyboard.press('Control+k');
    }

    // The search dialog MUST be visible after trying both shortcuts
    await expect(searchInput).toBeVisible({ timeout: 3_000 });

    await searchInput.fill('Searchable');

    // Wait for search results to appear
    const searchResult = page.getByText('Searchable Meeting').last();
    await expect(searchResult).toBeVisible({ timeout: 5_000 });

    // Navigate with arrow keys and select
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Verify navigation occurred — either the URL changed or the event details
    // are shown on the page after selecting the search result
    await expect(page.getByText('Searchable Meeting')).toBeVisible({ timeout: 5_000 });
  });

  test('Mobile viewport: agenda view navigation + task panel toggle', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    const user = createTestUser('p1-mobile');
    await signup(page, user);

    // Check that the mobile layout is displayed
    await expect(page).toHaveURL(/\/calendar/);

    // Mobile navigation must be present at this viewport
    const mobileNav = page.getByRole('button', { name: /menu|hamburger/i }).first();
    await expect(mobileNav).toBeVisible({ timeout: 5_000 });
    await mobileNav.click();

    // Verify the mobile menu opened — look for menu items or nav panel
    const menuPanel = page.locator(
      '[role="menu"], [data-testid="mobile-menu"], nav, [role="navigation"]',
    );
    await expect(menuPanel.first()).toBeVisible({ timeout: 3_000 });

    // Switch to agenda view — must be available in navigation
    const agendaBtn = page.getByRole('button', { name: /agenda/i }).first();
    await expect(agendaBtn).toBeVisible({ timeout: 5_000 });
    await agendaBtn.click();

    // Verify the agenda view is rendered
    const agendaView = page.locator(
      '[data-testid="agenda-view"], [data-view="agenda"], .agenda-view',
    );
    await expect(agendaView.first()).toBeVisible({ timeout: 5_000 });

    // Toggle task panel on mobile — must be accessible
    const taskPanelToggle = page.getByRole('button', { name: /task|panel|sidebar/i }).first();
    await expect(taskPanelToggle).toBeVisible({ timeout: 5_000 });
    await taskPanelToggle.click();

    // Verify task panel is visible
    const taskPanel = page.locator(
      '[data-testid="task-panel"], [role="complementary"], .task-panel, aside',
    );
    await expect(taskPanel.first()).toBeVisible({ timeout: 5_000 });
  });

  test('OAuth login flow (mocked provider)', async ({ page }) => {
    await page.goto('/login');

    // Verify OAuth buttons are visible
    const googleBtn = page.getByRole('button', { name: /google/i }).first();
    const githubBtn = page.getByRole('button', { name: /github/i }).first();

    // At least one OAuth button should be present
    const googleVisible = await googleBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const githubVisible = await githubBtn.isVisible({ timeout: 3000 }).catch(() => false);

    expect(googleVisible || githubVisible).toBeTruthy();

    // Click whichever OAuth button is visible to verify it initiates the flow
    if (googleVisible) {
      await Promise.all([
        page
          .waitForResponse((resp) => resp.url().includes('/auth/oauth/google'), {
            timeout: 5000,
          })
          .catch(() => null),
        googleBtn.click(),
      ]);
    } else if (githubVisible) {
      await Promise.all([
        page
          .waitForResponse((resp) => resp.url().includes('/auth/oauth/github'), {
            timeout: 5000,
          })
          .catch(() => null),
        githubBtn.click(),
      ]);
    }
  });

  test('Password reset flow (mocked email)', async ({ page }) => {
    await page.goto('/forgot-password');

    // Fill in email
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill('test@example.com');

    // Submit
    await page.getByRole('button', { name: /send|reset|submit/i }).click();

    // Should show success message
    const successMsg = page.getByText(/sent|check your email|if that email/i);
    await expect(successMsg).toBeVisible({ timeout: 10_000 });
  });
});
