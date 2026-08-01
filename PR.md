# Frontend polish pass — `apps/web`

A refinement pass on the shipping Calley web app. No redesign, no rewrite, no new packages. Nine batches, nine commits, on `claude/perform-this-th7lhd`.

Companion documents: `FRONTEND-AUDIT.md` (findings and design plan), `FRONTEND-POLISH-TASKS.md` (execution plan with resume anchor).

---

## The headline

Ten components referenced `var(--surface)`. Nothing declared it — the theme names the token `--color-surface`. So the topbar, the sidebar, the sticky hour gutter, the `kbd` chips, the drag ghosts and the skip link were all painting with an empty value, and `EventBlock`'s `color-mix(in srgb, ${color} 20%, var(--surface))` was silently invalid, which dropped the background off **every timed event block** in week and day view. One three-line alias in the theme fixed all ten sites.

The second headline is contrast. Measured against the real backgrounds, six token pairs failed WCAG AA — including the 122-usage secondary text colour (4.26 : 1), every primary button label (4.47 : 1), and the offline banner's white-on-amber at **2.38 : 1**. All six were fixed by moving tokens along their existing hue; nothing was re-branded.

The third is focus. Thirteen component files render `<button>` with no focus style of their own — every date cell, task row, event pill, view tab and colour swatch. One zero-specificity `:focus-visible` rule in the global stylesheet covers all thirteen without touching any of them.

## What changed, by route

**`/login`, `/signup`, `/forgot-password`, `/reset-password`**
The wordmark used `font-[var(--font-display)]`, which Tailwind v4 treats as ambiguous between family and weight and which resolves to a quoted, comma-separated value — so the login wordmark and the topbar wordmark were rendering in different faces. Both now use the `font-display` utility. Every field gained `aria-invalid` and `aria-describedby` pointing at its message; errors gained a left rule so they read as errors without depending on seeing red. Inputs gained a visible border (the old one was 1.29 : 1). The two success panels jumped from `h1` straight to `h3`.

**`/calendar`**
Topbar and sidebar have backgrounds again. Every figure in the grid — month-cell dates, hour labels, mini-calendar days, overflow counts, group counts — moved to the numeric role (DM Mono, already loaded and previously unused, plus `tabular-nums`), so columns of numbers stop shifting width between `1` and `11`. Event blocks got their tint back and lost an invisible white hairline. The drop-target and selection tints moved onto tokens instead of being invented per component. Toolbar buttons reach 44 px on touch pointers and stay compact on precise ones.

**The now-line** — the signature. It was a `bg-red-500` dot and bar: the only raw Tailwind palette colour in the app, unlabeled, off-key against a warm terracotta system. It is now an accent rule anchored by a live `h:mm a` chip set in the numeric face, sitting in the hour gutter where the rest of the day's figures already live. The chip is formatted from the same `Date` the line's position is computed from, so it can never label the wrong line.

**`/settings/*`**
Third and last `font-[var(--font-display)]` instance fixed. Headings dropped Title Case; "Danger Zone" became "Delete account", which is what the section does. Section descriptions say something specific instead of restating the heading. The current nav item is marked with `aria-current`, not just a background colour. Session rows truncate unusual browser strings with a `title` instead of shoving the Revoke button off the row.

**Overlays, everywhere**
Dialog and sheet scrims dropped from 80 % pure black to a 55 % ink scrim — the old value blacked out a warm-paper app and disagreed with the sidebar's own `black/20` backdrop. The sheet animated open over 500 ms; it is now inside the 120–200 ms budget. Both close buttons moved off `focus:` (which fires on mouse click) onto the global `focus-visible` outline.

**Copy**
Errors say what happened and what to do. Empty states stopped calling every event the user's "first" one. Destructive buttons name their target — "Delete calendar", "Delete 3 tasks", not "Delete".

## Constraints — confirmed clean

