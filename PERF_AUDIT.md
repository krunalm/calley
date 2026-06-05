# PERF_AUDIT.md — Calley Performance Audit

> Staged, behavior-preserving performance audit. Safety and behavior
> preservation override every performance goal. All work happens on branch
> `claude/perf-audit-IlYt7`.

---

## 1. Detected stack + safety net status

**Monorepo:** pnpm + Turborepo, TypeScript 5, Node 22, ESM throughout.

| Area     | Stack                                                                     |
| -------- | ------------------------------------------------------------------------- |
| Frontend | React 19 + Vite 7 + TanStack Router/Query + Zustand + Tailwind v4 + Radix |
| Backend  | Hono 4 (Node), Drizzle ORM, PostgreSQL 16, Redis/BullMQ, Lucia auth       |
| Shared   | Zod schemas (`@calley/shared`)                                            |

**Other stacks scanned for and NOT present:** Go, Rust/Tauri, .NET, Next.js,
Android/Kotlin, Python, SQL Server, SQLite. (PostgreSQL is present via Drizzle
schema only — no raw `.sql` migration files in-repo; schema is code-defined.)

### Safety net (verified on clean checkout, this branch)

| Check                  | Command                       | Result                                                                |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------- |
| Unit/integration tests | `pnpm test`                   | ✅ **API 337 + Web 147 = 484 tests passing** (+ shared)               |
| Type-check             | `pnpm type-check`             | ✅ pass                                                               |
| Lint                   | `pnpm lint`                   | ✅ pass                                                               |
| E2E (Playwright)       | `pnpm test:e2e`               | ⚠️ not run — requires live web+api+Postgres+Redis (no DB in this env) |
| CI                     | `.github/workflows/ci.yml`    | ✅ present                                                            |
| Benchmark infra        | —                             | ❌ none (no `*.bench.ts`, no BenchmarkDotNet/testing.B equivalent)    |
| Coverage tooling       | vitest v8 coverage configured | present; no enforced threshold                                        |

**Note on tests + infra:** API route/service tests run without a live
PostgreSQL/Redis (DB is mocked; Redis `ECONNREFUSED` logs are tolerated and do
not fail the suite). This means **DB-level changes (indexes, query plans) cannot
be benchmarked in this environment** — any such finding is deferred to "Needs
discussion" rather than auto-executed. Frontend **bundle size IS measurable**
here via `vite build` (gzip sizes reported), which is where the headline finding
lives.

---

## 2. Critical paths and their test coverage

| Critical path                        | Entry                                      | Test coverage                                              |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------------------- |
| Calendar range query (`GET /events`) | `event.service.listEvents`                 | ✅ `event.service.test.ts`, `events.routes.test.ts`        |
| Recurrence expansion                 | `recurrence.service.expandRecurringEvents` | ✅ `recurrence.service.test.ts`                            |
| Task list/panel                      | `task.service.listTasks`                   | ✅ `task.service.test.ts`, `tasks.routes.test.ts`          |
| Full-text search                     | `search.service.search`                    | ✅ `search.service.test.ts`, `search.routes.test.ts`       |
| Auth (login/signup/lockout)          | `auth.service`                             | ✅ `auth.service.test.ts`, `auth.routes.test.ts`           |
| Reminders / queue                    | `reminder.service`, `reminder.job`         | ✅ `reminder.service.test.ts`                              |
| Frontend app shell / initial load    | `main.tsx` → `App` → route tree            | ⚠️ component tests exist; **no bundle/perf budget test**   |
| Password strength meter              | `PasswordStrengthMeter`                    | ✅ `auth-forms.test.tsx` (mocked `zxcvbn`, uses `waitFor`) |

---

## 3. Findings table

| #   | Finding                                                                                                                                                                                                                     | File:Line                                                                            | Impact                                              | Effort | Class    | Priority | Auto?                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- | ------ | -------- | -------- | ----------------------------- |
| F1  | `zxcvbn` (~all of its ~400KB min / ~140KB gzip dictionaries) statically imported into the **main entry chunk**, loaded by every user on first paint (incl. login) but only used by the signup/reset-password strength meter | `PasswordStrengthMeter.tsx:2` → `SignupForm.tsx:9,93`, `ResetPasswordForm.tsx:7,106` | **High**                                            | Low    | **SAFE** | **P0**   | **Y**                         |
| F2  | No `manualChunks` vendor split; React/Router/Query/Radix all in one ~490KB-gzip entry chunk                                                                                                                                 | `apps/web/vite.config.ts`                                                            | Low–Med (caching only, total bytes ~unchanged)      | Low    | SAFE-ish | P3       | N (marginal — see §9)         |
| F3  | `listEvents` / `listTasks` issue a 3rd sequential round-trip for exception overrides after the parents query                                                                                                                | `event.service.ts:230`, `task.service.ts`                                            | Low (needs parent IDs first; inherently sequential) | Med    | MODERATE | P4       | N (not worth it)              |
| F4  | Recurrence expansion parses RRULE then rebuilds a second `RRule` per series (`fromString` + `new RRule({...origOptions})`)                                                                                                  | `recurrence.service.ts:181-199`                                                      | Low (micro)                                         | Low    | SAFE     | P5       | N (micro-opt, de-prioritized) |

