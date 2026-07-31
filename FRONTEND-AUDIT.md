# Frontend Audit — Calley web app

**Scope:** `apps/web` (the only frontend in the monorepo).
**Type:** refinement pass on a shipping product. No redesign, no rewrite, no dependency changes.
**Branch:** `claude/perform-this-th7lhd` (see _Deviations_ below).
**Date of recon:** 2026-07-31

---

## 0. Deviations from the brief

Three, all forced by the environment or by the "don't delete content" constraint:

| Brief says                                  | What happened                           | Why                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch `chore/frontend-polish`              | Work is on `claude/perform-this-th7lhd` | Session-level instruction pins the branch. Commits still use conventional messages.                                                                                                                                                                                                                                                                           |
| Write `TASKS.md`                            | Wrote `FRONTEND-POLISH-TASKS.md`        | Repo already has a 50 KB `TASKS.md` (project phase tracker). Overwriting it would delete content.                                                                                                                                                                                                                                                             |
| Before/after screenshots into `.ui-review/` | **Not captured**                        | Chromium + Playwright are present, but the app cannot boot: `_app`/`_auth` route guards call `/auth/me`, and the API needs PostgreSQL + Redis. Docker is unavailable in this container (`docker info` fails). No browser automation was installed — per the brief. All findings below are from source reading plus computed contrast ratios, not from pixels. |

The `frontend-design` skill was fetched from `anthropics/skills` and installed to `~/.claude/skills/frontend-design/` (upstream copy, not a local fallback), and read before any design decision.

---

## 1. Stack inventory

| Layer        | What's installed                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Framework    | React 19.2 + TypeScript 6, Vite 8                                                                                                         |
| Routing      | TanStack Router 1.170 (file-based, `src/routes/`)                                                                                         |
| Styling      | **Tailwind CSS v4.3** via `@tailwindcss/vite`. No `tailwind.config` file — tokens live in the `@theme` block of `src/styles/globals.css`. |
| Components   | shadcn/ui pattern — Radix primitives copied into `src/components/ui/`, variants via `class-variance-authority`                            |
| Icons        | `lucide-react` 1.27                                                                                                                       |
| Motion       | `framer-motion` 12.43                                                                                                                     |
| Toasts       | `sonner` 2.0                                                                                                                              |
| Server state | TanStack Query 5.101                                                                                                                      |

Everything below is achievable with these. Nothing here needs a new package.

## 2. Token map — what exists, what's ad hoc

`src/styles/globals.css` is the only stylesheet (99 lines). It defines a `@theme` block and a `:root` shadcn-compat block.

**Exists and is used:** colour singletons (`--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-hover`, `--color-success`, `--color-danger`, `--color-warning`), 3 radii, 3 shadows, a z-index scale, 3 font families.

**Missing entirely:**

- **Spacing scale.** Nothing. Every gutter is an ad-hoc Tailwind number.
- **Type scale.** No scale, no `clamp()`, no line-height or tracking tokens. Font sizes are picked per-component (`text-[10px]`, `text-[11px]`, `text-xs`, `text-sm`, …).
- **Motion tokens.** Durations and easings are re-typed as literals in ~15 places (`duration: 0.2`, `ease: [0.16, 1, 0.3, 1]`, `duration-300`, `duration-500`).
- **Colour ramps.** Every colour is a single value. There is no "border vs. interactive border", no "accent fill vs. accent text", no tint step — so components invent tints inline (`bg-[var(--primary)]/10`, `color-mix(... 8%, transparent)`, `bg-[var(--muted)]/30`).
- **Focus ring token.** Every focusable element re-types `focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2`, and 13 files forget to.

**Ad hoc / inconsistent:**

- 23 hardcoded hex values in `.tsx` (8 are the event colour swatch palette — legitimate data; 4 are the Google logo — legitimate brand; the rest are duplicated fallbacks like `var(--color-danger, #c0392b)`, which is dead defensive code since the var is always defined).
- `bg-red-500` for the current-time indicator — the only raw Tailwind palette colour in the app, and off-brand against a warm terracotta system.
- 29 inline `style={{}}` uses. Most are legitimate (computed positions, per-category colours); none need changing.
- `!important` appears 4× and all 4 are inside the `prefers-reduced-motion` block — correct usage.

## 3. Findings, ranked by user impact