| Constraint                        | Status                                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No dependency or lockfile changes | **Clean.** `git diff --stat c3b250a HEAD -- package.json pnpm-lock.yaml apps/*/package.json packages/*/package.json` → empty.                                                                                                           |
| No library or component swaps     | Clean. Radix/shadcn/Tailwind v4/framer-motion all as-installed; only variants, props and theme hooks used.                                                                                                                              |
| No public API changes             | Clean. The only added exports in the whole diff are `DURATION_FAST` and `DURATION_BASE` in `lib/motion.ts`. No component prop, name, export or route changed — verified by grepping the diff for `export` and `interface *Props` lines. |
| No logic changes                  | Clean. No data fetching, auth, validation or business logic touched. `getCurrentTimePosition` changed signature (it now takes the `Date` its caller already holds) but computes the same value.                                         |
| No content or feature deletion    | Clean. Nothing was removed to tidy a screen.                                                                                                                                                                                            |
| No wholesale rewrites             | Clean. Largest source change is `globals.css` (99 → 250 lines, all additive except six token values). No component file changed by more than ~15 lines.                                                                                 |
| No slop                           | Clean. No gradients, no glassmorphism, no emoji, no blur, no animation added for its own sake. One element — the now-line — got boldness.                                                                                               |

## Baseline vs. now

| Check                | Baseline         | After            |
| -------------------- | ---------------- | ---------------- |
| `pnpm build`         | PASS             | PASS             |
| `pnpm type-check`    | PASS             | PASS             |
| `pnpm lint`          | PASS, 0 warnings | PASS, 0 warnings |
| `pnpm test` (web)    | 147/147          | 147/147          |
| `pnpm test` (api)    | 337/337          | 337/337          |
| `pnpm test` (shared) | 129/129          | 129/129          |
| `stylelint`          | clean            | clean            |

Six component tests asserted the old copy verbatim (`'No events'`, `'Something went wrong'`, `'Try again'`). They were updated to the new strings. No assertion was weakened or removed, and no test was skipped.

## Usability checklist, walked per route

Read from source, not from a browser — see residual 1.

| Bar                                                                 | `/login` etc. | `/calendar`                                                                         | `/settings/*`          |
| ------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- | ---------------------- |
| Visible `:focus-visible`, 2 px + offset, never bare `outline: none` | pass          | pass — this is the batch-3 fix                                                      | pass                   |
| Contrast ≥ 4.5 : 1 body, 3 : 1 large/icons/borders                  | pass          | pass                                                                                | pass                   |
| Touch targets ≥ 44 px                                               | pass          | pass, **except mini-calendar width** (residual 2)                                   | pass                   |
| Persistent label, help text, non-colour inline error                | pass          | n/a                                                                                 | pass                   |
| Async action disables re-submit + gives feedback                    | pass          | **gap** (below)                                                                     | pass                   |
| Loading / empty / error state per list                              | pass          | pass                                                                                | pass                   |
| Destructive: distinct colour, confirmation, button names the action | pass          | pass                                                                                | pass                   |
| Keyboard: tab order, Esc closes, focus returns to trigger           | pass          | pass                                                                                | pass                   |
| One primary action per view, secondaries subordinate                | pass          | pass                                                                                | pass                   |
| Consistent vocabulary between action and confirmation               | pass          | pass — "Delete calendar" → "Calendar deleted", "Delete 3 tasks" → "3 tasks deleted" | pass                   |
| Long values truncate with a title                                   | pass          | pass                                                                                | pass — fixed this pass |
| `prefers-reduced-motion` respected                                  | pass          | pass                                                                                | pass                   |
| Motion 120–200 ms, ease-out, colour and transform only              | pass          | pass — fixed this pass                                                              | pass                   |

**The one gap I did not close:** the bulk-delete confirm in `TaskPanel` and the delete-calendar confirm in `CalendarList` fire their mutation on click with no pending state, so a double-click sends two deletes. The mutations expose `isPending` and the fix is a two-line `disabled={...isPending}` on each — but wiring a mutation's state into a button is behaviour, not styling, and it sits the wrong side of the "no logic changes" line for this pass. Flagged rather than done. Every other async action in the app (all auth submits, profile save, account delete, session revoke, OAuth unlink) already disables correctly.

