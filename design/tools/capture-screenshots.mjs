/**
 * Capture screenshots of every meaningful Calley UI surface against the
 * real app (real API, real seeded data) for the design-agency handoff.
 */
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:5173';
const OUT = process.env.SHOT_DIR ?? new URL('../screenshots/', import.meta.url).pathname;

const EMAIL = 'maya.rios@calley.app';
const PASSWORD = 'designreview2026';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = devices['iPhone 12'];

const shots = [];

async function shoot(page, name, opts = {}) {
  const file = `${OUT}/${name}.png`;
  await page.waitForTimeout(opts.settle ?? 500);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  shots.push(name);
  console.log('  ✓', name);
}

/**
 * The layout renders duplicate controls for the mobile and desktop
 * breakpoints, so every click has to target the visible one.
 */
function visibleRole(page, role, name) {
  return page.getByRole(role, { name }).filter({ visible: true }).first();
}

/**
 * Week and day views auto-scroll the time grid to "now". At screenshot time
 * that can be the middle of the night, so pull the grid back to the morning
 * where the seeded day actually starts.
 */
async function scrollTimeGridToMorning(page) {
  await page.evaluate(() => {
    const grid = document.querySelector('.flex-1.overflow-y-auto.overflow-x-hidden');
    if (grid) grid.scrollTop = 7 * 60; // ~7am at 60px/hour
  });
  await page.waitForTimeout(400);
}

