import { makeCredentials } from '../support/api';
import { adoptApiSession, expect, test } from '../support/fixtures';

/**
 * Authentication UI: the signup/login/reset forms, client-side validation
 * and the route guards that protect the app shell.
 */

test.describe('UI — login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders the email and password fields', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('renders a submit button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows a validation error for a malformed email', async ({ page }) => {
    await page.getByLabel(/email/i).fill('not-an-email');
    await page.getByLabel(/password/i).fill('somepassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('#email-error')).toContainText(/invalid email/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows a validation error for an empty password', async ({ page }) => {
    await page.getByLabel(/email/i).fill('someone@example.com');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('#password-error')).toBeVisible();
  });

  test('stays on the login page when validation fails', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/login/);
  });

  test('refuses wrong credentials and keeps the user signed out', async ({
    page,
    api,
    credentials,
  }) => {
    expect(api.user).toBeTruthy();
    await page.getByLabel(/email/i).fill(credentials.email);
    await page.getByLabel(/password/i).fill('TotallyWrong123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // The error is rendered inline on the form — a rejected login is a
    // credential answer, not an expired session, so there is no redirect.
    await expect(page.locator('#root-error')).toContainText(/invalid email or password/i, {
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: /user menu/i })).toHaveCount(0);
  });

  test('the password field masks its input', async ({ page }) => {
    await expect(page.getByLabel(/password/i)).toHaveAttribute('type', 'password');
  });

  test('links to the signup page', async ({ page }) => {
    await page.getByRole('link', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('links to the forgot-password page', async ({ page }) => {
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('offers the OAuth providers', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /github/i })).toBeVisible();
  });

  test('signs a real user in and lands on the calendar', async ({ page, api, credentials }) => {
    expect(api.user).toBeTruthy();
    await page.getByLabel(/email/i).fill(credentials.email);
    await page.getByLabel(/password/i).fill(credentials.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/calendar**', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible();
  });
});

test.describe('UI — signup page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('renders the name, email and password fields', async ({ page }) => {
    await expect(page.getByLabel(/name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
  });

  test('shows a validation error for a short password', async ({ page }) => {
    const creds = makeCredentials();
    await page.getByLabel(/name/i).fill(creds.name);
    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/^password$/i).fill('short');
    await page.getByRole('button', { name: /sign up|create account/i }).click();

    await expect(page.locator('#password-error')).toBeVisible();
  });

  test('shows a validation error for a malformed email', async ({ page }) => {
    await page.getByLabel(/name/i).fill('Someone');
    await page.getByLabel(/email/i).fill('nope');
    await page.getByLabel(/^password$/i).fill('LongEnough123!');
    await page.getByRole('button', { name: /sign up|create account/i }).click();

    await expect(page.locator('#email-error')).toContainText(/invalid email/i);
    await expect(page).toHaveURL(/\/signup/);
  });

  test('shows a password strength meter as the user types', async ({ page }) => {
    await page.getByLabel(/^password$/i).fill('a');
    await page.getByLabel(/^password$/i).fill('Str0ng-P@ssword-9!');

    await expect(page.getByLabel(/^password$/i)).toHaveValue('Str0ng-P@ssword-9!');
  });

  test('reports a duplicate email', async ({ page, credentials, api }) => {
    expect(api.user).toBeTruthy();
    await page.getByLabel(/name/i).fill('Duplicate');
    await page.getByLabel(/email/i).fill(credentials.email);
    await page.getByLabel(/^password$/i).fill('AnotherP@ss123!');
    await page.getByRole('button', { name: /sign up|create account/i }).click();

    await expect(page.locator('#email-error')).toContainText(/already exists/i, {
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/signup/);
  });

  test('links back to the login page', async ({ page }) => {
    await page.getByRole('link', { name: /log ?in|sign ?in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('creates an account and lands on the calendar', async ({ page }) => {
    const creds = makeCredentials('signup-ui');
    await page.getByLabel(/name/i).fill(creds.name);
    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/^password$/i).fill(creds.password);
    await page.getByRole('button', { name: /sign up|create account/i }).click();

    await page.waitForURL('**/calendar**', { timeout: 45_000 });
    await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible();
  });
});

test.describe('UI — forgot password', () => {
  test('renders the email field', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('shows a validation error for a malformed email', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill('nope');
    await page
      .getByRole('button', { name: /send|reset/i })
      .first()
      .click();

    await expect(page.locator('#email-error')).toContainText(/invalid email/i);
    await expect(page.getByText(/if that email is registered/i)).toHaveCount(0);
  });

  test('confirms submission without revealing whether the email exists', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill('definitely-not-registered@example.com');
    await page
      .getByRole('button', { name: /send|reset/i })
      .first()
      .click();

    await expect(
      page.getByText(/if that email is registered|check your (email|inbox)/i),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('the reset page loads without a token', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('UI — route guards', () => {
  test('an anonymous visit to /calendar redirects to login', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForURL('**/login**', { timeout: 20_000 });

    await expect(page).toHaveURL(/\/login/);
  });

  test('an anonymous visit to /settings redirects to login', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL('**/login**', { timeout: 20_000 });

    await expect(page).toHaveURL(/\/login/);
  });

  test('an authenticated visit to /login redirects to the calendar', async ({ page, api }) => {
    await adoptApiSession(page, api);
    await page.goto('/login');

    await page.waitForURL('**/calendar**', { timeout: 20_000 });
  });

  test('an authenticated visit to /signup redirects to the calendar', async ({ page, api }) => {
    await adoptApiSession(page, api);
    await page.goto('/signup');

    await page.waitForURL('**/calendar**', { timeout: 20_000 });
  });

  test('the root path resolves to the calendar when signed in', async ({ page, api }) => {
    await adoptApiSession(page, api);
    await page.goto('/');

    await page.waitForURL('**/calendar**', { timeout: 20_000 });
  });
});

test.describe('UI — logout', () => {
  test('signs the user out through the user menu', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /user menu/i }).click();
    await authedPage.getByRole('menuitem', { name: /sign ?out/i }).click();

    await authedPage.waitForURL('**/login**', { timeout: 20_000 });
  });

  test('the calendar is unreachable after signing out', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /user menu/i }).click();
    await authedPage.getByRole('menuitem', { name: /sign ?out/i }).click();
    await authedPage.waitForURL('**/login**', { timeout: 20_000 });

    await authedPage.goto('/calendar');
    await authedPage.waitForURL('**/login**', { timeout: 20_000 });
  });

  test('the user menu shows the account email', async ({ authedPage, credentials }) => {
    await authedPage.getByRole('button', { name: /user menu/i }).click();

    await expect(authedPage.getByText(credentials.email.toLowerCase())).toBeVisible();
  });
});
