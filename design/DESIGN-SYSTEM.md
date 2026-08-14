# Calley — Design System

**Version:** 1.0 · **Date:** 13 August 2026 · **Audience:** external design partners

This document describes the design system **as it exists today** in `apps/web`, so that a
redesign can be specified against something real rather than guessed at. Everything below was
read out of the codebase, not reconstructed from memory — file references are given so you can
verify any claim.

Companion material:

- `design/screenshots/` — 38 screenshots of every significant surface, captured from the running
  app against a real API and a realistically populated account.
- `design/SCREEN-INVENTORY.md` — a screen-by-screen index of those screenshots.

The brief itself is §7–§9 below: the open problems, the constraints, and what we're asking for back.

---

## 1. What Calley is

A calendar web app that holds **events** and **tasks** in one place, with RFC 5545 recurrence.
Single-user, no sharing, no invitees. The product is a personal planning surface, not a
collaboration tool.

Four calendar views (Month, Week, Day, Agenda), a right-hand task panel, a left sidebar with a
mini-calendar and calendar-category list, and a settings area. Everything is created and edited
through right-hand drawers and modal dialogs — there are no full-page forms inside the app.

**Design intent as currently expressed in code:** a warm, editorial, paper-like calendar. Serif
display type over a bone-white ground, a single terracotta accent reserved for actions and "now",
hairline rules rather than boxes, and a monospace face for figures. It is deliberately not a
neutral grey SaaS shell.

---

## 2. Foundations

All tokens live in one file: `apps/web/src/styles/globals.css`. There is no `tailwind.config` —
Tailwind v4 reads the `@theme` block directly. If you change a token, every component follows.

### 2.1 Colour

The palette is six named roles plus two derived edges. There is **one** accent and it is spent
carefully.

| Role          | Token                   | Value     | Used for                                                             |
| ------------- | ----------------------- | --------- | -------------------------------------------------------------------- |
| Paper         | `--color-bg`            | `#f8f7f4` | Page ground                                                          |
| Card          | `--color-surface`       | `#ffffff` | Raised surfaces: topbar, sidebar, popovers, drawers                  |
| Ink           | `--color-text`          | `#1a1916` | Primary text; also the hue the modal scrim is mixed from             |
| Graphite      | `--color-text-muted`    | `#716c68` | Secondary text (4.84:1 on Paper)                                     |
| Ember         | `--color-accent`        | `#bd4c26` | Actions, selected state, and the "now" line — nothing else           |
| Ember (hover) | `--color-accent-hover`  | `#a44322` | Hover on accent fills                                                |
| Rule          | `--color-border`        | `#e4e2dd` | Hairline separators only (1.29:1 — decorative, never a control edge) |
| Control edge  | `--color-border-strong` | `#918b84` | Any border a user can click or type into                             |

Status colours:

| Token                  | Value     | Meaning                                                     |
| ---------------------- | --------- | ----------------------------------------------------------- |
| `--color-success`      | `#3a6b5c` | Forest — confirmation, low-priority tasks                   |
| `--color-danger`       | `#c0392b` | Destructive actions, validation errors, high-priority tasks |
| `--color-danger-hover` | `#a63125` |                                                             |
| `--color-warning`      | `#d4a017` | Gold — medium-priority tasks                                |

Derived tints (defined once, in `:root`, so components stop inventing their own):

```css
:root {
  --accent-soft: color-mix(in srgb, var(--color-accent) 10%, transparent);
  --accent-soft-strong: color-mix(in srgb, var(--color-accent) 18%, transparent);
  --danger-soft: color-mix(in srgb, var(--color-danger) 10%, transparent);
  --scrim: color-mix(in srgb, var(--color-text) 55%, transparent);
}
```

The scrim is mixed from Ink rather than pure black so that dimmed content stays warm.

**Semantic aliases** (`:root`) map the palette onto shadcn/ui's variable names —
`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary` (`#f0efec`),
`--muted` (`#f0efec`), `--destructive`, `--border`, `--input`, `--ring`. Components reference
these, not the raw palette.

> **Known problem — three competing palettes.** See §7.1. The core palette above is only one of
> three colour systems shipping in the app.

### 2.2 Typography

Three faces, three roles, loaded from Google Fonts in `apps/web/index.html`.

