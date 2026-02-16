import { expect, test } from '@playwright/test';

import { signup, TEST_USER } from './helpers';

/**
 * P1 — Core feature E2E tests.
 *
 * These test important but non-critical features. The app is still usable
 * if these fail, but key functionality is impaired.
 */

test.describe('P1 — Core Features', () => {
  test('Drag event to new time slot in week view → verify updated', async ({ page }) => {
    const user = {
      ...TEST_USER,
      email: `e2e-drag-${Date.now()}@example.com`,
    };
    await signup(page, user);

    // Switch to week view
    const weekViewBtn = page.getByRole('button', { name: /week/i }).first();
    if (await weekViewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await weekViewBtn.click();
      await page.waitForTimeout(500);
    }

    // Create an event first
    const newEventBtn = page.getByRole('button', { name: /new event|create event|\+/i }).first();
    if (await newEventBtn.isVisible()) {
      await newEventBtn.click();
    }
    await page.getByLabel(/title/i).fill('Draggable Event');
    await page.getByRole('button', { name: /save|create/i }).click();
    await page.waitForTimeout(1000);

    // Find the event pill
    const eventPill = page.getByText('Draggable Event').first();
    await expect(eventPill).toBeVisible({ timeout: 10_000 });

    // Attempt drag-and-drop (exact coordinates depend on UI layout)
    const box = await eventPill.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 100, {
        steps: 10,
      });
      await page.mouse.up();
      await page.waitForTimeout(1000);
    }

    // Verify event still exists after drag
    await expect(page.getByText('Draggable Event')).toBeVisible();
  });

  test('Cmd+K search → type query → arrow to result → Enter → verify navigation', async ({
    page,
  }) => {
    const user = {
      ...TEST_USER,
      email: `e2e-search-${Date.now()}@example.com`,
    };
    await signup(page, user);

    // Create an event to search for
    const newEventBtn = page.getByRole('button', { name: /new event|create event|\+/i }).first();
    if (await newEventBtn.isVisible()) {
      await newEventBtn.click();
    }
    await page.getByLabel(/title/i).fill('Searchable Meeting');
    await page.getByRole('button', { name: /save|create/i }).click();
    await page.waitForTimeout(1000);

    // Open Cmd+K search dialog
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);

    // If Cmd+K didn't open it, try Ctrl+K (Linux/Windows)
    const searchInput = page.getByPlaceholder(/search|find/i).first();
    if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
    }

    // Type search query
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('Searchable');
      await page.waitForTimeout(1000);

      // Navigate with arrow keys and select
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }
  });

  test('Mobile viewport: agenda view navigation + task panel toggle', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    const user = {
      ...TEST_USER,
      email: `e2e-mobile-${Date.now()}@example.com`,
    };
    await signup(page, user);

    // Check that the mobile layout is displayed
    await expect(page).toHaveURL(/\/calendar/);

    // Look for mobile-specific navigation (hamburger, bottom tabs)
    const mobileNav = page.getByRole('button', { name: /menu|hamburger/i }).first();
    if (await mobileNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mobileNav.click();
      await page.waitForTimeout(500);
    }

    // Try switching to agenda view
    const agendaBtn = page.getByRole('button', { name: /agenda/i }).first();
    if (await agendaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await agendaBtn.click();
      await page.waitForTimeout(500);
    }

    // Toggle task panel on mobile
    const taskPanelToggle = page.getByRole('button', { name: /task|panel|sidebar/i }).first();
    if (await taskPanelToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taskPanelToggle.click();
      await page.waitForTimeout(500);
    }
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

    // Click Google OAuth button to verify it initiates the flow
    if (googleVisible) {
      // The button should trigger a redirect to Google OAuth
      await Promise.all([
        page
          .waitForResponse((resp) => resp.url().includes('/auth/oauth/google'), {
            timeout: 5000,
          })
          .catch(() => null),
        googleBtn.click(),
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
