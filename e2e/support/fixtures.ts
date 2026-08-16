import { expect, test as base } from '@playwright/test';

import { type ApiCategory, makeCredentials, newApiSession, type TestCredentials } from './api';

import type { ApiSession } from './api';
import type { Page } from '@playwright/test';

/**
 * Shared Playwright fixtures.
 *
 * Every test that needs an account gets its own freshly created user, which
 * keeps the suite fully parallel-safe: no test can observe another test's
 * events, tasks or categories.
 *
 * UI tests are seeded through the API and then handed a browser context that
 * already carries the session + CSRF cookies, so a signup form submission
 * (Argon2id, ~1s) is not repeated for every spec.
 */

interface CalleyFixtures {
  /** Unauthenticated API session — for signup/login/negative-path specs. */
  anonApi: ApiSession;
  /** API session for a brand-new signed-up user. */
  api: ApiSession;
  /** The credentials backing `api`. */
  credentials: TestCredentials;
  /** The user's auto-created default ("Personal") category. */
  category: ApiCategory;
  /** A second, independent user — for ownership/IDOR specs. */
  otherApi: ApiSession;
  /** A page already authenticated as `api`'s user and sitting on /calendar. */
  authedPage: Page;
}

// Playwright detects a fixture's dependencies from its destructuring pattern,
// so dependency-free fixtures must still declare an empty one.
/* eslint-disable no-empty-pattern */
export const test = base.extend<CalleyFixtures>({
  anonApi: async ({}, use) => {
    const session = await newApiSession();
    await use(session);
    await session.dispose();
  },

  credentials: async ({}, use) => {
    await use(makeCredentials());
  },

  api: async ({ credentials }, use) => {
    const session = await newApiSession();
    await session.signup(credentials);
    await use(session);
    await session.dispose();
  },

  category: async ({ api }, use) => {
    await use(await api.defaultCategory());
  },

  otherApi: async ({}, use) => {
    const session = await newApiSession();
    await session.signup(makeCredentials('other'));
    await use(session);
    await session.dispose();
  },

  authedPage: async ({ page, api }, use) => {
    await adoptApiSession(page, api);
    await page.goto('/calendar');
    await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible({
      timeout: 30_000,
    });
    await use(page);
  },
});
/* eslint-enable no-empty-pattern */

export { expect };

/**
 * Copy an API session's cookies into a browser context so the page is
 * authenticated without going through the signup form.
 */
export async function adoptApiSession(page: Page, api: ApiSession): Promise<void> {
  const cookies = await api.cookies();
  await page.context().addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    })),
  );
}