| Role    | Token            | Family                 | Where                                                    |
| ------- | ---------------- | ---------------------- | -------------------------------------------------------- |
| Display | `--font-display` | **DM Serif Display**   | Wordmark, date navigator title, page titles ("Settings") |
| Body    | `--font-body`    | **Outfit** (300–700)   | Everything else                                          |
| Numeric | `--font-mono`    | **DM Mono** (400, 500) | Times, dates, counts — anything scanned as a figure      |

The numeric role is applied via two utility classes rather than per-component overrides:

```css
.numeric {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
```

This is why event pill times, the mini-calendar grid, and the "now" chip all line up in columns.

**Type scale** — fluid, ratio ≈1.2, clamped tightly around the sizes already shipping so the scale
could be adopted without re-flowing every screen:

| Token         | Range              |
| ------------- | ------------------ |
| `--text-xs`   | 0.750 → 0.8125 rem |
| `--text-sm`   | 0.875 → 0.9375 rem |
| `--text-base` | 1.000 → 1.0625 rem |
| `--text-lg`   | 1.125 → 1.250 rem  |
| `--text-xl`   | 1.3125 → 1.500 rem |
| `--text-2xl`  | 1.625 → 2.000 rem  |

Body line-height is 1.55. Headings get `text-wrap: balance`; paragraphs get `text-wrap: pretty`.
Line-heights are **not** tokenised — the repo's stylelint config rejects the `--text-*--line-height`
form, so they fall back to Tailwind defaults. Worth revisiting.

### 2.3 Shape, elevation, depth

| Token                      | Value                          | Applied to                                   |
| -------------------------- | ------------------------------ | -------------------------------------------- |
| `--radius-sm`              | 4px                            | Event pills, view-switcher tabs, small chips |
| `--radius-md` / `--radius` | 8px                            | Default — buttons, inputs, cards, selects    |
| `--radius-lg`              | 16px                           | Dialogs                                      |
| `--shadow-sm`              | `0 1px 3px rgb(0 0 0 / 6%)`    | Resting cards                                |
| `--shadow-md`              | `0 4px 16px rgb(0 0 0 / 10%)`  | Popovers, dropdowns                          |
| `--shadow-lg`              | `0 16px 48px rgb(0 0 0 / 14%)` | Dialogs, drawers                             |

Z-index is a fixed scale, not ad-hoc numbers: `--z-dropdown: 100`, `--z-sticky: 200`,
`--z-modal-backdrop: 300`, `--z-modal: 400`, `--z-popover: 500`, `--z-toast: 600`.

### 2.4 Motion

Budget: **120–200ms, ease-out, colour and transform only.**

| Token             | Value                           |
| ----------------- | ------------------------------- |
| `--duration-fast` | 120ms                           |
| `--duration-base` | 180ms                           |
| `--ease-out`      | `cubic-bezier(0.16, 1, 0.3, 1)` |

Framer Motion mirrors these as `DURATION_FAST = 0.12`, `DURATION_BASE = 0.18`,
`EASE_OUT = [0.16, 1, 0.3, 1]` in `apps/web/src/lib/motion.ts`, which also exports the shared
variants: `viewSwitchVariants` (±24px slide + fade between calendar views), `modalVariants`
(0.95 → 1 scale), `staggerContainer` / `staggerItem` (50ms stagger, 8px rise), `fadeIn`, and
`taskCheckOffVariants` (the one deliberate height-collapse, when a task is ticked off).

`prefers-reduced-motion: reduce` zeroes durations and animations globally — but deliberately
**not** transforms, because @dnd-kit positions dragged items with `transform` and the sidebar uses
it for its off-canvas state.

### 2.5 Focus, hit targets, and error shape

One focus ring, defined once, at zero specificity so any component can override it without
`!important`:

