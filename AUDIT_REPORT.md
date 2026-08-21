# Calley — Production Readiness Audit

Repository-wide audit of code quality, correctness, security, testing, CI, reliability and
performance, followed by remediation of everything actionable.

- **Audited at:** `003e197` (merge of PR #114)
- **Remediated on:** `claude/do-this-3ip0rl`
- **Scope:** `apps/api`, `apps/web`, `packages/shared`, `e2e/`, `docker/`, `.github/`, build config

Every finding below carries a final disposition. Nothing was skipped silently.

## Summary

| Disposition                      | Count |
| -------------------------------- | ----- |
| `FIXED`                          | 31    |
| `VALIDATED — NO CHANGE REQUIRED` | 6     |
| `NOT APPLICABLE`                 | 2     |
| `BLOCKED`                        | 2     |

Severity of fixed findings: 4 high, 17 medium, 10 low.

### Validation performed

| Check                                | Before                                       | After                             |
| ------------------------------------ | -------------------------------------------- | --------------------------------- |
| `pnpm build`                         | pass                                         | pass                              |
| `pnpm lint`                          | pass                                         | pass                              |
| `pnpm format`                        | pass                                         | pass                              |
| `pnpm type-check`                    | pass                                         | pass                              |
| `pnpm lint:css`                      | _(script did not exist)_                     | pass                              |
| `pnpm test`                          | 640 tests                                    | 740 tests                         |
| `pnpm test:coverage`                 | _(would fail — provider not installed)_      | pass, thresholds enforced         |
| `pnpm audit --prod`                  | 4 high, 2 moderate, 1 low                    | 1 low (dev-server-only)           |
| `pnpm audit` (all)                   | 20 high, 6 moderate, 1 low                   | 2 moderate, 1 low                 |
| `drizzle-kit migrate` on an empty DB | produced a schema the API cannot run against | reproduces `schema.ts` exactly    |
| Playwright E2E                       | pass                                         | see [E2E](#end-to-end-validation) |

A local PostgreSQL 16 + Redis 7 pair was stood up in the sandbox, so migrations, the API and the
full Playwright suite were all exercised against real services rather than mocks.

---

## High severity

### H1 — Login response time distinguished registered from unregistered emails

**Status: `FIXED`**

**Location:** `apps/api/src/services/auth.service.ts` — `login()`

**Evidence.** `login()` returned immediately on three paths — unknown email, OAuth-only account,
locked account — without reaching `argon2.verify`. A wrong password for a real account did reach it.
The project's stated non-negotiable #10 is "No user enumeration — login and password reset always
return generic messages", but the generic message is not what leaks here; the clock is.

Measured on the sandbox host with the project's Argon2id parameters
(`memoryCost: 65536, timeCost: 3, parallelism: 4`):

```
argon2.verify median = 69.2ms
```

That 69ms is exactly the work the early-return paths skipped, so an unregistered address answered
roughly 69ms faster than a registered one — far above any network jitter, and enough to enumerate an
account list with a handful of samples per address. The per-IP login rate limit (5 per 15 min) does
not close it: enumeration needs one request per candidate address, not many.

**Resolution.** Each early-return path now verifies the supplied password against a decoy Argon2
hash generated once at first use, so every outcome pays the same cost.

**Validation.** Unit tests assert `argon2.verify` is called exactly once on all three paths
(`auth.service.test.ts`). Measured against the running API after the fix:

```
unknown-email = 79.3ms   wrong-password = 77.8ms   ratio = 1.02x
```

---

### H2 — Rate limiting collapsed into one shared bucket for the whole deployment

**Status: `FIXED`**

**Location:** `apps/api/src/middleware/rate-limit.middleware.ts` — `getClientIp()`

**Evidence.** The client identifier was resolved from `X-Forwarded-For` / `X-Real-IP` only when
`TRUSTED_PROXIES` was set. `TRUSTED_PROXIES` is listed in `lib/env.ts` under `RECOMMENDED_VARS`, not
`REQUIRED_VARS`, so it is unset by default and the API starts fine without it. In that
configuration the function returned the literal string `'unknown'` for every caller:

```ts
// Without trusted proxies configured, fall back to a fixed identifier.
return 'unknown';
```

Every limiter without an explicit `keyFn` therefore keyed on one constant:

| Limiter               | Configured intent              | Actual effect                             |
| --------------------- | ------------------------------ | ----------------------------------------- |
| global (`app.ts`)     | 100 req/min per client         | 100 req/min for the entire deployment     |
| `/stream`             | 10 SSE connects/min per client | 10 connects/min for the entire deployment |
| `/push-subscriptions` | 20 req/min per user            | 20 req/min for the entire deployment      |

A single browser tab loading the calendar issues well over ten requests. With more than a handful of
concurrent users the API would return `429` to everyone, and one client could deny service to all
others without trying.

**Resolution.** Added `apps/api/src/lib/client-ip.ts`. Forwarded headers are still honoured only
behind a configured proxy; otherwise the identifier comes from the TCP socket address via
`@hono/node-server`'s `getConnInfo`, which a client cannot forge. IPv4-mapped IPv6 addresses are
normalised so one client cannot occupy two buckets. `/push-subscriptions` now keys by user id like
every other authenticated route.

**Validation.** `rate-limit.middleware.test.ts` asserts two clients get distinct Redis keys, that
rotating a forged `X-Forwarded-For` does not move a caller between buckets, and that the header is
honoured once `TRUSTED_PROXIES` is set.

---

### H3 — Committed migrations did not reproduce the schema

**Status: `FIXED`**

**Location:** `apps/api/drizzle/`, `apps/api/src/db/schema.ts`

**Evidence.** The migration directory held a single baseline, `0000_known_bullseye.sql`, predating
two schema objects that `schema.ts` declares and the application depends on:

- the entire `event_exceptions` table — every per-instance edit of a recurring event
  (`updateInstance`) writes to it;
- `idx_reset_tokens_one_active_per_user`, the partial unique index that enforces one live password
  reset token per user.

Running `drizzle-kit generate` against the committed snapshot produced a non-empty migration,
confirming the drift. A deployment applying the committed chain would therefore start an API that
fails on the first recurring-event instance edit. The drift was invisible because both CI and the
production deploy workflow used `drizzle-kit push`, which diffs against the live database and
ignores the migration history entirely — and `push` is interactive on destructive changes, so it is
not a safe production migration path in any case.

**Resolution.**

- Committed `0001_event_exceptions_and_reset_index.sql` closing the drift.
- Added a `db:migrate` script (`drizzle-kit migrate`) and switched CI's E2E job to it.
- Added a **Migrations** CI job that applies the chain to an empty database and then fails if
  `drizzle-kit generate` still finds changes, so this class of drift cannot recur.
- Removed a dead `drizzle/meta/` rule from `.gitignore`. It was anchored to the repository root so
  it never matched `apps/api/drizzle/meta/`, but had the directory moved it would have silently
  excluded the journal and snapshots — without which the migration chain cannot be extended or
  applied at all.

**Validation.** `drop schema public cascade` → `pnpm --filter api db:migrate` → 11 tables, all
indexes present, and `drizzle-kit generate` reports "No schema changes, nothing to migrate".

---

### H4 — DOMPurify XSS advisory in the sanitiser every description passes through

**Status: `FIXED`**

**Location:** `apps/api/package.json` → `isomorphic-dompurify@3.22.0` → `dompurify@3.4.12`

**Evidence.** `pnpm audit --prod` reported GHSA-55q2-fjhq-7xh7 (moderate): _IN_PLACE hook removal
leaves a detached subtree executable, causing XSS_, affecting `dompurify <= 3.4.12`. This is not a
dev-tool advisory — `lib/sanitize.ts` runs every event and task description through this exact
library before storage, and it is the project's only defence for stated requirement #3 ("Sanitize
HTML — event descriptions go through DOMPurify before storage").

**Resolution.** `isomorphic-dompurify@3.22.0` already declares `dompurify: ^3.4.12`, so no upstream
bump was needed — a `pnpm.overrides` entry pins the floor at `^3.4.14`.

**Validation.** `pnpm audit --prod` no longer reports it; `sanitize.test.ts` (11 tests) still passes.

---

## Medium severity

### M1 — Forwarded headers set session and audit-log IP addresses unconditionally

**Status: `FIXED`**

**Location:** `apps/api/src/routes/auth.routes.ts` — `getIpAddress()`

`getIpAddress()` read `X-Forwarded-For` / `X-Real-IP` with no proxy check at all, unlike the rate
limiter beside it. The value reaches `sessions.ip_address` and `audit_logs.ip_address`, so any
caller could stamp an arbitrary address onto their own login and onto another user's audit trail —
and the session list a user sees in settings would show an address the attacker chose. Now
delegates to the shared `getClientIp()` resolver, so headers are honoured only behind a configured
proxy.

### M2 — ICS export allowed iCalendar property injection through a bare carriage return

**Status: `FIXED`**

**Location:** `apps/api/src/services/event.service.ts` — `escapeIcsText()`

RFC 5545 requires `\`, `;`, `,` and line breaks to be escaped. The implementation escaped `\n` but
not a bare `\r`, which every iCalendar parser also treats as a line break. Zod's `.trim()` only
strips surrounding whitespace, so `"Standup\rSUMMARY:Injected"` passed validation and split the
`SUMMARY` property in the exported file, letting a crafted title inject arbitrary iCalendar
properties into a file other calendar applications then import.

Verified against the running API before and after: the export now yields exactly one `SUMMARY` line,
with the CR escaped as `\n`.

### M3 — `PATCH /auth/me` with an empty body returned 500

**Status: `FIXED`**

**Location:** `apps/api/src/services/auth.service.ts` — `updateProfile()`

Every field on `updateProfileSchema` is optional, so `{}` is valid input. It reached
`db.update(users).set({})`, which Drizzle renders as `update "users" set where ...` — a syntax
error surfacing as `INTERNAL_ERROR`. Unlike the event, task and category updaters, this one had no
always-present `updatedAt` to save it. A no-op patch is now treated as a read, and `updatedAt` is
set on real ones.

Verified live: `PATCH /auth/me {}` → `200`.

### M4 — Task listing discarded the requested sort order

**Status: `FIXED`**

**Location:** `apps/api/src/services/task.service.ts` — `listTasks()`

Recurring parents and one-off tasks were fetched by two separate queries with identical filters and
then concatenated. Each half was sorted, but the concatenation was not: every recurring task landed
after every non-recurring one regardless of `sort`. A user sorting by due date saw a recurring task
due today below a one-off due next month. Collapsed to a single query — the two predicates
partitioned the same set, so there was nothing to separate.

### M5 — Series splits orphaned exclusions and per-instance overrides

**Status: `FIXED`**

**Location:** `apps/api/src/services/event.service.ts` — `updateFollowing()`

"This and following" terminates the original series with `UNTIL` and creates a new one, but left
both `exDates` and `event_exceptions` rows attached to the terminated parent. The expander only
matches overrides against a series that still generates the occurrence, so everything the user had
already done to the tail of the series silently reverted:

- a deleted occurrence after the split **reappeared** under the new series;
- an edited occurrence after the split **lost its edits** and rendered with series defaults.

The transaction now partitions `exDates` at the split date and re-points overrides at or after it
onto the new series.

### M6 — Unbounded query ranges, reorder payloads and task listings

**Status: `FIXED`**

**Location:** `packages/shared/src/schemas/`, `apps/api/src/services/task.service.ts`

Recurrence is expanded per request rather than materialised, so a listing's cost is proportional to
the span asked for. `listEventsQuerySchema` bounded only ordering, so
`?start=1970-01-01&end=2200-01-01` asked the server to expand every daily series across 230 years
before the 1000-instance cap could discard the result. Separately, `reorderTasksSchema` had a
minimum but no maximum, and reordering issues one `UPDATE` per id inside a single transaction — an
authenticated caller could hold a write transaction open for as many round trips as they cared to
send. `listTasks` had no `LIMIT` at all.

Added `MAX_QUERY_RANGE_DAYS = 400` (covering a year view with padding), `MAX_REORDER_IDS = 500`, and
a 1000-row listing cap. Verified live: the 230-year range returns `400`, a one-month range `200`, a
600-id reorder `400`.

### M7 — All-day events accepted an inverted time range

**Status: `FIXED`**

**Location:** `packages/shared/src/schemas/event.schema.ts`

Both the create and update refinements returned `true` unconditionally for `isAllDay`, exempting
all-day events from the start/end check entirely rather than relaxing it. `endAt < startAt` was
therefore accepted, producing a negative duration that breaks the overlap predicate in `listEvents`
and makes `expandSingleSeries` clamp every instance to zero length. All-day events now require
`startAt <= endAt` — equality is legitimate, since they are stored midnight-to-midnight — while
timed events still require a strictly positive range.

### M8 — BullMQ could not connect to a TLS or ACL-protected Redis

**Status: `FIXED`**

**Location:** `apps/api/src/lib/queue.ts` — `parseRedisConnection()`

The rest of the API hands `REDIS_URL` to ioredis verbatim, which understands `rediss://` and ACL
usernames. BullMQ needs a decomposed connection object, and the decomposition dropped both: no
`tls`, no `username`. Every managed Redis (Upstash, ElastiCache with in-transit encryption, Redis
Cloud) issues a `rediss://` URL, and Redis 6 ACLs put a username before the password. The failure
mode is quiet and asymmetric — rate limiting and health checks work, while reminders simply never
fire. Both are now preserved, and percent-encoded credentials are decoded.

### M9 — Cleanup job materialised every deleted row id, in one unbounded statement each

**Status: `FIXED`**

**Location:** `apps/api/src/jobs/cleanup.job.ts`

Each cleanup used `.returning({ id })` purely to count rows, pulling every deleted id into the
worker — for audit logs, that is 90 days of every action by every user in one array. Each was also a
single unqualified `DELETE`, holding row locks on everything it touched until commit. Rewritten as a
shared `deleteInBatches` helper: 5,000 rows per statement, only the current batch's keys in memory,
with a batch ceiling as a runaway guard.

### M10 — Reminder re-enqueue loaded every pending reminder at boot

**Status: `FIXED`**

**Location:** `apps/api/src/services/reminder.service.ts` — `reEnqueueMissedReminders()`

Runs on every start, across every user, with no limit — so an instance restarting into a large
backlog materialised the whole set before enqueuing anything. Now paged by `(triggerAt, id)` in
batches of 500.

### M11 — No cap on reminders per item or push subscriptions per user

**Status: `FIXED`**

**Location:** `apps/api/src/services/reminder.service.ts`, `push-subscription.service.ts`

Each reminder is a durable row plus a delayed BullMQ job, and each push subscription is fanned out
over on every notification. Neither was bounded, so one authenticated caller could schedule
unbounded background work against a single event, and a user who repeatedly cleared site data
accumulated dead endpoints forever. Capped at 10 reminders per item (rejected with `422`) and 20
subscriptions per user (oldest evicted — the browser in front of the user just registered).

Verified live: the 11th reminder on one task returns `422`.

### M12 — Uniqueness enforced only in application code

**Status: `FIXED`**

**Location:** `apps/api/src/db/schema.ts`, `category.service.ts`, `push-subscription.service.ts`

Category names (per user) and push endpoints (per user) were checked with a read-then-insert, which
two concurrent requests can both pass. Added `idx_categories_user_name` and
`idx_push_subs_user_endpoint`, plus `idx_push_subs_user` — `user_push_subscriptions` had **no index
at all**, so every push notification sequentially scanned the whole table. The pre-checks remain as
the friendly path; the constraint violation is now translated into the same `409` instead of
surfacing as a `500`. Migration `0002` de-duplicates existing rows before creating each index, so it
is safe on a populated database.

### M13 — Postgres pool was never drained, and startup failures were silent

**Status: `FIXED`**

**Location:** `apps/api/src/index.ts`, `apps/api/src/db/index.ts`

`shutdown()` closed the HTTP server, SSE connections, BullMQ and Redis but never the Postgres pool,
so up to `DB_POOL_MAX` sockets stayed open through shutdown and an orchestrator waiting for a clean
exit had to fall back to `SIGKILL`. `shutdown()` was also not re-entrant — orchestrators routinely
send `SIGTERM` then `SIGINT`, and a second pass raced the forced-exit timer. `start()` was invoked
with no `.catch`, and there were no `unhandledRejection` / `uncaughtException` handlers, so a
startup failure or a stray rejection produced Node's bare default output rather than a structured
log. All four are addressed.

### M14 — SSE connections leaked and buffered without bound

**Status: `FIXED`**

**Location:** `apps/api/src/services/sse.service.ts`, `routes/stream.routes.ts`

The stream released its registry slot only from the request abort signal. A consumer that releases
its reader, or a runtime that tears the stream down directly, reaches `cancel()` instead — leaving
the connection registered forever, counting against the per-user cap and taking a write on every
30-second heartbeat. Separately, `controller.enqueue` never rejects on a slow consumer; it buffers,
bounded only by memory, so a client that stops reading (a suspended laptop, a stalled proxy)
accumulated every event the account generated. Added a `cancel()` handler and a 1MB backlog ceiling
checked via `desiredSize`, past which the connection is closed and the client reconnects and
refetches. The heartbeat interval is now `unref`'d so it cannot hold the process open.

### M15 — Database query logging included bound parameters

**Status: `FIXED`**

**Location:** `apps/api/src/db/index.ts`

The development Drizzle logger emitted `{ query, params }` at `debug`. Those parameters carry
password hashes, reset-token hashes and session ids. Stated requirement #5 is "No secrets in code —
never log secrets", and development logs are the ones most likely to be pasted into an issue. Now
logs `paramCount` instead, which is enough to correlate a statement with a call site.

### M16 — Bundle analysis report shipped in the production build

**Status: `FIXED`**

**Location:** `apps/web/vite.config.ts`

`rollup-plugin-visualizer` wrote `dist/bundle-stats.html` on every build, including production. Vite
copies `dist` verbatim to the host, so a browsable map of the entire source tree — every module
path, every chunk — was served publicly. Now gated behind `ANALYZE=1`.

### M17 — The documented API base path was not served

**Status: `FIXED`**

**Location:** `apps/api/src/app.ts`

`SPECS.md` §API declares the base URL as `/api/v1`. `apps/web/.env.example`,
`docker/.env.example`'s OAuth redirect URIs, the README's variable table and
`deploy-production.yml`'s health check all follow it. The API mounted routes at `/v1` and at the
root — never at `/api/v1`. Consequences:

- a developer following the documented setup (`cp apps/web/.env.example apps/web/.env`, which
  `CLAUDE.md` prescribes) got an app where every request 404'd and the client bounced straight back
  to `/login`;
- the documented OAuth redirect URIs could not resolve at all, so OAuth could not be configured as
  written.

The workaround was known and recorded in `design/SCREEN-INVENTORY.md` but never fixed. The router is
now assembled once and mounted at all three base paths, so the documented path works without
breaking existing clients. Verified live: `/health`, `/v1/health` and `/api/v1/health` all return
`200`; `/api/v1/auth/me` returns `401` rather than `404`.

---

## Low severity

### L1 — A lapsed lockout re-locked on the next single wrong password

**Status: `FIXED`**

**Location:** `apps/api/src/services/auth.service.ts` — `login()`

`failedLogins` was reset only on a _successful_ login. After a 30-minute lockout expired the counter
was still at the threshold, so the next failed attempt computed `5 + 1 >= 5` and locked the account
for another 30 minutes — and sent another lockout email. A user who forgot their password once
effectively never got their five attempts back. The counter now resets when the lockout lapses.

### L2 — Recurrence expansion stretched every instance by a sub-second remainder

**Status: `FIXED`**

**Location:** `apps/api/src/services/recurrence.service.ts` — `expandSingleSeries()`

`instanceDate` is millisecond-truncated to match how exception dates are keyed, but the instance end
was derived from the _untruncated_ occurrence, so each instance ran up to 999ms longer than the
parent. Truncation now happens before the end is derived.

### L3 — Readiness probe leaked a timer per call

**Status: `FIXED`**

**Location:** `apps/api/src/routes/health.routes.ts` — `withTimeout()`

The timeout promise was raced but never cleared, so every readiness probe left a 1-second timer
pending. Orchestrators poll readiness continuously, so this kept the event loop busy indefinitely
and delayed clean process exit by the same margin. Now cleared in a `finally`.

### L4 — Expired push subscriptions were deleted one round trip at a time

**Status: `FIXED`**

**Location:** `apps/api/src/services/push-subscription.service.ts` — `sendPushToUser()`

Collapsed into a single `inArray` delete, with the failure logged rather than swallowed by a bare
`.catch(() => {})`.

### L5 — Task due-date filter accepted an inverted range

**Status: `FIXED`**

**Location:** `packages/shared/src/schemas/task.schema.ts`

`dueStart` and `dueEnd` were validated independently, so `dueStart > dueEnd` was accepted and
returned an empty list rather than an error. Now refined like the event range.

### L6 — Stylelint was configured but never ran

**Status: `FIXED`**

**Location:** `package.json`, `.stylelintrc.json`, `.github/workflows/ci.yml`

`stylelint` and `stylelint-config-standard` were installed and `.stylelintrc.json` was committed,
but no script or CI job invoked either. The rules had never been enforced. Added a `lint:css` script
and a CI job; the existing CSS passes.

### L7 — Coverage was configured but could not run

**Status: `FIXED`**

**Location:** `apps/api/vitest.config.ts`, `package.json`

`apps/api/vitest.config.ts` declared a `coverage` block, but `@vitest/coverage-v8` was not installed
in any package, so `vitest run --coverage` could only fail — and no script or CI job invoked it. See
[Testing](#testing) for what was added.

### L8 — Web image built with an unpinned pnpm

**Status: `FIXED`**

**Location:** `apps/web/Dockerfile`

`corepack prepare pnpm@latest` while the repository pins `packageManager: pnpm@9.15.0`. The build
was not reproducible, and a future pnpm major could reject the committed lockfile under
`--frozen-lockfile`. Pinned to `9.15.0`, matching the API image.

### L9 — No dependency-vulnerability gate

**Status: `FIXED`**

**Location:** `.github/workflows/ci.yml`

Nothing audited dependencies. Baseline was 20 high / 6 moderate / 1 low across the tree, 4 high /
2 moderate / 1 low reachable from production. `pnpm.overrides` now pin patched versions for
`dompurify`, `bn.js`, `fast-uri`, `nanoid`, `minimatch`, `brace-expansion`, `flatted`, `js-yaml` and
`rollup`, and a **Security Audit** CI job gates on high-severity advisories in the production tree
while reporting dev-only findings without blocking.

### L10 — Dead `.gitignore` rule would have excluded the migration journal

**Status: `FIXED`**

**Location:** `.gitignore`

`drizzle/meta/` contains a slash, so it anchored to the repository root and never matched
`apps/api/drizzle/meta/` — the files were tracked by luck of placement. Had the migration directory
ever moved, the journal and snapshots would have been silently excluded, and without them the chain
can be neither extended nor applied. Replaced with a note recording why the directory must stay
tracked.

---

## Validated — no change required

### V1 — OAuth email verification is checked before account linking

**Status: `VALIDATED — NO CHANGE REQUIRED`**

`handleOAuthCallback` links an OAuth identity to an existing account by matching email, which is an
account-takeover vector if the provider's email is unverified. Both callbacks already guard it:
Google is gated on `email_verified`, and GitHub selects only from `verified` addresses in
`/user/emails`. No unverified address can reach the linking path.

### V2 — Password reset token handling is atomic and correctly hashed

**Status: `VALIDATED — NO CHANGE REQUIRED`**

Tokens are 256-bit random, stored SHA-256 hashed, and consumed by a single conditional `UPDATE ...
WHERE used_at IS NULL AND expires_at >= now() RETURNING`, so a concurrent double-redeem cannot
succeed twice. All sessions are invalidated after a reset. `forgotPassword` returns the same
response whether or not the address exists.

### V3 — Ownership is enforced on every user-data query

**Status: `VALIDATED — NO CHANGE REQUIRED`**

Every service method reading or writing user data includes `userId` in its `WHERE` clause, sourced
from the session rather than the request body, and soft-deleted rows are filtered. `authorization.routes.test.ts`
covers the IDOR surface, and the E2E suite exercises cross-user access with two independent
accounts. No unscoped query was found.

### V4 — Search is parameterised and matches its GIN index

**Status: `VALIDATED — NO CHANGE REQUIRED`**

`search.service.ts` is the only raw SQL in the codebase. The user's query never reaches the SQL text:
it is tokenised, stripped to word characters and passed as a bound parameter to `to_tsquery`. The
`WHERE` expression is character-identical to the `idx_events_search` / `idx_tasks_search` index
expressions, so both queries use the index rather than falling back to a sequential scan.

### V5 — Reminder delivery is idempotent

**Status: `VALIDATED — NO CHANGE REQUIRED`**

`processReminderJob` re-reads the reminder with `sentAt IS NULL` before doing anything, so a BullMQ
retry after a partial failure cannot double-send. Deleted parents mark the reminder sent so it is not
retried; a task whose due date was cleared deliberately leaves it pending so restoring the date can
resynchronise it.

### V6 — Rate limiting degrades open rather than closed when Redis is down

**Status: `VALIDATED — NO CHANGE REQUIRED`**

A Redis failure logs and allows the request. Failing closed would turn a cache outage into a total
API outage, which is the worse trade for this application. Covered by a test so the behaviour is
deliberate rather than incidental.

---

## Not applicable

### N1 — Session token in the SSE query string

**Status: `NOT APPLICABLE`**

`/stream` accepts `?token=<sessionId>` as a fallback. Putting a session token in a URL is normally a
finding — URLs reach access logs and referrers. Here it is a documented, deliberate trade-off
(`CLAUDE.md` §Gotchas 7): `EventSource` cannot set headers, and some browsers drop cookies on
reconnect, so the alternative is a real-time feature that silently stops working. The request logger
records `c.req.path`, not the query string, so the token does not reach the application's own logs.
Changing it would require a separate short-lived stream token — a design change beyond an audit's
remit, and recorded here rather than actioned.

### N2 — CSP `style-src 'unsafe-inline'`

**Status: `NOT APPLICABLE`**

Flagged by inspection and already carrying a `TODO` in
`security-headers.middleware.ts`. Removing it requires nonce-based CSP coordinated with Tailwind's
runtime style injection — a frontend architecture change, not an audit fix. The header applies to
API responses, which are JSON, so the practical exposure is nil.

---

## Blocked

### B1 — Recurring events fire only one reminder, for the first occurrence

**Status: `BLOCKED — requires a product decision on recurring-reminder semantics`**

**Location:** `apps/api/src/services/reminder.service.ts`, `jobs/reminder.job.ts`

A reminder stores a single absolute `triggerAt`, computed from the parent's `startAt`. For a
recurring event the parent's `startAt` is the _first_ occurrence, so exactly one reminder ever
fires and every later occurrence passes silently. `SPECS.md` §6.7 defines `triggerAt` as
`item start/due - minutesBefore` without addressing recurrence.

This is a genuine functional gap, not a defect in the existing code: closing it means either
materialising a reminder per occurrence (bounded how far ahead? re-armed by what?) or introducing a
rolling scheduler that re-arms after each fire. Both are design decisions with data-model
consequences, and picking one unilaterally is outside what an audit should change. Recorded here for
the owner to decide.

### B2 — Frontend component and route coverage is thin

**Status: `BLOCKED — closing it is a test-writing project, not an audit fix`**

**Location:** `apps/web/src/components/`, `apps/web/src/routes/`, `apps/web/src/hooks/`

Measured over the whole web application, unit-test line coverage is roughly 6%. The calendar grids,
drawers, dnd interactions, routes and TanStack Query hooks have no component tests; they are covered
only by the Playwright suite, which exercises them through the browser but cannot pin component-level
behaviour.

This audit raised the tested surface materially — the API client went from 16% to 100% line coverage,
and the query-key factory from 0% — and put a threshold gate around the modules the unit suite owns
so the covered surface cannot regress. Bringing the untested components up to a comparable standard
is a substantial piece of work in its own right, deliberately not attempted here, and flagged for
planning rather than silently absorbed into the coverage configuration.

---

## Testing

Unit and integration tests grew from **640 to 740**.

| Package          | Before | After | Coverage (statements / branches / functions / lines) |
| ---------------- | ------ | ----- | ---------------------------------------------------- |
| `@calley/api`    | 364    | 410   | 72.8 / 63.6 / 69.8 / 73.9                            |
| `@calley/web`    | 147    | 177   | 77.1 / 75.1 / 76.6 / 76.7                            |
| `@calley/shared` | 129    | 153   | 97.7 / 100 / 87.5 / 97.6                             |

New tests were written where the audit found code implementing a stated requirement with nothing
verifying it:

- **Middleware (24 tests, previously zero).** CSRF double-submit, body limits, security headers,
  request timeouts, input validation and error rendering had no unit tests at all. The suite pins,
  among others, that a malformed `Content-Length` is rejected rather than silently skipping the size
  check (`parseInt` returns `NaN`, and every comparison against `NaN` is false), that the presence of
  a session cookie forces CSRF validation, and that an unexpected error's message never reaches the
  client.
- **Rate limiting (9 tests).** Directly covers H2: two clients must not share a bucket, and a forged
  `X-Forwarded-For` must not move a caller between buckets.
- **Web API client (21 tests, previously 16% covered).** The 401 disambiguation — session-expired
  redirect versus inline credential rejection — was the subject of a recent bug fix and had no tests.
- **Regression tests for each behavioural fix:** login timing parity, lockout counter reset,
  single-query task ordering, the reminder cap, query-range bounds, all-day ordering, reorder caps.
- **Client-IP resolution, CSRF token helpers, query-key factory, shared constants.**

Coverage `include` globs are scoped to the layers each suite actually owns. Process bootstrap
(`index.ts`), driver construction (`db`, `redis`, `lucia`, `oauth`, `logger`) and schema/seed/email
templates are exercised end to end by Playwright, not by unit tests; counting them would produce a
global figure that says nothing about how well the logic is tested. Thresholds sit just under
today's numbers so they catch regression without pinning an exact figure every unrelated change has
to chase. The unmeasured frontend surface is recorded as B2 rather than hidden by the scoping.

## CI

Four new jobs, each for a gate the repository was set up for but never ran:

| Job                | Gates on                                                                             |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Stylelint**      | `pnpm lint:css` — config and dependencies existed, nothing invoked them              |
| **Security Audit** | `pnpm audit --prod --audit-level high`; full audit reported non-blocking             |
| **Coverage**       | `pnpm test:coverage` with per-package thresholds; reports uploaded as artefacts      |
| **Migrations**     | applies the chain to an empty database, then fails on any residual `schema.ts` drift |

The E2E job now applies migrations (`db:migrate`) instead of `db:push`, so the path CI exercises is
the path a deployment takes.

## Performance and load

- **Query cost bounded at the edge.** M6 removed the two unbounded inputs that drove server work:
  the event range (which sets how much recurrence expansion happens) and the reorder payload (which
  sets how many statements one transaction issues).
- **Indexes added where scans were happening.** `user_push_subscriptions` had no index at all, so
  every push notification sequentially scanned the table (M12).
- **Batch deletion.** Retention cleanup no longer takes row locks across months of data in one
  statement, nor materialises every deleted id (M9).
- **Boot cost bounded.** Reminder re-enqueue is paged (M10).
- **Backpressure.** SSE connections that stop draining are dropped rather than buffering without
  bound (M14).
- **Bundle.** The 819 kB `PasswordStrengthMeter` chunk (zxcvbn) is already lazily loaded and reaches
  only the signup and reset-password routes; the 690 kB main chunk is above Vite's default warning
  threshold. Neither is a defect, and both are left alone — restructuring chunking is a frontend
  performance project, not an audit fix. The bundle report itself is no longer shipped (M16).

A dedicated load-testing harness was **not** added. The application's throughput characteristics are
dominated by two things this audit already addressed structurally — Argon2 cost on the auth path and
recurrence expansion cost on the listing path — and a synthetic harness measuring them against a
sandbox Postgres would produce numbers that say more about the sandbox than about production.
Bounding the inputs is the durable fix. This is a deliberate scoping decision, recorded rather than
silently skipped.

## Environment limitations

- **PostgreSQL 16 and Redis 7 were available in the sandbox**, so migrations, the API and the
  Playwright suite all ran against real services. No mock-only validation was relied upon for the
  claims above.
- **Deployment workflows (Vercel, Railway) could not be exercised** — they require credentials that
  do not exist here. The migration ordering issue they contain is recorded below.
- **Cross-browser E2E (Firefox, WebKit, mobile viewports) was not run.** Only Chromium is
  pre-installed; the Playwright config already restricts CI to Chromium for the same reason.

## Deployment note

`deploy-production.yml` runs database migrations **after** deploying both the API and the frontend,
so newly deployed code briefly runs against the previous schema. The workflow also triggers on
`push: main` independently of CI, so a deploy can begin while checks are still running. Both are
ordering concerns in a workflow this audit cannot execute or verify; they are recorded here rather
than changed blind, since altering production deployment ordering without being able to test it
would be riskier than the issue itself.
