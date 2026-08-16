import { expect, test } from '../support/fixtures';

import type { Page } from '@playwright/test';

/**
 * Settings: profile preferences, password change, calendar management,
 * notification defaults, session management and account deletion.
 */

/** The sidebar is present on settings routes too, so scope to the content area. */
function content(page: Page) {
  return page.locator('#main-content');
}

async function gotoSettings(page: Page, section = 'profile') {
  await page.goto(`/settings/${section}`);
  await expect(page.getByRole('navigation', { name: /settings navigation/i })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('UI — settings navigation', () => {
  test('is reachable from the user menu', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /user menu/i }).click();
    await authedPage.getByRole('menuitem', { name: /^settings$/i }).click();

    await authedPage.waitForURL('**/settings**', { timeout: 20_000 });
  });

  test('lists all four sections', async ({ authedPage }) => {
    await gotoSettings(authedPage);
    const nav = authedPage.getByRole('navigation', { name: /settings navigation/i });

    await expect(nav.getByRole('link', { name: 'Profile' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Calendars' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Notifications' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Sessions' })).toBeVisible();
  });

  test('marks the active section', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'calendars');

    await expect(
      authedPage.getByRole('navigation').getByRole('link', { name: 'Calendars' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('navigates between sections', async ({ authedPage }) => {
    await gotoSettings(authedPage);
    await authedPage.getByRole('navigation').getByRole('link', { name: 'Sessions' }).click();

    await expect(authedPage).toHaveURL(/\/settings\/sessions/);
  });

  test('renders the Settings heading', async ({ authedPage }) => {
    await gotoSettings(authedPage);

    await expect(authedPage.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
});

test.describe('UI — profile settings', () => {
  test('prefills the account name and email', async ({ authedPage, credentials }) => {
    await gotoSettings(authedPage);

    await expect(authedPage.getByLabel('Name')).toHaveValue(credentials.name);
    await expect(authedPage.getByLabel('Email')).toHaveValue(credentials.email.toLowerCase());
  });

  test('the email field is read-only', async ({ authedPage }) => {
    await gotoSettings(authedPage);

    await expect(authedPage.getByLabel('Email')).toBeDisabled();
  });

  test('explains why the email cannot be changed', async ({ authedPage }) => {
    await gotoSettings(authedPage);

    await expect(authedPage.getByText(/sign-in identity/i)).toBeVisible();
  });

  test('saves a new display name', async ({ authedPage, api }) => {
    await gotoSettings(authedPage);
    await authedPage.getByLabel('Name').fill('Updated Name');
    await authedPage.getByRole('button', { name: /save changes/i }).click();

    await expect(async () => {
      expect((await api.me()).name).toBe('Updated Name');
    }).toPass({ timeout: 20_000 });
  });

  test('the save button only appears once the form is dirty', async ({ authedPage }) => {
    await gotoSettings(authedPage);
    await expect(authedPage.getByRole('button', { name: /save changes/i })).toHaveCount(0);

    await authedPage.getByLabel('Name').fill('Dirty Name');
    await expect(authedPage.getByRole('button', { name: /save changes/i })).toBeVisible();
  });

  test('changes the week start day', async ({ authedPage, api }) => {
    await gotoSettings(authedPage);
    await authedPage.locator('#weekStart').click();
    await authedPage.getByRole('option', { name: 'Monday' }).click();

    await expect(async () => {
      expect((await api.me()).weekStart).toBe(1);
    }).toPass({ timeout: 20_000 });
  });

  test('changes the time format', async ({ authedPage, api }) => {
    await gotoSettings(authedPage);
    await authedPage.locator('#timeFormat').click();
    await authedPage.getByRole('option', { name: /24-hour/i }).click();

    await expect(async () => {
      expect((await api.me()).timeFormat).toBe('24h');
    }).toPass({ timeout: 20_000 });
  });

  test('offers a searchable timezone picker', async ({ authedPage }) => {
    await gotoSettings(authedPage);
    await authedPage.locator('#timezone').click();

    await expect(authedPage.getByPlaceholder(/search timezones/i)).toBeVisible();
  });

  test('renders the change-password form', async ({ authedPage }) => {
    await gotoSettings(authedPage);

    await expect(authedPage.getByLabel(/current password/i)).toBeVisible();
    await expect(authedPage.getByLabel(/new password/i)).toBeVisible();
  });

  test('rejects a wrong current password', async ({ authedPage }) => {
    await gotoSettings(authedPage);
    await authedPage.getByLabel(/current password/i).fill('WrongPassword1!');
    await authedPage.getByLabel(/new password/i).fill('BrandNewP@ss456!');
    await authedPage.getByRole('button', { name: /change password/i }).click();

    await expect(authedPage.getByLabel(/current password/i)).toBeVisible();
  });

  test('rejects a too-short new password', async ({ authedPage, credentials }) => {
    await gotoSettings(authedPage);
    await authedPage.getByLabel(/current password/i).fill(credentials.password);
    await authedPage.getByLabel(/new password/i).fill('tiny');
    await authedPage.getByRole('button', { name: /change password/i }).click();

    await expect(authedPage.locator('#newPassword-error')).toBeVisible();
  });

  test('shows the connected-accounts section', async ({ authedPage }) => {
    await gotoSettings(authedPage);

    await expect(authedPage.getByRole('heading', { name: /connected accounts/i })).toBeVisible();
  });

  test('shows the danger zone with an account-deletion action', async ({ authedPage }) => {
    await gotoSettings(authedPage);

    await expect(authedPage.getByRole('heading', { name: /delete account/i })).toBeVisible();
  });

  test('account deletion asks for the password', async ({ authedPage }) => {
    await gotoSettings(authedPage);
    await authedPage
      .getByRole('button', { name: /delete account/i })
      .first()
      .click();

    await expect(authedPage.getByLabel(/enter your password to confirm/i)).toBeVisible();
  });

  test('account deletion can be cancelled', async ({ authedPage, api }) => {
    await gotoSettings(authedPage);
    await authedPage
      .getByRole('button', { name: /delete account/i })
      .first()
      .click();
    await authedPage.getByRole('button', { name: /^cancel$/i }).click();

    expect((await api.get('/auth/me')).status()).toBe(200);
  });
});

test.describe('UI — calendar settings', () => {
  test('lists the default calendar', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'calendars');

    await expect(content(authedPage).getByRole('button', { name: /edit personal/i })).toBeVisible();
  });

  test('offers a new-calendar action', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'calendars');

    await expect(content(authedPage).getByRole('button', { name: /new calendar/i })).toBeVisible();
  });

  test('opens a dialog to create a calendar', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'calendars');
    await content(authedPage)
      .getByRole('button', { name: /new calendar/i })
      .click();

    await expect(authedPage.locator('#new-cat-name')).toBeVisible();
  });

  test('creates a new calendar', async ({ authedPage, api }) => {
    await gotoSettings(authedPage, 'calendars');
    await content(authedPage)
      .getByRole('button', { name: /new calendar/i })
      .click();
    await authedPage.locator('#new-cat-name').fill('Fitness');
    await authedPage
      .getByRole('dialog')
      .getByRole('button', { name: /^create$/i })
      .click();

    await expect(async () => {
      expect((await api.categories()).map((c) => c.name)).toContain('Fitness');
    }).toPass({ timeout: 20_000 });
  });

  test('the create button stays disabled without a name', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'calendars');
    await content(authedPage)
      .getByRole('button', { name: /new calendar/i })
      .click();

    await expect(
      authedPage.getByRole('dialog').getByRole('button', { name: /^create$/i }),
    ).toBeDisabled();
  });

  test('renames a calendar', async ({ authedPage, api }) => {
    await api.createCategory('Renameable', '#10B981');
    await gotoSettings(authedPage, 'calendars');

    await content(authedPage)
      .getByRole('button', { name: /edit renameable/i })
      .click();
    await authedPage.locator('#edit-cat-name').fill('Renamed calendar');
    await authedPage
      .getByRole('dialog')
      .getByRole('button', { name: /^save$/i })
      .click();

    await expect(async () => {
      expect((await api.categories()).map((c) => c.name)).toContain('Renamed calendar');
    }).toPass({ timeout: 20_000 });
  });

  test('deletes a calendar after confirmation', async ({ authedPage, api }) => {
    await api.createCategory('Disposable', '#EF4444');
    await gotoSettings(authedPage, 'calendars');

    await content(authedPage)
      .getByRole('button', { name: /delete disposable/i })
      .click();
    await authedPage
      .getByRole('dialog')
      .getByRole('button', { name: /^delete$/i })
      .click();

    await expect(async () => {
      expect((await api.categories()).map((c) => c.name)).not.toContain('Disposable');
    }).toPass({ timeout: 20_000 });
  });

  test('the default calendar cannot be deleted', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'calendars');

    await expect(content(authedPage).getByRole('button', { name: /delete personal/i })).toHaveCount(
      0,
    );
  });
});

