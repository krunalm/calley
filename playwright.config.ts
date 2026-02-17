import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for Calley.
 *
 * Covers sections 9.4 (E2E Tests) and 9.5 (Cross-Browser Testing) from TASKS.md.
 *
 * Usage:
 *   pnpm test:e2e              — run all E2E tests (default: chromium)
 *   pnpm test:e2e --project=chromium
 *   pnpm test:e2e --project=firefox
 *   pnpm test:e2e --project=webkit
 *   pnpm test:e2e --project="Mobile Chrome"
 *   pnpm test:e2e --project="Mobile Safari"
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : [['html'], ['list']],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  // ─── Cross-Browser Testing (§9.5) ─────────────────────────────
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },

    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Start local dev servers before running tests
  webServer: [
    {
      command: 'pnpm --filter api dev',
      url: API_URL + '/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter web dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
