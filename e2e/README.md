# Calley E2E Suite

End-to-end tests driven by Playwright. Two layers, one runner:

| Directory       | What it covers                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `e2e/api/`      | The HTTP contract — status codes, validation, ownership, recurrence expansion, CSRF, headers. Fast, no browser page needed. |
| `e2e/ui/`       | The app in a real browser — forms, drawers, calendar views, keyboard shortcuts, settings, responsive layout.                |
| `e2e/*.spec.ts` | The original P0/P1/P2 journeys (critical path, core features, edge cases).                                                  |
| `e2e/support/`  | Shared fixtures and helpers.                                                                                                |

## Running

```bash
# The whole suite, once, in Chromium — what you normally want
pnpm test:e2e --project=chromium

# One area
pnpm test:e2e --project=chromium e2e/api
pnpm test:e2e --project=chromium e2e/ui/calendar.spec.ts

# One other browser
pnpm test:e2e --project=firefox
pnpm test:e2e --project="Mobile Safari"
```

**Pass `--project` locally.** With no project selected, Playwright runs every
configured project — Chromium, Firefox, WebKit, Mobile Chrome and Mobile
Safari — so a bare `pnpm test:e2e` is five full passes, over 3,000 test
executions. That is the cross-browser sweep from §9.5, not a normal run. CI
selects Chromium on its own, so this only affects local invocations.

Playwright starts the API and web dev servers itself and reuses them if they
are already running. Both need the usual environment (`DATABASE_URL`,
`REDIS_URL`, `SESSION_SECRET`, …) exported in the shell, plus:

```bash
export RATE_LIMIT_ENABLED=false   # signup is capped at 3/hour otherwise
```

### Sandboxes without Playwright's pinned browser

If the environment ships its own Chromium and cannot download Playwright's
build, point the runner at it:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome pnpm test:e2e
```

Setting it also skips the Firefox/WebKit/mobile projects, which have no
equivalent override.

## How the fixtures work

Every test that needs an account gets **its own freshly signed-up user**
(`e2e/support/fixtures.ts`). That is what makes the suite safe to run fully
parallel: no test can see another test's events, tasks or categories, and
there is no shared seed to reset between runs.

- `anonApi` — unauthenticated API client, for signup/login and negative paths.
- `api` — API client for a brand-new user; `credentials` holds its login.
- `category` — that user's auto-provisioned "Personal" calendar.
- `otherApi` — a second, independent user, for ownership/IDOR assertions.
- `authedPage` — a browser page that has already adopted `api`'s session
  cookies and is sitting on `/calendar`.

`authedPage` copies the session and CSRF cookies from the API context instead
of filling in the signup form, so the Argon2id hash (~1s) is paid once per
test rather than once per page load.

## Conventions

- Assert on **roles and accessible names** (`getByRole`, `getByLabel`) rather
  than CSS classes — the assertions double as accessibility coverage.
- Use Playwright's auto-waiting assertions. Never `waitForTimeout` as a
  synchronisation primitive; use `expect(...).toPass()` for eventually-consistent
  state such as an optimistic update reconciling with the server.
- Dates come from `e2e/support/dates.ts`. Specs that only care about ordering
  anchor on a fixed future date so they never drift; the browser and new
  accounts are both pinned to UTC.
- When the app's real behaviour differs from what a test "should" assert, the
  test pins the real behaviour and says why in a comment. Tests are a record of
  what the app does, not a wish list.