```css
:where(a, button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])):focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

Touch targets grow to 44px only under `@media (any-pointer: coarse)`, via three utilities —
`.hit-target` (min 44×44), `.hit-target-row` (min-height only, for grid cells that can't grow
sideways), and `.hit-target-overlay` (an invisible 44px pseudo-element centred on a control whose
visual size is load-bearing, e.g. a 16px task checkbox). Mouse-only machines keep the compact
chrome the calendar is designed around.

Validation errors carry a **shape** cue as well as a colour one — `.field-error` puts a 2px
danger-coloured rule down the left of the message, so it reads as wrong without relying on seeing
red.

### 2.6 Spacing and layout metrics

There is **no spacing token scale**. Gutters are ad-hoc Tailwind numbers throughout. Fixed
dimensions that a redesign must account for:

| Element           | Metric                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Topbar height     | 60px                                                               |
| Sidebar width     | 240px open, 60px collapsed (desktop), 0 (below `lg`)               |
| Task panel width  | 300px (`lg`+), 360px (`sm`–`lg`), full-width to 400px below `sm`   |
| Event/task drawer | Right sheet, full width, capped at `max-w-lg` (512px) from `sm` up |
| Dialog            | Centred, `max-w-lg` (512px), radius 16px                           |
| Time-grid slot    | 48px per 30 minutes → **96px/hour**, 2304px for 24 hours           |

Breakpoints are Tailwind defaults. In practice the app only uses three: `sm` (640px, 43 uses),
`lg` (1024px, 20 uses), `md` (768px, 1 use). **`lg` is the real desktop/mobile boundary** — the
sidebar becomes an overlay drawer and the Month and Week tabs disappear below it.

---

## 3. Component inventory

### 3.1 Primitives — `apps/web/src/components/ui/`

shadcn/ui pattern: Radix primitives copied into the repo and styled locally. Sixteen files:
`button`, `input`, `label`, `checkbox`, `select`, `dialog`, `sheet`, `dropdown-menu`, `Popover`,
`tooltip`, `command`, `separator`, `Toast` (sonner), `Skeleton`, `Spinner`, `aria-live-region`.

**Button** (`button.tsx`, CVA variants):

| Variant       | Treatment                                                |
| ------------- | -------------------------------------------------------- |
| `default`     | Ember fill, white text, darkens on hover                 |
| `destructive` | Danger fill, white text; focus ring switches to danger   |
| `outline`     | 1px `--border-strong`, Paper ground, muted fill on hover |
| `secondary`   | `#f0efec` fill, Ink text                                 |
| `ghost`       | Transparent until hover                                  |
| `link`        | Ember text, underline on hover                           |

Sizes: `default` 40px / px-4, `sm` 36px / px-3, `lg` 44px / px-8, `icon` 40×40. Every button
carries `.hit-target`, so on touch devices they all reach 44px.

**Input** (`input.tsx`): 40px tall, radius 8, `--border-strong` edge, Paper ground, border darkens
on hover, `aria-invalid=true` switches border **and** focus ring to danger.

### 3.2 Application components