### F1 — Ten references to `var(--surface)`, a token that does not exist. **Critical.**

`@theme` names it `--color-surface`. Nine components ask for `--surface`.

| File                                                                  | What breaks                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `layout/Topbar.tsx:17`                                                | App header has no background — page content scrolls under it                                                                                           |
| `layout/Sidebar.tsx:49`                                               | Sidebar has no background — same                                                                                                                       |
| `layout/ViewSwitcher.tsx:18`                                          | Segmented control has no fill                                                                                                                          |
| `calendar/TimeGrid.tsx:94`                                            | Sticky hour gutter is transparent; event blocks scroll _through_ the hour labels                                                                       |
| `calendar/EventBlock.tsx:110`                                         | `color-mix(in srgb, ${color} 20%, var(--surface))` — an invalid `color-mix` drops the whole declaration, so **every timed event block loses its tint** |
| `routes/_app.tsx:111`                                                 | The skip-to-content link renders as unreadable text over the page                                                                                      |
| `search/KeyboardShortcutsHelp.tsx:64`                                 | `kbd` chips have no fill; also uses `var(--text-muted)` (also undefined) so they inherit body colour                                                   |
| `tasks/TaskPanel.tsx:317`, `calendar/DndCalendarProvider.tsx:272,280` | Drag ghosts are transparent                                                                                                                            |

**Who it hurts:** everyone, on every screen. **Fix:** define `--surface` and `--text-muted` as aliases in the `:root` compat block (one edit, propagates to all ten). **Risk:** none — it can only add paint where there is currently none.

### F2 — Body text fails WCAG AA contrast. **Critical.**

Measured against the real backgrounds:

| Pair                                              | Ratio    | Required | Verdict                                           |
| ------------------------------------------------- | -------- | -------- | ------------------------------------------------- |
| `--color-text-muted` `#7a7570` on paper `#f8f7f4` | **4.26** | 4.5      | fail — **122 usages**                             |
| same on `--muted` `#f0efec`                       | **3.97** | 4.5      | fail                                              |
| `--color-accent` `#c8522a` on paper               | **4.17** | 4.5      | fail — every text link                            |
| white on `--color-accent`                         | **4.47** | 4.5      | fail — every primary button label                 |
| white on `--color-warning` `#d4a017`              | **2.38** | 4.5      | **fail badly** — the entire offline banner        |
| `--color-border` `#e4e2dd` on white               | **1.29** | 3.0      | fail — input and control boundaries are invisible |

**Who it hurts:** low-vision users, anyone on a laptop screen in daylight; the offline banner is unreadable for everyone. **Fix:** darken four tokens along their existing hue (no hue change, no re-brand), split `--color-border` into hairline vs. interactive, and flip the offline banner to ink-on-amber. **Files:** `globals.css` + `OfflineBanner.tsx`. **Risk:** low, visually a small step darker.

### F3 — 13 component files render `<button>` with no focus style. **High.**

`TaskFilter`, `SortableTaskItem`, `TaskItem`, `TaskGroup`, `ViewSwitcher`, `TimeGrid`, `WeekView`, `DayCell`, `MoreIndicator`, `AgendaGroup`, `ColorPicker`, `TaskMarker`, `TaskPill`.

That is every date cell, every task row, every event pill, the view switcher, and the colour picker — i.e. the entire calendar grid is keyboard-invisible. Only 5 files in the app mention `focus-visible` at all, and all 5 are `ui/` primitives.

**Who it hurts:** keyboard and switch users, and anyone who tabs by accident. **Fix:** one global `:focus-visible` rule in `globals.css` keyed off a `--focus-ring` token, so it lands on all 13 without touching them. **Risk:** low.

### F4 — Three `ui/` primitives use `focus:` instead of `focus-visible:`. **Medium.**

`dialog.tsx:42`, `sheet.tsx:59`, `select.tsx`. The ring fires on mouse click, which trains people to ignore it — so when it matters (F3) it reads as noise.

### F5 — Touch targets are 24–32 px. **High on mobile.**

`ViewSwitcher` tabs are `px-3 py-1 text-xs` ≈ 24 px tall. `MiniCalendar` day cells are `h-6 w-6` = 24 px. `Topbar`, `DateNavigator`, `TaskPanel` icon buttons are `h-8 w-8` = 32 px (36 instances). Target is ≥44 px, or ≥40 px with clear separation.

