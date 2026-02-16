import type { Page } from '@playwright/test';

/**
 * Shared test helpers for Calley E2E tests.
 *
 * These utilities provide common operations used across multiple test files,
 * reducing duplication and keeping test code focused on behavior.
 */

// ─── Test Credentials ─────────────────────────────────────────────────

export const TEST_USER = {
  name: 'E2E Test User',
  email: `e2e-test-${Date.now()}@example.com`,
  password: 'E2eTestP@ss123!',
};

// ─── Auth Helpers ─────────────────────────────────────────────────────

/**
 * Sign up a new user via the UI form.
 */
export async function signup(page: Page, user = TEST_USER) {
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
export async function login(page: Page, user = TEST_USER) {
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

/**
 * Create an event using the quick create or event form.
 */
export async function createEvent(
  page: Page,
  options: {
    title: string;
    startTime?: string;
    endTime?: string;
    description?: string;
  },
) {
  // Try to click on a time slot or use the "new event" button
  const newEventBtn = page.getByRole('button', { name: /new event|create event|\+/i }).first();
  if (await newEventBtn.isVisible()) {
    await newEventBtn.click();
  }

  // Fill in the event form
  await page.getByLabel(/title/i).fill(options.title);

  if (options.description) {
    const descField = page.getByLabel(/description|notes/i);
    if (await descField.isVisible()) {
      await descField.fill(options.description);
    }
  }

  // Save the event
  await page.getByRole('button', { name: /save|create|add/i }).click();

  // Wait for the form to close (drawer/dialog/popover)
  await page.waitForTimeout(500);
}

/**
 * Create a task using the task panel.
 */
export async function createTask(
  page: Page,
  options: {
    title: string;
    description?: string;
  },
) {
  const newTaskBtn = page.getByRole('button', { name: /new task|add task|\+/i }).first();
  if (await newTaskBtn.isVisible()) {
    await newTaskBtn.click();
  }

  await page.getByLabel(/title/i).fill(options.title);

  if (options.description) {
    const descField = page.getByLabel(/description|notes/i);
    if (await descField.isVisible()) {
      await descField.fill(options.description);
    }
  }

  await page.getByRole('button', { name: /save|create|add/i }).click();
  await page.waitForTimeout(500);
}
