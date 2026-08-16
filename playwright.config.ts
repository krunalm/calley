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

/**
 * Optional escape hatch for sandboxes that ship a pre-installed Chromium and
 * cannot download Playwright's pinned build. Unset in CI, where
 * `playwright install` provides the matching browser.
 */
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOverride = chromiumExecutable ? { executablePath: chromiumExecutable } : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The suite is >200 tests; a single worker cannot finish inside the CI budget.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : [['html'], ['list']],
  globalTimeout: process.env.CI ? 1_800_000 : undefined, // 30 min max in CI
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    // New accounts default to a UTC profile timezone; pinning the browser to
    // UTC too keeps rendered date headers deterministic wherever the suite runs.
    timezoneId: 'UTC',
    locale: 'en-US',
  },

  // ─── Cross-Browser Testing (§9.5) ─────────────────────────────
  // In CI, only run chromium to keep pipeline fast.
  // Locally, run all browsers for thorough testing.
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(launchOverride ? { launchOptions: launchOverride } : {}),
      },
    },
    ...(!process.env.CI && !chromiumExecutable
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
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
        ]
      : []),
  ],

  // Start local dev servers before running tests
  webServer: [
    {
      command: 'pnpm --filter api dev',
      url: API_URL + '/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter web dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
