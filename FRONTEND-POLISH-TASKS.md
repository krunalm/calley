# Frontend Polish — execution plan

Companion to `FRONTEND-AUDIT.md`. Named `FRONTEND-POLISH-TASKS.md` rather than `TASKS.md` because the repo's existing `TASKS.md` is the project phase tracker and must not be overwritten.

## Resume anchor

- **Current batch:** 1 — Tokens
- **Last commit SHA:** _(none yet — audit + plan is the first commit)_
- **Next unchecked task:** Batch 1 › alias the two undefined tokens
- **Baseline to hold:** build PASS · type-check PASS · lint PASS · web 147/147 · api 337/337

---

## Batch 1 — Tokens

- [ ] Alias the two undefined tokens (`--surface`, `--text-muted`) so F1 resolves everywhere at once
- [ ] Darken `--color-text-muted` → `#716c68` (AA on paper, card, and `--muted`)
- [ ] Darken `--color-accent` → `#bd4c26`, `--color-accent-hover` → `#a44322`
- [ ] Add `--color-border-strong` `#918b84` for interactive edges; keep `--color-border` as hairline
- [ ] Add `--color-warning-foreground` (ink) so amber surfaces stop carrying white text
- [ ] Add tint ramp tokens via `color-mix()` (`--tint-accent`, `--tint-danger`, `--tint-primary-strong`)
- [ ] Add 4/8 spacing scale `--space-1` … `--space-8`
- [ ] Add `clamp()` type scale `--text-xs` … `--text-2xl` with paired line-heights
- [ ] Add `--radius-full`
- [ ] Add motion tokens `--duration-fast/base/slow` + `--ease-out`
- [ ] Add `--focus-ring-width` / `--focus-ring-offset` / `--focus-ring-color`
- [ ] Add `--measure` for prose max-width
- [ ] Verify every ratio in the audit table with a computed check
- [ ] build + type-check + lint + test

## Batch 2 — Global CSS

- [ ] Global `:focus-visible` ring keyed off the focus tokens (fixes F3 across all 13 files without touching them)
- [ ] Kill the default UA `:focus` outline only where `:focus-visible` replaces it — never bare `outline: none`
- [ ] Base typography: body size/leading from the scale, `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs
- [ ] `tabular-nums` utility class for the numeric role (F8)
- [ ] Numeric-face utility binding DM Mono + tabular figures
- [ ] Selection colour drawn from the accent tint
- [ ] Scrollbar styling in the ink family (thin, no gradient)
- [ ] Extend the `prefers-reduced-motion` block to zero out transforms, not just durations
- [ ] build + type-check + lint + test

## Batch 3 — Layout & navigation

- [ ] `Topbar` — real surface (F1), 44 px hit areas on icon buttons (F5), tokenised gutters
- [ ] `Sidebar` — real surface, tokenised motion duration
- [ ] `ViewSwitcher` — real surface, 44 px targets, `aria-selected` styling that isn't colour-only
- [ ] `DateNavigator` — display face + 44 px targets; title gets `text-wrap: balance`
- [ ] `MiniCalendar` — numeric face + tabular figures on the day grid, 40 px targets with visual density preserved
- [ ] `_app.tsx` skip link — fix the invisible-surface bug (F1)
- [ ] `_auth.tsx` — fix `font-[var(--font-display)]` (F10), tokenise the shell
- [ ] build + type-check + lint + test

## Batch 4 — Forms

- [ ] `input.tsx` — interactive border (F2), `aria-invalid` styling hook, 44 px height on coarse pointers
- [ ] `label.tsx` — scale token, consistent spacing
- [ ] `button.tsx` — tokenised focus ring, motion token, min touch target, `aria-busy` affordance
- [ ] `checkbox.tsx` / `select.tsx` — interactive border, `focus-visible` (F4)
- [ ] Wire `aria-describedby` + `aria-invalid` on all auth form fields (F9)
- [ ] Wire the same on `ProfileSettings` fields
- [ ] Errors stop being colour-only — add an icon-marked error row component built from existing primitives
- [ ] build + type-check + lint + test

## Batch 5 — Tables & lists

- [ ] `TaskItem` — drop dead `var(--x, #hex)` fallbacks (F12), numeric due-date, tokenised radius
- [ ] `TaskGroup` / `TaskPanel` — same fallback cleanup, count badges in the numeric face
- [ ] `DayCell` — date numeral in the numeric face with tabular figures, today = ink-filled numeral
- [ ] `TimeGrid` gutter — real surface (F1), hour labels in the numeric face
- [ ] `EventBlock` — fix the broken `color-mix` (F1)
- [ ] `KeyboardShortcutsHelp` — fix `kbd` chips (F1, both undefined tokens)
- [ ] build + type-check + lint + test

## Batch 6 — Feedback states

- [ ] `OfflineBanner` — ink on amber (F2), active-voice copy
- [ ] `ErrorBoundary` — copy that says what happened and what to do (F11)
- [ ] `EmptyState` — CTA copy that doesn't lie about "first" (F11)
- [ ] `FullPageLoader` — tokenised, copy without a trailing ellipsis
- [ ] `Toast` — surface on card not page ground, tokenised shadow
- [ ] `dialog.tsx` / `sheet.tsx` — scrim from 80 % black to 55 % ink (F6), `focus-visible` (F4), motion inside budget (F7)
- [ ] Destructive confirm buttons say what they delete
- [ ] build + type-check + lint + test

## Batch 7 — Responsive

- [ ] Sentence-case the settings headings (F11)
- [ ] Settings shell gets `--measure` so prose stops running full-width
- [ ] Long values truncate with a `title` rather than overflowing
- [ ] Verify no horizontal scroll is introduced at 360 px by any of the above
- [ ] build + type-check + lint + test

## Batch 8 — Accessibility polish

- [ ] `motion.ts` — tokenised durations/easing, reduced-motion-safe view-switch variants (F7)
- [ ] Confirm heading hierarchy on settings (h2 under a page h1)
- [ ] Confirm dialog focus return + Esc (Radix default, verified not overridden)
- [ ] build + type-check + lint + test

## Batch 9 — Signature pass

- [ ] The now-line: Ember hairline replacing `bg-red-500`, plus a live mono `tabular-nums` time chip in the hour gutter
- [ ] Confirm nothing else in the diff gained decoration
- [ ] build + type-check + lint + test

## Wrap-up

- [ ] `PR.md` written
- [ ] `git diff --stat package.json pnpm-lock.yaml` proves zero dependency change
- [ ] Usability checklist walked per key route