| Group        | Components                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layout**   | `Topbar`, `Sidebar`, `MiniCalendar`, `CalendarList`, `ViewSwitcher`, `DateNavigator`, `CreateButton`, `UserMenu`                                                                                                                                        |
| **Calendar** | `MonthView`, `WeekView`, `DayView`, `AgendaView`, `TimeGrid`, `DayCell`, `AllDayRow`, `EventPill`, `EventBlock`, `TaskPill`, `TaskMarker`, `MoreIndicator`, `AgendaGroup`, `EventDrawer`, `RecurrenceScopeDialog`, `ColorPicker`, `DndCalendarProvider` |
| **Events**   | `EventDetailPopover`, `QuickCreatePopover`, `RecurrenceBuilder`                                                                                                                                                                                         |
| **Tasks**    | `TaskPanel`, `TaskGroup`, `TaskItem`, `SortableTaskItem`, `TaskFilter`, `TaskDrawer`                                                                                                                                                                    |
| **Auth**     | `LoginForm`, `SignupForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `OAuthButtons`, `PasswordStrengthMeter`                                                                                                                                           |
| **Settings** | `SettingsLayout`, `ProfileSettings`, `CalendarSettings`, `NotificationSettings`, `SessionSettings`                                                                                                                                                      |
| **Search**   | `SearchModal` (cmdk), `KeyboardShortcutsHelp`                                                                                                                                                                                                           |
| **System**   | `EmptyState`, `ErrorBoundary`, `FullPageLoader`, `OfflineBanner`, `CalendarSkeletons`                                                                                                                                                                   |

### 3.3 Iconography

`lucide-react`, 16px (`[&_svg]:size-4`) inside buttons, 20px for topbar affordances, 28px in empty
states. No second icon set anywhere.

---

## 4. Patterns

### 4.1 Event and task colour

An event's colour comes from its **calendar category**, unless the event carries a per-event
`color` override. Pills tint their background from that colour via `color-mix()` and use it solid
as a 3px left rule — so the hue reads at a glance without the label losing contrast.

Task **priority** maps onto status colours, shown as a small dot:
high → `--color-danger`, medium → `--color-warning`, low → `--color-success`, none → no dot.

### 4.2 The "now" line

The signature element. In Week and Day views a 1px Ember rule spans the grid at the current time,
anchored by a monospace time chip in the gutter. It is the only place besides interactive controls
that Ember appears.

### 4.3 Empty states

One component, `EmptyState` — 56px muted circle holding a 28px lucide icon, a 16px semibold title,
a ≤20rem muted description, and an optional `outline` button. Three presets ship: no events
("Nothing scheduled" / "This stretch of your calendar is clear."), no tasks, and no search results.
The voice is plain and calm; it does not apologise or exclaim.

> **None of it renders.** `EmptyState` and all three presets are imported only by
> `components/__tests__/components.test.tsx`. No production screen uses them. What users actually
> get is: a bare, unstyled `CommandEmpty` line in search (`41`), full-height "No events or tasks"
> rows in agenda (`13`), and simply nothing at all in an empty month or day. The designed empty
> states exist as code and as a test suite, and have never been seen by a user.

### 4.4 Loading, offline, and error

Skeletons per view (`CalendarSkeletons`), a centred spinner for lazy route chunks,
`FullPageLoader` for the root suspense boundary, a top `OfflineBanner` when the browser drops
connectivity, and `ErrorBoundary` at both root and main-content level. Toasts are `sonner`,
top-right, 4s.

### 4.5 Keyboard model

The app is fully keyboard-driven and this must survive any redesign:

`Cmd/Ctrl+K` search · `C` create event · `T` toggle task panel · `M` / `W` / `D` / `A` switch view ·
`←` / `→` previous / next period · `.` or `Home` today · `Shift+Enter` or `Shift+Space` pick up the
focused event for keyboard drag · `?` shortcut help · `Esc` close everything.

All shortcuts are suppressed while a text input has focus. Every view change announces itself
through a live region (`announce()` in `aria-live-region.tsx`).

### 4.6 Drag and drop

@dnd-kit. Events drag between days and time slots; tasks reorder within the panel. There is a
keyboard equivalent for event moves (see above) — a redesign must not introduce a drag-only
affordance.

---

## 5. Screen map

| Route                    | Surface                                        | Screenshot                   |
| ------------------------ | ---------------------------------------------- | ---------------------------- |
| `/login`                 | Email + password, OAuth buttons                | `01`, `02`, `50`             |
| `/signup`                | Name, email, password, strength meter          | `03`, `04`                   |
| `/forgot-password`       | Single email field                             | `05`                         |
| `/reset-password?token=` | New password + strength meter                  | `06`                         |
| `/calendar` (month)      | 6×7 grid, up to 3 pills per cell + "+N more"   | `10`, `17`, `25`, `40`, `51` |
| `/calendar` (week)       | All-day row + 96px/hour time grid, now-line    | `11`, `15`, `24`             |
| `/calendar` (day)        | Single-column time grid                        | `12`, `53`                   |
| `/calendar` (agenda)     | Date-grouped list, virtualised                 | `13`, `54`                   |
| Task panel               | Overdue / Today / Upcoming / No date groups    | `14`, `26`, `27`             |
| Event drawer             | Right sheet, create and edit                   | `18`, `18b`, `18c`           |
| Task drawer              | Right sheet                                    | `16`                         |
| Recurrence builder       | Modal over the drawer, with occurrence preview | `19`                         |
| Search                   | cmdk modal                                     | `20`, `41`                   |
| Shortcut help            | Modal                                          | `21`                         |
| `/settings/*`            | Profile, Calendars, Notifications, Sessions    | `30`–`33`, `57`              |

---

## 6. Accessibility baseline — do not regress

The current build already meets these, and they are the floor for any redesign:

1. Body and secondary text pass WCAG AA on their grounds (Graphite is 4.84:1 on Paper, 4.51:1 on
   `--muted`).
2. Every interactive control has a visible focus ring, applied globally rather than per component.
3. Any border a user can click or type into uses `--border-strong` (2.9:1), not the 1.29:1 hairline.
4. Touch targets reach 44px on coarse pointers.
5. Errors are conveyed by shape and text, not colour alone.
6. `prefers-reduced-motion` is honoured.
7. Every drag interaction has a keyboard equivalent.
8. Live-region announcements accompany view and navigation changes.
9. A skip-to-main-content link is the first focusable element.

---

## 7. Known problems — the reasons for this redesign

### 7.1 Three colour systems in one product

This is the most visible inconsistency, and it is plainly legible in screenshots `18b`, `18c`,
`31`, and `10`.

1. **The core palette** — Paper / Ink / Graphite / Ember. Warm, editorial, deliberate.
2. **`CATEGORY_COLORS`** (`packages/shared/src/constants/colors.ts`) — 12 colours used for calendar
   categories: `#c8522a` terracotta, `#3a6b5c` forest, `#4a90d9` sky, `#d4a017` gold, `#8e44ad`
   purple, `#e74c3c` red, `#2ecc71` emerald, `#f39c12` orange, `#1abc9c` teal, `#e91e63` pink,
   `#607d8b` blue-grey, `#795548` brown. Flat-UI-era hues, only loosely related to the core palette.
3. **`COLOR_PRESETS`** (`apps/web/src/components/calendar/EventDrawer.tsx:104`) — 8 _different_
   colours for the per-event "Colour override" swatches: `#EF4444`, `#F97316`, `#F59E0B`,
   `#10B981`, `#3B82F6`, `#6366F1`, `#8B5CF6`, `#EC4899`. These are stock Tailwind defaults and are
   the loudest thing on screen; they belong to no system at all.

A user picking a category colour and a user picking an event colour are choosing from two
unrelated palettes, neither of which is the product's palette. **We want one categorical palette,
derived from the core system, that works as a tint behind text and as a solid rule, in a fixed
order, with enough separable hues for ~12 calendars.**

### 7.2 The mobile experience is unfinished

Below `lg` (1024px) the app degrades badly. All three of these are visible in screenshot `51` and
`52`:

- **The sidebar opens over the calendar on first load.** `isSidebarOpen` defaults to `true`
  regardless of viewport, so a phone user lands on a drawer plus a dimming backdrop covering their
  calendar, and must dismiss it before doing anything (`52-mobile-sidebar-drawer-default-open.png`).
- **The topbar overflows.** At 390px the centred date navigator and view switcher push Search, the
  primary **New** button, the task-panel toggle, and the user menu off the right edge. They are not
  merely cramped — they cannot be reached at all. **On a phone there is currently no way to create
  an event, search, open tasks, or sign out.**
- **Month and Week are unreachable but still render.** The two tabs are `hidden lg:block`, yet the
  store's default view is `month`, so a phone user is shown a horizontally-clipped month grid they
  have no control to leave except by choosing Day or Agenda.

Mobile is the single largest opportunity in this project.

### 7.3 Settings is nested inside the calendar chrome

`/settings/*` renders inside the `_app` layout, so the settings pages sit beneath a topbar still
showing the month title, the Month/Week/Day/Agenda switcher, and the Today button — none of which
do anything relevant — with the calendar sidebar still occupying 240px on the left
(`30`–`33`). Settings needs its own frame, or the calendar chrome needs to become
context-aware.

### 7.4 Density is uneven

Month cells show only three pills before collapsing to "+N more", and "+N more" is not an expander —
it navigates to that date's Day view, losing month context entirely (`25`). Meanwhile the Week and
Day grids are set at 96px/hour, which is generous, and the Agenda view renders full-height empty
rows for days with nothing in them ("No events or tasks"), so an empty week costs several screens
of scrolling (`13`).

### 7.5 Vertical rhythm is unsystematised

No spacing scale exists. Every gutter, gap, and padding value is chosen per component. Line-heights
are un-tokenised for the reason given in §2.2. A redesign should deliver both scales.

### 7.6 The empty states are written but never shown

As described in §4.3: a designed `EmptyState` component with three product-specific presets ships
in the bundle, is fully tested, and is wired into nothing. Every place a user encounters emptiness
they get a default instead — an unstyled line of text in search, repeated "No events or tasks"
rows in agenda, or blank grid cells. Whatever the redesign specifies for empty states needs to be
matched by actually rendering them.

### 7.7 Smaller items

- **Drawers are long.** The event drawer runs to ~10 fields with the primary action below the fold
  on a 900px viewport (`18b` vs `18c`). No progressive disclosure — everything is always visible.
- **The category colour dot doubles as a visibility toggle** in the sidebar with no affordance
  saying so.
- **The mini-calendar and the month view show the same information** in the same place at
  the same time.

---

## 8. Constraints for the redesign

These are engineering realities, not preferences. Working within them keeps the redesign
implementable; anything outside them needs a conversation first.

1. **Token-first.** Deliver design decisions as values for the token set in §2, or as a new token
   set with a stated mapping. Hex values sprinkled into a Figma file that don't resolve to tokens
   will not survive implementation.
2. **Tailwind v4 + shadcn/ui stays.** Components are Radix primitives copied into the repo. Radix
   determines the DOM structure and accessibility semantics of every select, dialog, popover,
   dropdown, tooltip, and checkbox. Designs that require a different DOM for these need flagging.
3. **Light theme only, today.** There is no dark theme and no `prefers-color-scheme` handling.
   If you propose one, deliver the full second set of token values — the architecture supports it
   (every colour is already a variable), but the values do not exist.
4. **The keyboard model in §4.5 is a requirement**, as is every item in §6.
5. **Motion budget is 120–200ms**, colour and transform only. No layout-shifting animation except
   the deliberate task check-off collapse.
6. **Three type families are already loaded** (DM Serif Display, Outfit, DM Mono). Changing them is
   allowed; adding a fourth is a performance cost that needs justifying.
7. **Data shapes are fixed.** An event has title, description (sanitised HTML, bold/italic/links
   only), location, start, end, all-day flag, category, colour override, visibility, RRULE, and one
   reminder. A task has title, description, due date, priority, status, category, RRULE, reminder.
   Designs should not imply fields that do not exist (attendees, attachments, video links, labels).
8. **Recurrence is expanded server-side per query range** and instances are not materialised. A
   design that implies editing an arbitrary instance in place needs to account for the
   parent / exception / exDate model.

---

## 9. Deliverables we're asking for

1. **Token values** — the full set in §2, revised: colour roles and tints, type scale with
   line-heights and tracking, a **spacing scale** (currently missing), radii, shadows, motion.
2. **One categorical palette** for calendar categories and event colour overrides, replacing the
   three-palette situation in §7.1. Needs ~12 separable hues that each work as a `color-mix` tint
   behind Ink text _and_ as a solid 3px rule, with AA-passing text on the tint.
3. **Redesigned screens**, at 1440px and 390px, for: month, week, day, agenda, task panel open,
   event drawer, task drawer, search, settings, and the four auth screens.
4. **A mobile information architecture** that resolves §7.2 — specifically, where create, search,
   tasks, and account live on a phone.
5. **Component specs** for the primitives in §3.1 across all states (rest, hover, focus-visible,
   active, disabled, invalid), since the focus ring, hover, and invalid treatments are currently
   global rules rather than per-component decisions.
6. **Empty, loading, error, and offline states** for every redesigned screen.

---

## Appendix — file reference

| What                   | Where                                                  |
| ---------------------- | ------------------------------------------------------ |
| All design tokens      | `apps/web/src/styles/globals.css`                      |
| Motion presets         | `apps/web/src/lib/motion.ts`                           |
| UI primitives          | `apps/web/src/components/ui/`                          |
| Category colours       | `packages/shared/src/constants/colors.ts`              |
| Event colour overrides | `apps/web/src/components/calendar/EventDrawer.tsx:104` |
| Task priority colours  | `apps/web/src/components/tasks/TaskItem.tsx:16`        |
| Keyboard shortcuts     | `apps/web/src/hooks/use-keyboard-shortcuts.ts`         |
| Layout shell           | `apps/web/src/routes/_app.tsx`                         |
| Time-grid metrics      | `apps/web/src/components/calendar/TimeGrid.tsx:16`     |
| Full product spec      | `SPECS.md`                                             |
| Prior token audit      | `FRONTEND-AUDIT.md`                                    |
