# Frontend Polish — execution plan

Companion to `FRONTEND-AUDIT.md`. Named `FRONTEND-POLISH-TASKS.md` rather than `TASKS.md` because the repo's existing `TASKS.md` is the project phase tracker and must not be overwritten.

## Resume anchor

- **Current batch:** done — nine batches plus wrap-up landed
- **Last commit SHA:** `91b7d6b`
- **Next unchecked task:** none
- **Baseline to hold:** build PASS · type-check PASS · lint PASS · web 147/147 · api 337/337

---

## Batch 1 — Tokens

- [x] Alias the two undefined tokens (`--surface`, `--text-muted`) so F1 resolves everywhere at once
- [x] Darken `--color-text-muted` → `#716c68` (AA on paper, card, and `--muted`)
- [x] Darken `--color-accent` → `#bd4c26`, `--color-accent-hover` → `#a44322`
- [x] Add `--color-border-strong` `#918b84` for interactive edges; keep `--color-border` as hairline
- [x] Add `--color-warning-foreground` (ink) so amber surfaces stop carrying white text
- [x] Add tint tokens via `color-mix()` — shipped as `--accent-soft`, `--accent-soft-strong`, `--danger-soft`, plus `--scrim`
- [x] ~~Add 4/8 spacing scale~~ — **not done, deliberately.** Tailwind v4's `--spacing` base is already 4 px, so every `p-2`/`gap-3` in the app is on the scale. Parallel `--space-*` tokens would be a second vocabulary for the same thing.
- [x] Add `clamp()` type scale `--text-xs` … `--text-2xl` (line-heights left on Tailwind defaults — the paired `--text-*--line-height` form fails the repo's stylelint `custom-property-pattern`)
- [x] ~~Add `--radius-full`~~ — **not done, deliberately.** `rounded-full` already exists; a token duplicating it is an accessory.
- [x] Add motion tokens `--duration-fast` / `--duration-base` + `--ease-out`. No `slow` tier — the budget tops out at 200 ms, so a third, slower duration would only invite going over it.
- [x] Add `--focus-ring-width` / `--focus-ring-offset` / `--focus-ring-color`
- [x] ~~Add `--measure` for prose max-width~~ — added in this batch, then **removed in batch 7** once it turned out nothing needed it. See batch 7 for the reasoning.
- [x] Verify every ratio in the audit table with a computed check
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Batch 2 — Global CSS

- [x] Global `:focus-visible` ring keyed off the focus tokens (fixes F3 across all 13 files without touching them)
- [x] Kill the default UA `:focus` outline only where `:focus-visible` replaces it — never bare `outline: none`
- [x] Base typography: body size/leading from the scale, `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs
- [x] `tabular-nums` utility class for the numeric role (F8)
- [x] Numeric-face utility binding DM Mono + tabular figures
- [x] Selection colour drawn from the accent tint
- [x] Scrollbar styling in the ink family (thin, no gradient)
- [x] ~~Extend `prefers-reduced-motion` to zero out transforms~~ — **not done, deliberately.** @dnd-kit drags with `transform` and the sidebar uses it for its off-canvas state; zeroing it would break dragging. Durations/animations only, as before.
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Batch 3 — Layout & navigation

- [x] `Topbar` — real surface (F1), 44 px hit areas on icon buttons (F5), tokenised gutters
- [x] `Sidebar` — real surface (fixed in batch 1 by the token alias; its 200 ms duration was already inside budget, left alone)
- [x] `ViewSwitcher` — real surface, 44 px targets on touch, fast-duration transition. The selected tab was already distinguished by a filled background rather than by hue alone, and already carried `aria-selected`; no change was needed there.
- [x] `DateNavigator` — display face + 44 px targets; title gets `text-wrap: balance`
- [x] `MiniCalendar` — numeric face + tabular figures on the day grid; `hit-target-row` gives 44 px row height on touch. Width stays on the grid track (7 × 44 px would overflow the 240 px sidebar) — logged as residual in `PR.md`.
- [x] `_app.tsx` skip link — fix the invisible-surface bug (F1)
- [x] `_auth.tsx` — fix `font-[var(--font-display)]` (F10), tokenise the shell
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Batch 4 — Forms

- [x] `input.tsx` — interactive border (F2), `aria-invalid` styling hook, 44 px height on coarse pointers
- [x] `label.tsx` — scale token, consistent spacing
- [x] `button.tsx` — drops its bespoke ring in favour of the global outline, gains motion tokens, `hit-target`, and a real `--color-danger-hover` (destructive previously hovered to a translucent overlay)
- [x] `checkbox.tsx` / `select.tsx` — interactive border, `focus-visible` (F4)
- [x] Wire `aria-describedby` + `aria-invalid` on all auth form fields (F9)
- [x] Wire the same on `ProfileSettings` fields
- [x] Errors stop being colour-only — a `.field-error` rule in the global stylesheet gives every error message a left rule and heavier weight. Done as a class rather than a new component so no new export is added to the app's public surface.
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Batch 5 — Tables & lists

- [x] `TaskItem` — drop dead `var(--x, #hex)` fallbacks (F12), numeric due-date, tokenised radius
- [x] `TaskGroup` / `TaskPanel` — same fallback cleanup, count badges in the numeric face
- [x] `DayCell` — date numeral in the numeric face with tabular figures. **Today stays Ember-filled**, not ink as first planned: Ember's stated role is "action and now", and today is the same idea as the now-line, not a competing one. Drop-target tint moves onto the `--accent-soft` token.
- [x] `TimeGrid` gutter — surface restored by the batch-1 token alias; hour labels adopt the numeric face
- [x] `EventBlock` — `color-mix` tint restored by the batch-1 token alias; its `border-white/20` hairline (invisible against a pale tint) moves to the border token, and `hover:shadow-md` to the shadow token
- [x] `KeyboardShortcutsHelp` — fix `kbd` chips (F1, both undefined tokens)
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Batch 6 — Feedback states

- [x] `OfflineBanner` — ink on amber (F2), active-voice copy
- [x] `ErrorBoundary` — copy that says what happened and what to do (F11)
- [x] `EmptyState` — CTA copy that doesn't lie about "first" (F11)
- [x] `FullPageLoader` — tokenised, copy without a trailing ellipsis
- [x] `Toast` — surface on card not page ground, tokenised shadow
- [x] `dialog.tsx` / `sheet.tsx` — scrim from 80 % black to 55 % ink (F6), `focus-visible` (F4), motion inside budget (F7)
- [x] Destructive confirm buttons say what they delete ("Delete calendar", "Delete 3 tasks" — not "Delete")
- [x] Update the six component tests that asserted the old copy verbatim
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Batch 7 — Responsive

- [x] Sentence-case the settings headings (F11)
- [x] ~~Settings shell gets `--measure`~~ — **not done, and the token was removed.** The settings content column already resolves to ~680 px inside `max-w-4xl` minus the 192 px nav, which is a good measure already. Applying `--measure` would have changed nothing, and leaving an unreferenced token in the theme is dead weight.
- [x] Long values truncate with a `title` rather than overflowing
- [x] Verify no horizontal scroll is introduced at 360 px by any of the above — reasoned from source, not measured in a browser (see the screenshots deviation in `FRONTEND-AUDIT.md` §0). The only width-growing change is `.hit-target`'s `min-width: 44px`, which is scoped to `(pointer: coarse)` and never applied to a fixed-track grid cell.
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Batch 8 — Accessibility polish

- [x] `motion.ts` — tokenised durations/easing, reduced-motion-safe view-switch variants (F7)
- [x] Confirm heading hierarchy on settings (h1 → h2 → h3, correct). Fixed an h1 → h3 skip in the two auth success panels. **Residual:** the calendar route has no `h1` at all — the only page-level heading is the `DateNavigator`'s `h2`, and promoting it would give the settings pages two `h1`s since the topbar renders there too. Logged in `PR.md`.
- [x] Confirm dialog focus return + Esc — verified by grep: nothing in the app overrides `onEscapeKeyDown`, `onCloseAutoFocus`, `onOpenAutoFocus` or `onInteractOutside`, so Radix's defaults (Esc closes, focus returns to the trigger) are intact
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Batch 9 — Signature pass

- [x] The now-line: the Ember rule replaces `bg-red-500`, and a live `h:mm a` chip in the numeric face sits in the hour gutter. The chip is formatted from the same `Date` the line's position is derived from, so it can never label the wrong line.
- [x] Confirm nothing else in the diff gained decoration — no gradients, no blur, no glass, no emoji, no new animation. The only other colour change in this batch removes raw Tailwind reds/ambers/blues from the agenda's priority dots, which disagreed with the task panel's mapping for the same three priorities.
- [x] build + type-check + lint + test (+ stylelint on the batches that touch CSS)

## Wrap-up

- [x] `PR.md` written
- [x] `git diff --stat c3b250a HEAD -- package.json pnpm-lock.yaml apps/*/package.json packages/*/package.json` returns empty. (Diffing against `main` is misleading here — the branch already carried a dependabot merge before this work started, so `c3b250a` is the correct base.)
- [x] Usability checklist walked per key route — results table in `PR.md`. One gap left open and documented: two destructive confirm dialogs fire without a pending state, which is a behaviour fix rather than a styling one.