## Residual issues

1. **No screenshots, no visual verification.** Chromium and Playwright are present, but the app cannot boot here: the route guards call `/auth/me` and the API needs PostgreSQL + Redis, and Docker is unavailable in this container. Every finding came from source reading and computed contrast ratios. **The touch-target and density changes in particular deserve a human eye** before merge — those are the changes most likely to look wrong even when the reasoning is right.
2. **Mini-calendar day cells are 44 px tall but only ~30 px wide on touch.** Seven 44 px columns would overflow the 240 px sidebar. The cells are adjacent with no gaps, so the effective target is 30 × 44, which is an improvement but not the full 44 × 44.
3. **The calendar route has no `h1`.** Its only page-level heading is the `DateNavigator`'s `h2`. Promoting it would give the settings pages two `h1`s, since the topbar renders there too. Wants a structural decision, not a polish edit.
4. **The now-line's vertical position uses browser-local time while the hour gutter labels use the user's stored timezone.** Pre-existing; they disagree whenever the two differ. Not touched — fixing it is a logic change. The new chip is formatted from the line's own basis specifically so the polish pass doesn't add a third, contradictory reading.
5. **`PasswordStrengthMeter` is an 819 kB chunk** (`zxcvbn` dictionaries). Already lazy-loaded, but it dominates the bundle. A build concern, not a styling one.
6. **The base palette is still the AI-default cream + serif + terracotta.** Called out in `FRONTEND-AUDIT.md` §4. Re-hueing a shipping brand is a redesign, so this pass moved the personality onto the calendar's own vocabulary — dates, hours, and now — instead. Worth a deliberate decision separately.

## Deferred, with reasons

| Item                                                | Reason                                                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dark mode                                           | No `dark:` variants or theme toggle exist. A feature, not polish.                                                                                                                                                  |
| Virtualise the ~400-option timezone `<Select>`      | Needs `@tanstack/react-virtual` wired into a Radix Select — a logic change.                                                                                                                                        |
| Profile "Save changes" always visible               | It mounts only when the form is dirty. Rendering it disabled instead changes what the DOM contains.                                                                                                                |
| Split the `zxcvbn` chunk                            | Build/bundling change, out of scope.                                                                                                                                                                               |
| Blur behind modals                                  | Would be slop. Reduced opacity and the ink hue instead.                                                                                                                                                            |
| Labelled instead of icon-only topbar buttons        | Changes rendered content. The `aria-label`s were already correct.                                                                                                                                                  |
| Zero out `transform` under `prefers-reduced-motion` | Would break @dnd-kit dragging and strand the sidebar on screen. Durations and animations only.                                                                                                                     |
| `--space-*` scale, `--radius-full`, `--measure`     | Planned, then dropped. Tailwind v4's spacing base is already 4 px, `rounded-full` already exists, and nothing referenced `--measure`. Tokens that duplicate what exists are a second vocabulary for the same idea. |

## Commits

```
6ed1514 docs: add frontend polish audit and batched execution plan
80d0c49 style(web): rebuild the design tokens and global stylesheet
64f0a1c style(web): tighten the app shell and navigation chrome
4bd04f2 style(web): unify form controls on one focus and error treatment
f9ec435 style(web): give the calendar's figures a face, drop dead fallbacks
38d3e5d style(web): repair the feedback states and their copy
0f8c482 style(web): settle the settings pages on one voice and one shell
4f613b6 refactor(web): put motion on named constants that track the CSS tokens
91b7d6b feat(web): give the time grid a now-line worth looking at
```

42 files, +717 / −151.

## Unchecked items remaining in `FRONTEND-POLISH-TASKS.md`

None. Every batch is ticked, including the four items ticked as deliberately-not-done with the reason recorded inline.
