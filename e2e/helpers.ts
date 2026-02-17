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
  await page.waitForURL('**/calendar**', { timeout: 15_000 });
}

/**
 * Log in an existing user via the UI form.
 */
export async function login(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await page.waitForURL('**/calendar**', { timeout: 15_000 });
}

/**
 * Log out via the UI.
 */
export async function logout(page: Page) {
  // Open user menu and click logout
  await page.getByRole('button', { name: /user|profile|account|avatar/i }).click();
  await page.getByRole('menuitem', { name: /log ?out|sign ?out/i }).click();
  await page.waitForURL('**/login**', { timeout: 10_000 });
}

// ─── Event Helpers ──────────────────────────────────────────────────

/** Selectors for event/task form drawer/dialog. */
const FORM_DIALOG_SELECTOR =
  '[role="dialog"], [data-testid="event-drawer"], [data-testid="event-form"]';

/**
 * Create an event using the quick create or event form.
 * Fails fast if the new-event button is not visible.
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
  // Click "new event" button — fail fast if not visible
  const newEventBtn = page.getByRole('button', { name: /new event|create event|\+/i }).first();
  await expect(newEventBtn).toBeVisible({ timeout: 5_000 });
  await newEventBtn.click();

  // Fill in the event form
  await page.getByLabel(/title/i).fill(options.title);

  if (options.category) {
    const categorySelect = page.getByLabel(/category|calendar/i);
    if (await categorySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await categorySelect.click();
      await page.getByText(options.category, { exact: true }).click();
    }
  }

  if (options.startTime) {
    const startField = page.getByLabel(/start time|from/i).first();
    if (await startField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startField.fill(options.startTime);
    }
  }

  if (options.endTime) {
    const endField = page.getByLabel(/end time|to|until/i).first();
    if (await endField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await endField.fill(options.endTime);
    }
  }

  if (options.description) {
    const descField = page.getByLabel(/description|notes/i);
    if (await descField.isVisible()) {
      await descField.fill(options.description);
    }
  }

  // Save the event
  await page.getByRole('button', { name: /save|create|add/i }).click();

  // Wait for the form dialog to close rather than a fixed timeout
  await page
    .locator(FORM_DIALOG_SELECTOR)
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .catch(() => {
      // Fallback: dialog may not exist in all flows (e.g. quick create popover)
    });
}

/**
 * Create a task using the task panel.
 * Fails fast if the new-task button is not visible.
 */
export async function createTask(
  page: Page,
  options: {
    title: string;
    description?: string;
  },
) {
  const newTaskBtn = page.getByRole('button', { name: /new task|add task|\+/i }).first();
  await expect(newTaskBtn).toBeVisible({ timeout: 5_000 });
  await newTaskBtn.click();

  await page.getByLabel(/title/i).fill(options.title);

  if (options.description) {
    const descField = page.getByLabel(/description|notes/i);
    if (await descField.isVisible()) {
      await descField.fill(options.description);
    }
  }

  await page.getByRole('button', { name: /save|create|add/i }).click();

  // Wait for the form dialog to close rather than a fixed timeout
  await page
    .locator(FORM_DIALOG_SELECTOR)
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .catch(() => {});
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

  // 't' toggles the task panel — wait for the toggle button's data-active attribute
  await page.keyboard.press('t');
  const taskToggle = page.getByRole('button', { name: /toggle task panel/i });
  if (await taskToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expect(taskToggle).toHaveAttribute('data-active', { timeout: 5_000 });
  }

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