**Fix:** expand the _hit area_ with padding/pseudo-element rather than the visual box, so density is preserved. **Risk:** low, but it is the one that most needs eyes on it — noted as residual.

### F6 — Modal scrim is `bg-black/80`. **Medium.**

`dialog.tsx:19` and `sheet.tsx:19` use 80 % black. On a warm-paper light app that reads as a blackout, and it contradicts `Sidebar.tsx:36` which uses `bg-black/20` for the same job. Also: the scrim is pure black, not the ink hue, so it grey-shifts the warm palette behind it.

### F7 — Motion is over budget and untokenised. **Medium.**

`sheet.tsx:29` animates for **500 ms** on open / 300 ms on close. The budget is 120–200 ms. Elsewhere the same easing curve `[0.16, 1, 0.3, 1]` is re-typed in 5 files. The `prefers-reduced-motion` block in `globals.css` covers CSS transitions but **framer-motion `animate` props are JS-driven and bypass it** — the code handles this correctly via `useReducedMotion()` in 3 components, but `viewSwitchVariants` (a 40 px x-translate) has no such guard at the variant level.

### F8 — No numeric typography anywhere. **Medium.**

`tabular-nums` appears **zero** times. This is a calendar: hour labels in the gutter, date numerals in month cells, mini-calendar days, and event times are all proportional figures, so columns of numbers visibly jitter between `1` and `11`. Purely a token + two-utility fix.

### F9 — Form fields lack programmatic error association. **Medium.**

29 error paragraphs carry `role="alert"`, which is good, but only 3 `aria-describedby` and 3 `aria-invalid` exist in the whole app. A screen-reader user hears the error announced once and then, on re-focusing the field, gets no indication it is still invalid. Errors are also colour-only (red text, no icon or prefix).

### F10 — `_auth.tsx:47` uses `font-[var(--font-display)]`. **Low.**

Tailwind v4 treats bare `font-[…]` as ambiguous between family and weight; `--font-display` resolves to `'DM Serif Display', serif` — a value containing a comma and quotes. The generated `font-family` is at best fragile. The rest of the app correctly uses the `font-display` utility that `@theme` generates. So the login wordmark is likely rendering in the body face while the topbar wordmark renders in the serif — the two most visible instances of the brand, disagreeing.

### F11 — Copy is inconsistent in register and vague at failure. **Low, but cheap.**

- Title Case and sentence case mixed within one screen: "Change Password", "Connected Accounts", "Danger Zone" sit next to "Week starts on", "Time format".
- `ErrorBoundary`: "An unexpected error occurred. Please try again." — says nothing about what happened or what to do.
- `EmptyState`: "No events" / "Create your first event" — the CTA claims "first" even when the user has hundreds of events in other months.
- `OfflineBanner` says "You are offline"; the skill's rule is that an interface names things the way users think about them and stays active-voice.

### F12 — Dead defensive fallbacks. **Cosmetic.**

`var(--color-danger, #c0392b)` and friends appear 6×. The fallback can never fire, and it means a token change silently doesn't propagate if someone later renames the variable. Remove the fallback, keep the var.

## 4. Design plan

Derived from the existing theme, per the unfilled BRAND DIRECTION slot.

**Honest note first.** The current theme — cream `#f8f7f4` paper, a high-contrast serif display, a terracotta accent — is precisely the first of the three looks the `frontend-design` skill flags as an AI default. A polish pass is the wrong instrument for re-hueing a shipping brand, so I am not swapping the palette. Instead the personality moves from _the colours_ (generic) to _the calendar's own vocabulary_ (specific to this product): dates, hours, and now.

### Colour — 6 named values

| Name     | Value     | Was       | Role                                                                       |
| -------- | --------- | --------- | -------------------------------------------------------------------------- |
| Paper    | `#f8f7f4` | unchanged | page ground                                                                |
| Card     | `#ffffff` | unchanged | raised surface                                                             |
| Ink      | `#1a1916` | unchanged | primary text, and the modal scrim's hue                                    |
| Graphite | `#716c68` | `#7a7570` | secondary text — now 4.84 : 1 on paper, 4.51 : 1 on `--muted`              |
| Ember    | `#bd4c26` | `#c8522a` | **action and now, nothing else** — 4.64 : 1 on paper, 4.97 : 1 under white |
| Rule     | `#e4e2dd` | unchanged | hairline separators only                                                   |