**Backend N+1 scan:** none found. Services use `Promise.all` + `inArray`
batched queries (`event.service.ts:204`, `task.service.ts:141`,
`search.service.ts:105`, `reminder.job.ts:165`). Search uses the GIN indexes
correctly — the query's `to_tsvector('english', title || ' ' ||
COALESCE(description,''))` expression **exactly matches** the index expression
(`schema.ts:184-187`), so the index is usable.

---

## 4. Per-stack detailed findings

### React + Vite (frontend) — evidence

Baseline `pnpm --filter @calley/web build` (this branch, clean):

```
dist/assets/index-ZnvnrjYe.js          1,667.27 kB │ gzip: 656.91 kB   ← main entry
dist/assets/RecurrenceBuilder-*.js        53.07 kB │ gzip:  15.97 kB   (already lazy ✓)
dist/assets/AgendaView-*.js               22.58 kB │ gzip:   7.35 kB
... (calendar views, drawers, settings routes all already code-split)
```

- **F1 (P0):** `zxcvbn` resolves into `index-ZnvnrjYe.js` (verified:
  `grep -l zxcvbn dist/assets/*.js` → only the main chunk). The auth routes
  (`_auth/login`, `_auth/signup`, `_auth/reset-password`) are **eagerly** in the
  route tree (only the `_app/settings/*` routes are `.lazy`), so the signup
  form — and through it `PasswordStrengthMeter` → `zxcvbn` — is pulled into the
  initial download for **all** visitors, including the far more common login
  path. `zxcvbn` is 3.4 MB on disk; its scoring dictionaries dominate.
  The codebase already uses `React.lazy` for other heavy widgets
  (`RecurrenceBuilder`, `ColorPicker`, `EventDrawer`, `SearchModal`), so this is
  applying an **established in-repo pattern** to a component that was missed.

- Lazy-loading already done well elsewhere: `_app.tsx:21,24`,
  `EventDrawer.tsx:9`, `TaskDrawer.tsx:8`, `CalendarList.tsx:6`,
  `CalendarSettings.tsx:6`. Settings sub-routes use TanStack Router `.lazy`.

### Backend (Hono / Drizzle / Postgres) — evidence

- Range queries are index-aligned: `idx_events_user_date`
  (`userId, startAt, endAt` partial `WHERE deleted_at IS NULL`) matches
  `listEvents` predicates (`event.service.ts:175-214`). Same for
  `idx_tasks_user_due`.
- Recurrence expansion is correctly server-side and capped
  (`MAX_INSTANCES_PER_SERIES = 1000`), windowed by `between(windowStart, end)`.
- No raw-SQL injection surface in search (parameterized `to_tsquery`, token
  sanitization at `search.service.ts:16-26`).

---

## 5. Plan (checklist, grouped by class, ordered by impact-to-effort)

### SAFE — auto-execute

- [x] **F1** ✅ **DONE.** Deferred `zxcvbn` out of the main bundle by
      `React.lazy`-loading `PasswordStrengthMeter` at its two usage sites,
      rendering it only when the password field is non-empty. Component file and
      its unit tests untouched. **Main entry chunk gzip 656.91 KB → 264.22 KB
      (−392.7 KB, −59.8%)**; `zxcvbn` now in a lazily-loaded
      `PasswordStrengthMeter` chunk. All tests green. Commit: see git log.

### MODERATE — auto-execute with guardrails

- _(none promoted; F3 deemed not worth it — see §10)_

### LARGE / REFACTOR — require approval

- _(none)_

---

## 6. Characterization tests to add BEFORE any fix

- **F1:** No new characterization tests required. The behavior is already
  covered: `auth-forms.test.tsx` renders `PasswordStrengthMeter` directly (10
  tests, mocked `zxcvbn`) **and** exercises it through `SignupForm` ("shows
  password strength meter when typing", using `await waitFor`). Because the fix
  does **not** modify `PasswordStrengthMeter.tsx` (only how it is imported), the
  direct tests remain valid, and the `waitFor`-based form test already tolerates
  asynchronous (lazy) mounting. Full suite is the safety net.

---

## 7. Measurement plan

| Finding | Metric                                                                     | How                                                                                                                                          |
| ------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | Main entry chunk size (gzip) + presence of a separate `zxcvbn`/meter chunk | `pnpm --filter @calley/web build`, compare `index-*.js` gzip before/after; confirm `grep -l zxcvbn dist/assets/index-*.js` no longer matches |

Baseline: `index` = **1,667.27 kB / 656.91 kB gzip**.
Acceptance: ≥10% reduction in initial entry-chunk gzip, all tests still green.

---

## 8. Risks register & rollback notes

- **F1 risk:** A user typing a password sees the strength meter appear one
  network/parse tick later (the lazy chunk loads on first keystroke). Visually
  negligible; identical final output. Suspense `fallback={null}` matches the
  component's existing "render nothing when empty" behavior.
- **Rollback:** Each fix is a single self-contained commit; `git revert` of that
  commit fully restores prior behavior.
- **General:** No DB/Redis available here, so no migration or index change is
  auto-executed. E2E not runnable in-env.

---

## 9. Out of scope (drive-by observations — NOT touched)

- **F2 vendor `manualChunks`:** would improve repeat-visit caching by isolating
  rarely-changing vendor code, but does **not** reduce total initial bytes and
  is unlikely to clear the ≥10% single-metric bar; it also risks subtle
  load-order churn. Left for human decision.
- `date-fns` is imported via named imports in 27 places — already tree-shakeable
  under v4 ESM; no change warranted.
- `framer-motion` used in several views via a `lib/motion.ts` abstraction;
  potential to lazy-load animations, but entangled with view rendering — not a
  clean, high-confidence win.

## 10. Needs discussion → resolved (not worth it / not actionable)

- **F2** (vendor `manualChunks`): **attempted and reverted.** A surgical split
  (react / tanstack / radix into named chunks, leaving lazy-only deps like
  `zxcvbn` on default chunking so F1 is preserved) was implemented and measured.
  Result: eager first-load JS went from **264.22 kB gzip → 273.72 kB gzip
  (+9.5 kB, +3.6%)** — chunk-boundary overhead makes initial load slightly
  _worse_. The only upside is repeat-visit caching of stable vendor code, which
  cannot be benchmarked in this environment. Per the loop rule "revert if gain
  <10% / within noise", reverted. Recommend revisiting only with a real
  caching/Lighthouse measurement on a deployed build.
- **F3** (exception-overrides extra round-trip): **not actionable.** The query
  depends on the parent IDs produced by the prior query, so it is inherently
  sequential and already optimal — there is no behavior-preserving rewrite that
  removes the round-trip. No change made.
- **F4** (double `RRule` construction in expansion): **skipped.** The only
  rewrite (`RRule.parseString` instead of `fromString` + rebuild) changes how
  `origOptions` are derived inside rrule.js — a subtle behavior-preservation
  risk on a micro-optimization whose gain is within noise. De-prioritized per
  "don't risk behavior for noise"; confidence < 90%.

## 11. Awaiting approval (LARGE refactors)

- _(none)_

---

## 12. Execution log

- [x] **F1** — complete. `React.lazy` the password strength meter in
      `SignupForm.tsx` + `ResetPasswordForm.tsx`.
  - Baseline: main entry `index-*.js` = 1,667.27 kB / **656.91 kB gzip**.
  - After: main entry `index-*.js` = 847.54 kB / **264.22 kB gzip**; new lazy
    `PasswordStrengthMeter-*.js` = 819.78 kB / 392.69 kB gzip (loads only on a
    password keystroke at signup/reset).
  - **Initial JS payload reduced by 392.7 kB gzip (−59.8%)** for every visitor,
    including the login path. Verified `zxcvbn` no longer present in the main
    chunk. Full web suite: 147/147 passing; type-check + lint green.
- [x] **F2** — attempted, **reverted** (initial load +3.6%; see §10).
- [—] **F3** — not actionable (inherently sequential; see §10).
- [—] **F4** — skipped (micro-opt, behavior risk; see §10).

**Net result:** one change shipped (F1), one tried-and-reverted (F2), two
correctly left alone (F3, F4). Initial JS payload cut by ~59.8% with zero
behavior change and the full test suite (613 tests) green.
