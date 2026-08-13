# Screen Inventory

38 screenshots in `design/screenshots/`, captured from the running app — real API, real
PostgreSQL, a seeded account with 32 events (including all-day and recurring), 14 tasks across four
categories and every priority and status.

- **Desktop:** 1440×900, 2× device pixel ratio (files are 2880×1800).
- **Mobile:** iPhone 12 (390×844), 3× device pixel ratio.
- **Timezone:** UTC, so the seeded times and the rendered times match exactly.
- **Date at capture:** Thursday 13 August 2026. "Today" is Thu 13 Aug throughout.

---

## Auth (logged out, 1440×900)

| File                                   | What it shows                                                  |
| -------------------------------------- | -------------------------------------------------------------- |
| `01-auth-login.png`                    | Login — email, password, OAuth buttons, forgot-password link   |
| `02-auth-login-validation-errors.png`  | Same form after an empty submit — the `.field-error` shape cue |
| `03-auth-signup.png`                   | Signup — name, email, password                                 |
| `04-auth-signup-password-strength.png` | Password strength meter (zxcvbn) responding to input           |
| `05-auth-forgot-password.png`          | Single-field reset request                                     |
| `06-auth-reset-password.png`           | New-password form reached from an emailed token                |

## Calendar views (1440×900)

| File                                 | What it shows                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `10-calendar-month-view.png`         | Month grid, 6×7, three event pills per cell then "+N more"; sidebar with mini-calendar and four categories               |
| `11-calendar-week-view.png`          | Week — all-day row above a 96px/hour grid, multi-day "Design offsite" band, the Ember now-line                           |
| `12-calendar-day-view.png`           | Day — single column, scrolled to the morning                                                                             |
| `13-calendar-agenda-view.png`        | Agenda — date-grouped list; note the full-height "No events or tasks" rows for empty days                                |
| `40-month-sparse-recurring-only.png` | Month eight months ahead — nothing but the two never-ending recurring series, which is how a sparse month actually reads |
| `41-search-no-results.png`           | Search with no matches — a bare `CommandEmpty` line, not the designed `EmptyState` component (see DESIGN-SYSTEM.md §4.3) |

## Task panel (1440×900)

| File                               | What it shows                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `14-task-panel-open.png`           | Panel over month view — Overdue / Today / Upcoming / No date groups, priority dots, category rules                       |
| `15-week-view-with-task-panel.png` | Panel plus week view — the densest screen in the product                                                                 |
| `26-task-filter-menu.png`          | Priority filter select, open                                                                                             |
| `27-task-panel-showing-done.png`   | "Show done" toggled and the list scrolled down — a fifth group, "Completed", appears at the bottom, collapsed by default |

## Creating and editing (1440×900)

| File                                    | What it shows                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `18-event-drawer-create.png`            | New Event drawer, empty                                                                                                   |
| `18b-event-drawer-create-filled.png`    | Same drawer filled — title, description, location, category, **and the 8 off-system "Colour override" swatches**          |
| `18c-event-drawer-scrolled-footer.png`  | Drawer scrolled to the bottom — Repeat, Reminder, Cancel / Create. Shows how far below the fold the primary action sits   |
| `16-task-drawer-edit.png`               | Task drawer, editing an existing task                                                                                     |
| `19-recurrence-builder-modal.png`       | Custom Recurrence dialog stacked over the event drawer, with the "Next occurrences" preview                               |
| `24-quick-create-popover.png`           | Quick-create popover from clicking an empty week-grid slot                                                                |
| `17-event-detail-popover.png`           | Event detail popover — Edit / Duplicate / Export / Delete                                                                 |
| `25-month-more-link-opens-day-view.png` | The result of clicking "+N more" in a month cell: it **navigates to that date's Day view** rather than expanding the cell |

## Global chrome and overlays (1440×900)

| File                             | What it shows                         |
| -------------------------------- | ------------------------------------- |
| `20-search-modal.png`            | cmdk search with results for "design" |
| `21-keyboard-shortcuts-help.png` | Shortcut reference modal (`?`)        |
| `22-user-menu.png`               | Avatar dropdown                       |
| `23-sidebar-collapsed.png`       | Sidebar at its 60px collapsed width   |

## Settings (1440×900)

| File                            | What it shows                                                     |
| ------------------------------- | ----------------------------------------------------------------- |
| `30-settings-profile.png`       | Profile — name, timezone, week start, time format                 |
| `31-settings-calendars.png`     | Calendar categories — reorder handles, colour dots, edit / delete |
| `32-settings-notifications.png` | Notification preferences, push subscription                       |
| `33-settings-sessions.png`      | Active sessions list, revoke                                      |

All four show the problem described in DESIGN-SYSTEM.md §7.3: settings sits inside the calendar
chrome, under a topbar still offering month navigation and view switching.

## Mobile (iPhone 12, 390×844)

| File                                        | What it shows                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `50-mobile-login.png`                       | Login at 390px — this one works well                                                                                                                                            |
| `52-mobile-sidebar-drawer-default-open.png` | **First screen after login.** The sidebar drawer and its backdrop cover the calendar because `isSidebarOpen` defaults to `true` at every viewport                               |
| `51-mobile-month-view.png`                  | The same screen after dismissing the drawer — a horizontally clipped month grid, and a topbar whose Search / New / Tasks / account controls have been pushed off the right edge |
| `53-mobile-day-view.png`                    | Day view at 390px — the view that actually works on a phone                                                                                                                     |
| `54-mobile-agenda-view.png`                 | Agenda at 390px                                                                                                                                                                 |
| `57-mobile-settings-profile.png`            | Settings at 390px                                                                                                                                                               |

**Not capturable on mobile, because the controls cannot be reached:** create-event, search, the
task panel, and the user menu. That is the finding, not a gap in the capture — see
DESIGN-SYSTEM.md §7.2.

---

## Reproducing these

The capture is scripted end to end. From a clean checkout:

```bash
# 1. Infrastructure
docker compose -f docker/docker-compose.dev.yml up -d     # or a local postgres:16 + redis:7

# 2. Schema
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm --filter api exec drizzle-kit push --force

# 3. Dev servers  (the API reads env from the shell, it has no dotenv loader)
set -a && . ./apps/api/.env && set +a
pnpm --filter api dev &
pnpm --filter web dev &

# 4. Seed a realistic account, then capture
node design/tools/seed-demo-account.mjs
node design/tools/capture-screenshots.mjs
```

Both scripts take overrides from the environment: `SHOT_DIR` for the output directory, and
`CHROMIUM_PATH` for a Chromium binary if Playwright's own download isn't present (e.g.
`CHROMIUM_PATH=/opt/pw-browsers/chromium`).

Three environment notes, all of which cost time to discover:

- **The API has no dotenv loader.** `apps/api/.env` is read from the shell or not at all — hence the
  `set -a && . ./apps/api/.env` above. Started any other way, it exits on `DATABASE_URL is required`.
- **`apps/web/.env.example` points at the wrong base URL.** It ships
  `VITE_API_URL=http://localhost:4000/api/v1`, but the API mounts its routes at `/v1` and at the
  root — never at `/api/v1`. Use `http://localhost:4000`, or auth silently 401s and the app bounces
  straight back to `/login`.
- **An HTTPS proxy breaks lazy chunks.** If one is set, Chromium must be launched with
  `--no-proxy-server` (the capture script already does), or Vite's lazily imported view chunks fail
  with `ERR_CERT_AUTHORITY_INVALID` and every calendar view renders as a permanent loading spinner.

Demo account created by the seed script: `maya.rios@calley.app` / `designreview2026`.