/** The view switcher renders role="tab", not role="button". */
async function setView(page, view) {
  await visibleRole(page, 'tab', new RegExp(`^${view}$`, 'i')).click();
  await page.waitForTimeout(900);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(calendar|)$/, { timeout: 20_000 });
  await page.waitForTimeout(2500);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // The sandbox exports HTTPS_PROXY; without bypassing it Chromium MITMs
  // localhost and Vite's lazy view chunks fail with ERR_CERT_AUTHORITY_INVALID,
  // leaving every calendar view stuck on its loading spinner.
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-proxy-server', '--proxy-bypass-list=<-loopback>'],
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Auth surfaces (logged out)
  // ─────────────────────────────────────────────────────────────
  console.log('\nAuth screens');
  {
    const ctx = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 2,
      timezoneId: 'UTC',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await shoot(page, '01-auth-login');

    // Validation error state
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await shoot(page, '02-auth-login-validation-errors', { settle: 900 });

    await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
    await shoot(page, '03-auth-signup');

    // Password strength meter
    await page
      .getByLabel(/^password/i)
      .first()
      .fill('Tr0ub4dor&3-design');
    await shoot(page, '04-auth-signup-password-strength', { settle: 900 });

    await page.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle' });
    await shoot(page, '05-auth-forgot-password');

    await page.goto(`${BASE}/reset-password?token=demo-token-for-screenshot`, {
      waitUntil: 'networkidle',
    });
    await shoot(page, '06-auth-reset-password');

    await ctx.close();
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Desktop app surfaces (logged in)
  // ─────────────────────────────────────────────────────────────
  console.log('\nDesktop app');
  const ctx = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    timezoneId: 'UTC',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('    [console error]', m.text().slice(0, 160));
  });

  await login(page);
  await shoot(page, '10-calendar-month-view', { settle: 1500 });

  await setView(page, 'week');
  await scrollTimeGridToMorning(page);
  await shoot(page, '11-calendar-week-view', { settle: 1500 });

  await setView(page, 'day');
  await scrollTimeGridToMorning(page);
  await shoot(page, '12-calendar-day-view', { settle: 1500 });

  await setView(page, 'agenda');
  await shoot(page, '13-calendar-agenda-view', { settle: 1500 });

  await setView(page, 'month');

  // Task panel
  await visibleRole(page, 'button', /toggle task panel/i).click();
  await shoot(page, '14-task-panel-open', { settle: 1500 });

  // Task panel + week view together — the densest screen in the app
  await setView(page, 'week');
  await scrollTimeGridToMorning(page);
  await shoot(page, '15-week-view-with-task-panel', { settle: 1500 });

  // Task drawer (edit an existing task)
  try {
    await page.locator('button[aria-label^="Edit task"]').first().click({ timeout: 4000 });
    await shoot(page, '16-task-drawer-edit', { settle: 1200 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  } catch {
    console.log('    (task drawer: no clickable task row found, skipped)');
  }

  await visibleRole(page, 'button', /toggle task panel/i).click();
  await page.waitForTimeout(600);
  await setView(page, 'month');

  // Event detail popover — click an event pill
  try {
    await page.locator('[data-event-id]').first().click({ timeout: 5000 });
    await shoot(page, '17-event-detail-popover', { settle: 1200 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  } catch {
    console.log('    (event popover: no event pill matched, skipped)');
  }

  // Event drawer — create
  await page.keyboard.press('c');
  await shoot(page, '18-event-drawer-create', { settle: 1500 });

  // Fill the create form so the drawer reads as a real event, not a blank shell
  try {
    await page.locator('#event-title').fill('Quarterly planning workshop', { timeout: 4000 });
    await page.locator('#event-location').fill('Studio A', { timeout: 4000 });
    await page
      .locator('#event-description')
      .fill('Half-day session to lock the Q4 roadmap and hand off the design-system work.', {
        timeout: 4000,
      });
    await shoot(page, '18b-event-drawer-create-filled', { settle: 900 });
  } catch (err) {
    console.log('    (event drawer fill: skipped)', String(err).slice(0, 80));
  }

  // Drawer scrolled to its footer — reminder field plus the save/cancel bar
  try {
    await page.evaluate(() => {
      const sheet = document.querySelector('[class*=overflow-y-auto][class*="sm:max-w-lg"]');
      if (sheet) sheet.scrollTop = sheet.scrollHeight;
    });
    await shoot(page, '18c-event-drawer-scrolled-footer', { settle: 900 });
    await page.evaluate(() => {
      const sheet = document.querySelector('[class*=overflow-y-auto][class*="sm:max-w-lg"]');
      if (sheet) sheet.scrollTop = 0;
    });
    await page.waitForTimeout(400);
  } catch (err) {
    console.log('    (event drawer scroll: skipped)', String(err).slice(0, 80));
  }

  // Recurrence builder — the "Repeat" label is not wired to the trigger via
  // htmlFor, so target the field group that contains it.
  try {
    const repeatTrigger = page
      .locator('label')
      .filter({ hasText: /^Repeat$/ })
      .locator('xpath=..')
      .getByRole('combobox')
      .first();
    await repeatTrigger.click({ timeout: 4000 });
    await page.waitForTimeout(600);
    await page
      .getByRole('option', { name: /custom/i })
      .first()
      .click({ timeout: 4000 });
    await shoot(page, '19-recurrence-builder-modal', { settle: 1400 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  } catch (err) {
    console.log(
      '    (recurrence builder: control not reachable, skipped)',
      String(err).slice(0, 90),
    );
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);

  // Search modal — results, then the no-results state
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(700);
  await page.keyboard.type('design');
  await shoot(page, '20-search-modal', { settle: 1600 });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('zzzznothing');
  await shoot(page, '41-search-no-results', { settle: 2000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // Keyboard shortcuts help
  await page.keyboard.press('?');
  await shoot(page, '21-keyboard-shortcuts-help', { settle: 1200 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // User menu open
  try {
    await page.locator('header button').last().click({ timeout: 3000 });
    await shoot(page, '22-user-menu', { settle: 900 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch {
    console.log('    (user menu: skipped)');
  }

  // Sidebar collapsed
  await visibleRole(page, 'button', /toggle sidebar/i).click();
  await shoot(page, '23-sidebar-collapsed', { settle: 900 });
  await visibleRole(page, 'button', /toggle sidebar/i).click();
  await page.waitForTimeout(600);

  // Quick-create popover — clicking an empty slot in the week grid
  try {
    await setView(page, 'week');
    await scrollTimeGridToMorning(page);
    await page.mouse.click(1000, 700);
    await shoot(page, '24-quick-create-popover', { settle: 1200 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await setView(page, 'month');
  } catch (err) {
    console.log('    (quick create: skipped)', String(err).slice(0, 100));
  }

  // Month overflow: "+N more" navigates to that date's day view rather than
  // expanding the cell, which is itself the thing worth showing.
  try {
    await visibleRole(page, 'button', /\d+ more items?/i).click();
    await page.waitForTimeout(1500);
    await scrollTimeGridToMorning(page);
    await shoot(page, '25-month-more-link-opens-day-view', { settle: 1200 });
    await setView(page, 'month');
  } catch (err) {
    console.log('    (month overflow: skipped)', String(err).slice(0, 100));
  }

  // Task filter menu
  try {
    await visibleRole(page, 'button', /toggle task panel/i).click();
    await page.waitForTimeout(1000);
    await page.getByText('All priorities', { exact: true }).first().click({ timeout: 8000 });
    await shoot(page, '26-task-filter-menu', { settle: 1000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await visibleRole(page, 'button', /show done/i).click({ timeout: 6000 });
    await page.waitForTimeout(1200);
    // Completed tasks sort to the bottom of the list, well below the fold
    await page.evaluate(() => {
      const list = [...document.querySelectorAll('div')].find(
        (el) => el.scrollHeight > el.clientHeight + 40 && el.closest('[class*="border-l"]'),
      );
      if (list) list.scrollTop = list.scrollHeight;
    });
    await shoot(page, '27-task-panel-showing-done', { settle: 1200 });
    await visibleRole(page, 'button', /hide done/i).click({ timeout: 6000 });
    await page.waitForTimeout(400);
    await visibleRole(page, 'button', /toggle task panel/i).click();
    await page.waitForTimeout(600);
  } catch (err) {
    console.log('    (task filter: skipped)', String(err).slice(0, 100));
  }

  // ── Settings ──
  console.log('\nSettings');
  for (const [slug, name] of [
    ['profile', '30-settings-profile'],
    ['calendars', '31-settings-calendars'],
    ['notifications', '32-settings-notifications'],
    ['sessions', '33-settings-sessions'],
  ]) {
    await page.goto(`${BASE}/settings/${slug}`, { waitUntil: 'networkidle' });
    await shoot(page, name, { settle: 1600 });
  }

  // ── A far-future month: nothing but the never-ending recurring series ──
  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 8; i++) {
    await visibleRole(page, 'button', /^next$/i).click();
    await page.waitForTimeout(150);
  }
  await shoot(page, '40-month-sparse-recurring-only', { settle: 1800 });

  await ctx.close();

  // ─────────────────────────────────────────────────────────────
  // 3. Mobile surfaces
  // ─────────────────────────────────────────────────────────────
  console.log('\nMobile');
  {
    const mctx = await browser.newContext({
      ...MOBILE,
      deviceScaleFactor: 3,
      timezoneId: 'UTC',
      ignoreHTTPSErrors: true,
    });
    const mpage = await mctx.newPage();

    await mpage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await shoot(mpage, '50-mobile-login');

    await login(mpage);

    // At <1024px the sidebar still starts open, so the drawer and its backdrop
    // cover the calendar on first load — capture that as-is, then dismiss it.
    await shoot(mpage, '52-mobile-sidebar-drawer-default-open', { settle: 1800 });

    // Dismiss via the backdrop (the topbar is behind it and cannot be clicked)
    await mpage.mouse.click(360, 600);
    await mpage.waitForTimeout(900);
    await shoot(mpage, '51-mobile-month-view', { settle: 1200 });

    try {
      await setView(mpage, 'day');
      await scrollTimeGridToMorning(mpage);
      await shoot(mpage, '53-mobile-day-view', { settle: 1600 });
    } catch (err) {
      console.log('    (mobile day view: skipped)', String(err).slice(0, 160));
    }

    try {
      await setView(mpage, 'agenda');
      await shoot(mpage, '54-mobile-agenda-view', { settle: 1600 });
    } catch (err) {
      console.log('    (mobile agenda view: skipped)', String(err).slice(0, 160));
    }

    // The task-panel toggle is `hidden sm:flex`, so at 390px there is no route
    // to tasks at all — recorded as a gap in the audit, not as a screenshot.
    // Search / New / task-panel / user-menu all sit past the right edge of the
    // 390px topbar and cannot be clicked at all — that gap is recorded in the
    // audit rather than screenshotted.

    try {
      await mpage.goto(`${BASE}/settings/profile`, { waitUntil: 'networkidle' });
      await shoot(mpage, '57-mobile-settings-profile', { settle: 1600 });
    } catch (err) {
      console.log('    (mobile settings: skipped)', String(err).slice(0, 160));
    }

    await mctx.close();
  }

  await browser.close();
  console.log(`\nCaptured ${shots.length} screenshots into ${OUT}`);
}

main().catch((err) => {
  console.error('SHOTS FAILED:', err);
  process.exit(1);
});
