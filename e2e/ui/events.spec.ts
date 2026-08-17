import { expect, test } from '../support/fixtures';

import type { Page } from '@playwright/test';

/**
 * Event authoring through the UI: the create dropdown, the event drawer,
 * its validation, and the edit/delete round trip.
 */

/** Open the event drawer from the topbar "New" dropdown. */
async function openEventDrawer(page: Page) {
  await page.getByRole('button', { name: /create new/i }).click();
  await page.getByRole('menuitem', { name: /new event/i }).click();

  const drawer = page.getByRole('dialog').first();
  await expect(drawer).toBeVisible();
  return drawer;
}

/**
 * Open an existing event for editing: clicking a pill opens the detail
 * popover, whose Edit action opens the drawer.
 *
 * Waits for the stored title to land in the form. The drawer mounts before
 * its prefill resolves, so filling too early appends to an empty field and
 * then gets the stored value written in front of it.
 */
async function openEventForEdit(page: Page, title: string) {
  await page
    .getByRole('button', { name: new RegExp(title, 'i') })
    .first()
    .click();
  await page.getByRole('button', { name: /edit event/i }).click();

  const drawer = page.getByRole('dialog').first();
  await expect(drawer).toBeVisible();
  await expect(page.getByLabel(/^title$/i)).toHaveValue(title, { timeout: 20_000 });
  return drawer;
}

/** Fill the title and submit the drawer form. */
async function createEventViaDrawer(page: Page, title: string) {
  const drawer = await openEventDrawer(page);
  await page.getByLabel(/^title$/i).fill(title);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(drawer).toBeHidden({ timeout: 20_000 });
}

test.describe('UI — create dropdown', () => {
  test('offers both event and task entries', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /create new/i }).click();

    await expect(authedPage.getByRole('menuitem', { name: /new event/i })).toBeVisible();
    await expect(authedPage.getByRole('menuitem', { name: /new task/i })).toBeVisible();
  });

  test('opens the event drawer', async ({ authedPage }) => {
    const drawer = await openEventDrawer(authedPage);
    await expect(drawer.getByText('New Event')).toBeVisible();
  });

  test('the c shortcut opens the event drawer', async ({ authedPage }) => {
    await authedPage.locator('body').click({ position: { x: 4, y: 4 }, force: true });
    await authedPage.keyboard.press('c');

    await expect(authedPage.getByRole('dialog').first()).toBeVisible();
  });
});

test.describe('UI — event drawer form', () => {
  test('renders the core fields', async ({ authedPage }) => {
    await openEventDrawer(authedPage);

    await expect(authedPage.getByLabel(/^title$/i)).toBeVisible();
    await expect(authedPage.getByLabel(/start date/i)).toBeVisible();
    await expect(authedPage.getByLabel(/end date/i)).toBeVisible();
    await expect(authedPage.getByLabel(/^description$/i)).toBeVisible();
    await expect(authedPage.getByLabel(/^location$/i)).toBeVisible();
  });

  test('focuses the title field on open', async ({ authedPage }) => {
    await openEventDrawer(authedPage);

    await expect(authedPage.getByLabel(/^title$/i)).toBeFocused();
  });

  test('prefills a one-hour default duration', async ({ authedPage }) => {
    await openEventDrawer(authedPage);

    const start = await authedPage.getByLabel(/start time/i).inputValue();
    const end = await authedPage.getByLabel(/end time/i).inputValue();
    expect(start).toMatch(/^\d{2}:\d{2}$/);
    expect(end).toMatch(/^\d{2}:\d{2}$/);
    expect(start).not.toBe(end);
  });

  test('requires a title', async ({ authedPage }) => {
    await openEventDrawer(authedPage);
    await authedPage.getByRole('button', { name: /^create$/i }).click();

    await expect(authedPage.locator('#event-title-error')).toContainText(/title is required/i);
  });

  test('keeps the drawer open when validation fails', async ({ authedPage }) => {
    const drawer = await openEventDrawer(authedPage);
    await authedPage.getByRole('button', { name: /^create$/i }).click();

    await expect(drawer).toBeVisible();
  });

  test('rejects an end time before the start time', async ({ authedPage }) => {
    await openEventDrawer(authedPage);
    await authedPage.getByLabel(/^title$/i).fill('Backwards');
    await authedPage.getByLabel(/start time/i).fill('14:00');
    await authedPage.getByLabel(/end time/i).fill('13:00');
    await authedPage.getByRole('button', { name: /^create$/i }).click();

    await expect(authedPage.locator('#event-end-time-error')).toContainText(
      /end time must be after start time/i,
    );
  });

  test('hides the time fields for an all-day event', async ({ authedPage }) => {
    await openEventDrawer(authedPage);
    await authedPage.getByLabel(/all-day event/i).click();

    await expect(authedPage.getByLabel(/start time/i)).toHaveCount(0);
    await expect(authedPage.getByLabel(/end time/i)).toHaveCount(0);
  });

  test('offers a colour override palette', async ({ authedPage }) => {
    await openEventDrawer(authedPage);

    await expect(authedPage.getByRole('button', { name: 'No color override' })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: 'Color #3B82F6' })).toBeVisible();
  });

  test('the Cancel button closes the drawer', async ({ authedPage }) => {
    const drawer = await openEventDrawer(authedPage);
    await authedPage.getByRole('button', { name: /^cancel$/i }).click();

    await expect(drawer).toBeHidden();
  });

  test('Escape closes the drawer', async ({ authedPage }) => {
    const drawer = await openEventDrawer(authedPage);
    await authedPage.keyboard.press('Escape');

    await expect(drawer).toBeHidden();
  });

  test('a cancelled drawer creates nothing', async ({ authedPage, api }) => {
    await openEventDrawer(authedPage);
    await authedPage.getByLabel(/^title$/i).fill('Never saved');
    await authedPage.getByRole('button', { name: /^cancel$/i }).click();

    const events = await api.listEvents(
      new Date(Date.now() - 86_400_000 * 30).toISOString(),
      new Date(Date.now() + 86_400_000 * 30).toISOString(),
    );
    expect(events).toEqual([]);
  });
});