test.describe('UI — notification settings', () => {
  test('renders the notifications section', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'notifications');

    await expect(
      authedPage.getByRole('heading', { name: 'Notifications', exact: true }).first(),
    ).toBeVisible();
  });

  test('offers a default reminder time', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'notifications');

    await expect(authedPage.locator('#default-reminder-time')).toBeVisible();
  });

  test('offers a default reminder method', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'notifications');

    await expect(authedPage.locator('#default-reminder-method')).toBeVisible();
  });

  test('shows the push notification section', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'notifications');

    await expect(authedPage.getByRole('heading', { name: /push notifications/i })).toBeVisible();
  });
});

test.describe('UI — session settings', () => {
  test('renders the sessions section', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'sessions');

    await expect(authedPage.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  });

  test('lists the current session', async ({ authedPage }) => {
    await gotoSettings(authedPage, 'sessions');

    await expect(authedPage.getByText(/current/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('a second session shows up in the list', async ({ authedPage, api, credentials }) => {
    const { newApiSession } = await import('../support/api');
    const second = await newApiSession();
    await second.login(credentials);

    await gotoSettings(authedPage, 'sessions');
    await expect(async () => {
      const sessions = (await (await api.get('/auth/sessions')).json()) as unknown[];
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 20_000 });

    await second.dispose();
  });

  test('offers a revoke-all action', async ({ authedPage, credentials }) => {
    const { newApiSession } = await import('../support/api');
    const second = await newApiSession();
    await second.login(credentials);

    await gotoSettings(authedPage, 'sessions');
    await expect(
      authedPage.getByRole('button', { name: /sign out.*other|revoke all/i }),
    ).toBeVisible({ timeout: 20_000 });

    await second.dispose();
  });
});