Plus one derived pair, because a single border value cannot do two jobs: **Rule-strong** `#918b84` (3.37 : 1 on card) for anything a user can click or type into. Warning stays the brand amber `#d4a017` and gains ink text (7.40 : 1) instead of white (2.38 : 1). Danger and success are already AA and are untouched.

Ramps are generated from these six with `color-mix()`, so tints stop being invented per-component.

### Type — three roles, one new

| Role        | Face                     | Where                                                                                                                        |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Display     | DM Serif Display         | **Two places only:** the wordmark and the date-navigator title. It is the thing you look at to know _where in time you are_. |
| Body        | Outfit                   | Everything written in words.                                                                                                 |
| **Numeric** | DM Mono + `tabular-nums` | **New role.** Hour labels, month-cell date numerals, mini-calendar days, the now-clock, counts.                              |

The numeric role is the structural device, and it encodes something true: a calendar is not read, it is _scanned_ — and what you scan are figures in a grid. Giving figures their own face and a fixed advance width is the difference between a grid that sits still and one that shimmers. This is why the app gets a third face rather than a numbered-eyebrow treatment.

Scale via `clamp()` on a 1.2 ratio, tokenised as `--text-xs` → `--text-2xl`. Fonts are already loaded in `index.html`; **no font-loading change is needed** — DM Mono is already fetched and currently unused.

### Layout & density

4/8 spacing scale as tokens. Gutters unify at `--space-3` (12 px) inside dense surfaces and `--space-6` (24 px) on page shells. Settings pages get a `--measure` max-width so paragraphs stop running the full monitor width. Radii keep the existing 4/8/16 but gain a `--radius-full` so the six pill/circle call-sites stop re-typing `rounded-full` alongside a token.

### Signature — the now-line

One element gets boldness; everything else stays quiet.

Today the current-time indicator in the time grid is a raw `bg-red-500` dot and a 2 px bar, unlabeled, sitting in a terracotta app. It becomes: an **Ember hairline** across the grid, anchored in the hour gutter by a **live time chip set in DM Mono with `tabular-nums`** — a small ink-filled block that reads `2:47 PM` and is the only element in the app allowed to sit on a filled accent. It ties the three decisions together (Ember means _now_, figures are mono, the gutter is the numeric column), and it is the one thing you would remember about the screen.

Nothing else gains a gradient, a glow, or an animation.

## 5. Not doing — and why

| Item                                                      | Reason                                                                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Re-hue the palette off the cream/serif/terracotta default | Would be a re-brand, not a polish pass. Flagged above; it's the user's call.                                                                                                     |
| Dark mode                                                 | No `dark:` variants and no theme toggle exist. Adding one is a feature, not polish.                                                                                              |
| Split the 819 kB `PasswordStrengthMeter` chunk (`zxcvbn`) | Real problem, but it's a build/bundling change, out of scope here.                                                                                                               |
| Make the Profile "Save changes" button always visible     | It currently mounts only when the form is dirty. Rendering it disabled instead is arguably better, but it changes what the DOM contains — behaviour-adjacent. Flagged, not done. |
| Virtualise the timezone `<Select>` (~400 options)         | Needs `@tanstack/react-virtual` wiring into a Radix Select — a logic change.                                                                                                     |
| Replace the `bg-black/80` scrim with a blur               | **Not done — would be slop.** Reduced opacity and the ink hue, no glassmorphism.                                                                                                 |
| Icon-only buttons → labelled buttons in the Topbar        | Would change rendered content. `aria-label`s are already correct.                                                                                                                |
| Any new package                                           | Lockfile is frozen. Nothing below needs one.                                                                                                                                     |
| Before/after screenshots                                  | Not done — app can't boot without Postgres/Redis; Docker unavailable. See §0.                                                                                                    |

## 6. Baseline

Recorded on `pnpm install --frozen-lockfile`, before any edit:

```
build       PASS  (3/3 tasks; pre-existing warning: index chunk 694 kB, PasswordStrengthMeter 819 kB)
type-check  PASS  (4/4)
lint        PASS  (4/4, zero warnings)
test        PASS  web 147/147, api 337/337
```

Baseline is green. Every batch must return to exactly this.