test.describe('UI — create and edit an event', () => {
  test('creates an event and shows it on the calendar', async ({ authedPage }) => {
    await createEventViaDrawer(authedPage, 'Product review');

    await expect(authedPage.getByRole('button', { name: /product review/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('the created event is persisted server-side', async ({ authedPage, api }) => {
    await createEventViaDrawer(authedPage, 'Persisted event');

    const events = await api.listEvents(
      new Date(Date.now() - 86_400_000 * 30).toISOString(),
      new Date(Date.now() + 86_400_000 * 30).toISOString(),
    );
    expect(events.map((e) => e.title)).toContain('Persisted event');
  });

  test('stores the description and location entered in the drawer', async ({ authedPage, api }) => {
    const drawer = await openEventDrawer(authedPage);
    await authedPage.getByLabel(/^title$/i).fill('Detailed event');
    await authedPage.getByLabel(/^description$/i).fill('All the details');
    await authedPage.getByLabel(/^location$/i).fill('Room 12');
    await authedPage.getByRole('button', { name: /^create$/i }).click();
    await expect(drawer).toBeHidden({ timeout: 20_000 });

    const events = await api.listEvents(
      new Date(Date.now() - 86_400_000 * 30).toISOString(),
      new Date(Date.now() + 86_400_000 * 30).toISOString(),
    );
    const created = events.find((e) => e.title === 'Detailed event')!;
    expect(created.description).toContain('All the details');
    expect(created.location).toBe('Room 12');
  });

  test('clicking an event opens its detail popover', async ({ authedPage }) => {
    await createEventViaDrawer(authedPage, 'Popover event');
    await authedPage
      .getByRole('button', { name: /popover event/i })
      .first()
      .click();

    await expect(authedPage.getByRole('button', { name: /edit event/i })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: /duplicate event/i })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: /delete event/i })).toBeVisible();
  });

  test('opens an existing event for editing', async ({ authedPage }) => {
    await createEventViaDrawer(authedPage, 'Editable event');
    const drawer = await openEventForEdit(authedPage, 'Editable event');

    await expect(drawer.getByText('Edit Event')).toBeVisible();
  });

  test('duplicates an event from the popover', async ({ authedPage, api }) => {
    await createEventViaDrawer(authedPage, 'Twinned event');
    await authedPage
      .getByRole('button', { name: /twinned event/i })
      .first()
      .click();
    await authedPage.getByRole('button', { name: /duplicate event/i }).click();

    await expect(async () => {
      const events = await api.listEvents(
        new Date(Date.now() - 86_400_000 * 30).toISOString(),
        new Date(Date.now() + 86_400_000 * 30).toISOString(),
      );
      expect(events.filter((e) => e.title === 'Twinned event')).toHaveLength(2);
    }).toPass({ timeout: 20_000 });
  });

  test('prefills the drawer with the stored values', async ({ authedPage }) => {
    await createEventViaDrawer(authedPage, 'Prefilled event');
    await openEventForEdit(authedPage, 'Prefilled event');

    await expect(authedPage.getByLabel(/^title$/i)).toHaveValue('Prefilled event');
  });

  test('renames an event', async ({ authedPage }) => {
    await createEventViaDrawer(authedPage, 'Before rename');
    await openEventForEdit(authedPage, 'Before rename');

    await authedPage.getByLabel(/^title$/i).fill('After rename');
    await authedPage.getByRole('button', { name: /^save$/i }).click();

    await expect(authedPage.getByRole('button', { name: /after rename/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('the rename is persisted server-side', async ({ authedPage, api }) => {
    await createEventViaDrawer(authedPage, 'Rename me');
    await openEventForEdit(authedPage, 'Rename me');
    await authedPage.getByLabel(/^title$/i).fill('Renamed properly');
    await authedPage.getByRole('button', { name: /^save$/i }).click();
    await expect(authedPage.getByRole('dialog').first()).toBeHidden({ timeout: 20_000 });

    const events = await api.listEvents(
      new Date(Date.now() - 86_400_000 * 30).toISOString(),
      new Date(Date.now() + 86_400_000 * 30).toISOString(),
    );
    expect(events.map((e) => e.title)).toContain('Renamed properly');
  });

  test('the edit drawer offers a delete action', async ({ authedPage }) => {
    await createEventViaDrawer(authedPage, 'Deletable event');
    await openEventForEdit(authedPage, 'Deletable event');

    await expect(authedPage.getByRole('button', { name: /^delete$/i })).toBeVisible();
  });

  test('deletes an event from the drawer', async ({ authedPage, api }) => {
    await createEventViaDrawer(authedPage, 'Doomed event');
    await openEventForEdit(authedPage, 'Doomed event');
    await authedPage.getByRole('button', { name: /^delete$/i }).click();
    await expect(authedPage.getByRole('dialog').first()).toBeHidden({ timeout: 20_000 });

    const events = await api.listEvents(
      new Date(Date.now() - 86_400_000 * 30).toISOString(),
      new Date(Date.now() + 86_400_000 * 30).toISOString(),
    );
    expect(events).toEqual([]);
  });

  test('the deleted event disappears from the grid', async ({ authedPage }) => {
    await createEventViaDrawer(authedPage, 'Vanishing event');
    await expect(authedPage.getByRole('button', { name: /vanishing event/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    await openEventForEdit(authedPage, 'Vanishing event');
    await authedPage.getByRole('button', { name: /^delete$/i }).click();

    await expect(authedPage.getByText('Vanishing event')).toHaveCount(0, { timeout: 20_000 });
  });
});

test.describe('UI — recurring events', () => {
  test('offers recurrence presets in the drawer', async ({ authedPage }) => {
    await openEventDrawer(authedPage);
    await authedPage
      .getByRole('combobox')
      .filter({ hasText: /does not repeat/i })
      .click();

    await expect(authedPage.getByRole('option', { name: 'Daily' })).toBeVisible();
    await expect(authedPage.getByRole('option', { name: 'Weekly' })).toBeVisible();
    await expect(authedPage.getByRole('option', { name: 'Monthly' })).toBeVisible();
  });

  test('creates a daily recurring event', async ({ authedPage, api }) => {
    const drawer = await openEventDrawer(authedPage);
    await authedPage.getByLabel(/^title$/i).fill('Daily ritual');
    await authedPage
      .getByRole('combobox')
      .filter({ hasText: /does not repeat/i })
      .click();
    await authedPage.getByRole('option', { name: 'Daily' }).click();
    await authedPage.getByRole('button', { name: /^create$/i }).click();
    await expect(drawer).toBeHidden({ timeout: 20_000 });

    const events = await api.listEvents(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() + 86_400_000 * 5).toISOString(),
    );
    const ritual = events.filter((e) => e.title === 'Daily ritual');
    expect(ritual.length).toBeGreaterThan(1);
  });

  test('editing a recurring event asks for a scope', async ({ authedPage, api, category }) => {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0),
    );
    await api.createEvent({
      title: 'Scoped series',
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3_600_000).toISOString(),
      categoryId: category.id,
      rrule: 'FREQ=DAILY;COUNT=4',
    });
    await authedPage.reload();

    await openEventForEdit(authedPage, 'Scoped series');
    await authedPage.getByLabel(/^title$/i).fill('Scoped series edited');
    await authedPage.getByRole('button', { name: /^save$/i }).click();

    await expect(
      authedPage.getByText(/this event|this and following|all events/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('offers a reminder selector', async ({ authedPage }) => {
    await openEventDrawer(authedPage);

    await expect(
      authedPage.getByRole('combobox').filter({ hasText: /no reminder/i }),
    ).toBeVisible();
  });

  test('offers a visibility selector', async ({ authedPage }) => {
    await openEventDrawer(authedPage);

    await expect(authedPage.getByRole('combobox').filter({ hasText: /private/i })).toBeVisible();
  });
});
