import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

/**
 * Shared test helpers for Calley E2E tests.
 *
 * These utilities provide common operations used across multiple test files,
 * reducing duplication and keeping test code focused on behavior.
 */

// ─── Test Credentials ─────────────────────────────────────────────────

/**
 * Creates a fresh test user with a unique email to avoid collisions
 * when tests run concurrently.
 */
export function createTestUser(prefix = 'e2e') {
  return {
    name: 'E2E Test User',
    email: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: 'E2eTestP@ss123!',
  };
}

export type TestUser = ReturnType<typeof createTestUser>;

// ─── Auth Helpers ─────────────────────────────────────────────────────

/**
 * Sign up a new user via the UI form.
 */
export async function signup(page: Page, user: TestUser = createTestUser()) {
  await page.goto('/signup');
  await page.getByLabel(/name/i).fill(user.name);
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/^password$/i).fill(user.password);
  await page.getByRole('button', { name: /sign up|create account/i }).click();
  // Wait for redirect to calendar after successful signup
  // Signup involves Argon2id hashing (~1s) + DB ops + route guard /auth/me check
  // Use generous timeout for CI where 14 tests share 1 worker and CPU is limited
  await page.waitForURL('**/calendar**', { timeout: 45_000 });
}

/**
 * Log in an existing user via the UI form.
 */
export async function login(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await page.waitForURL('**/calendar**', { timeout: 30_000 });
}

/**
 * Log out via the UI.
 * Opens the user menu dropdown and clicks "Sign out".
 */
export async function logout(page: Page) {
  // Open user menu — the UserMenu trigger has aria-label="User menu"
  await page.getByRole('button', { name: /user menu/i }).click();
  await page.getByRole('menuitem', { name: /sign ?out/i }).click();
  await page.waitForURL('**/login**', { timeout: 10_000 });
}

// ─── Navigation Helpers ─────────────────────────────────────────────

/**
 * Navigate to settings via the user menu dropdown.
 */
export async function goToSettings(page: Page) {
  const userMenuBtn = page.getByRole('button', { name: /user menu/i });
  await expect(userMenuBtn).toBeVisible({ timeout: 5_000 });
  await userMenuBtn.click();
  // Wait for the dropdown menu to open
  const settingsItem = page.getByRole('menuitem', { name: /^settings$/i });
  await expect(settingsItem).toBeVisible({ timeout: 3_000 });
  await settingsItem.click();
  await page.waitForURL('**/settings**', { timeout: 10_000 });
}

/**
 * Ensure the task panel is open (visible).
 * If not visible, presses 't' to toggle it open.
 */
export async function ensureTaskPanelOpen(page: Page) {
  const taskPanel = page.locator('[role="complementary"][aria-label="Task panel"]');
  if (!(await taskPanel.isVisible().catch(() => false))) {
    await page.keyboard.press('t');
    await expect(taskPanel).toBeVisible({ timeout: 5_000 });
  }
}

// ─── Event Helpers ──────────────────────────────────────────────────

/**
 * Create an event using the Create dropdown + EventDrawer form.
 * Opens the "Create new" dropdown, selects "New Event", fills in the form,
 * and saves.
 */
export async function createEvent(
  page: Page,
  options: {
    title: string;
    category?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
  },
) {
  // Open the "Create new" dropdown in the Topbar
  const createBtn = page.getByRole('button', { name: /create new/i });
  await expect(createBtn).toBeVisible({ timeout: 5_000 });
  await createBtn.click();

  // Select "New Event" from the dropdown menu
  await page.getByRole('menuitem', { name: /new event/i }).click();

  // Wait for the EventDrawer (Sheet with role="dialog") to appear
  const drawer = page.locator('[role="dialog"]').first();
  await expect(drawer).toBeVisible({ timeout: 5_000 });

  // Fill in the event form — the Title label has htmlFor="event-title"
  await page.getByLabel(/^title$/i).fill(options.title);

  if (options.category) {
    // Category is a Select component — click the trigger to open dropdown
    const categoryTrigger = drawer.locator('text=Select category').first();
    if (await categoryTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categoryTrigger.click();
      await page.getByText(options.category, { exact: true }).click();
    }
  }

  if (options.startTime) {
    const startField = page.getByLabel(/start time/i).first();
    if (await startField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startField.fill(options.startTime);
    }
  }

  if (options.endTime) {
    const endField = page.getByLabel(/end time/i).first();
    if (await endField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await endField.fill(options.endTime);
    }
  }

  if (options.description) {
    const descField = page.getByLabel(/description/i);
    if (await descField.isVisible()) {
      await descField.fill(options.description);
    }
  }

  // Save the event — button text is "Create" (new) or "Save" (edit)
  await page.getByRole('button', { name: /^create$|^save$/i }).click();

  // Wait for the dialog to close
  await drawer.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}

/**
 * Create a task using the task panel's "Create new task" button + TaskDrawer form.
 * Ensures the task panel is open first.
 */
export async function createTask(
  page: Page,
  options: {
    title: string;
    description?: string;
  },
) {
  // Ensure the task panel is visible
  await ensureTaskPanelOpen(page);

  // Click the "Create new task" button in the task panel header
  const newTaskBtn = page.getByRole('button', { name: /create new task/i });
  await expect(newTaskBtn).toBeVisible({ timeout: 5_000 });
  await newTaskBtn.click();

  // Wait for the TaskDrawer dialog to appear
  const drawer = page.locator('[role="dialog"]').first();
  await expect(drawer).toBeVisible({ timeout: 5_000 });

  // Fill in the task form — Title label has htmlFor="task-title"
  await page.getByLabel(/^title$/i).fill(options.title);

  if (options.description) {
    const descField = page.getByLabel(/description/i);
    if (await descField.isVisible()) {
      await descField.fill(options.description);
    }
  }

  // Save the task
  await page.getByRole('button', { name: /^create$|^save$/i }).click();

  // Wait for the dialog to close
  await drawer.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}

// ─── Keyboard Shortcut Helpers ──────────────────────────────────────

/**
 * Verify common navigation keyboard shortcuts (arrows, task panel toggle, escape).
 * Extracted to avoid duplication across keyboard-related tests.
 *
 * Uses condition-based waits instead of fixed timeouts for reliability.
 */
export async function verifyNavigationShortcuts(page: Page) {
  // Navigate right and wait for the date header text to change
  const dateHeader = page.locator('h2').first();
  await expect(dateHeader).toHaveText(/\S+/, { timeout: 5_000 });
  const oldHeaderText = (await dateHeader.textContent())!;
  await page.keyboard.press('ArrowRight');
  await expect(dateHeader).not.toContainText(oldHeaderText, { timeout: 5_000 });

  // Navigate left and wait for the date header text to change back
  const updatedHeaderText = (await dateHeader.textContent())!;
  await page.keyboard.press('ArrowLeft');
  await expect(dateHeader).not.toContainText(updatedHeaderText, { timeout: 5_000 });

  // 't' toggles the task panel
  const taskPanel = page.locator('[role="complementary"][aria-label="Task panel"]');
  const panelWasVisible = await taskPanel.isVisible().catch(() => false);

  // If panel is already open, close it first so we can verify the toggle
  if (panelWasVisible) {
    await page.keyboard.press('t');
    await taskPanel.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  // Now toggle it open
  await page.keyboard.press('t');
  await expect(taskPanel).toBeVisible({ timeout: 5_000 });

  // Escape should close any open dialog/panel
  await page.keyboard.press('Escape');
  await page
    .locator('[role="dialog"]')
    .first()
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .catch(() => {
      // OK — no dialog was open to close
    });
}
