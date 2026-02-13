# Calley — Task Breakdown & Progress Tracker

> Solo developer execution plan. Every task is mandatory — nothing deferred.
> Estimated total: ~12 weeks.

## Legend

- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Complete
- `[!]` — Blocked (note reason)

---

## Phase 0: Project Scaffolding & Tooling (Week 1)

> Goal: Monorepo structure, dev environment, CI pipeline, Docker setup — all wiring before any feature code.

### 0.1 Monorepo & Package Management

- [ ] Initialize Git repository with `.gitignore` (node_modules, .env, dist, .turbo, .vercel)
- [ ] Initialize pnpm workspace (`pnpm-workspace.yaml`) with `apps/*` and `packages/*`
- [ ] Configure Turborepo (`turbo.json`) with build, dev, lint, test, type-check pipelines
- [ ] Create `packages/shared` package with `tsconfig.json` and `package.json`
- [ ] Create `apps/web` package (Vite + React + TypeScript scaffold)
- [ ] Create `apps/api` package (Hono + TypeScript scaffold)
- [ ] Verify cross-package imports work (`shared` → `web`, `shared` → `api`)

### 0.2 Code Quality & Hooks

- [ ] Configure ESLint (flat config) for all packages (TypeScript, React rules, import sorting)
- [ ] Configure Prettier (consistent formatting: single quotes, trailing commas, 100 print width)
- [ ] Install and configure Husky (`.husky/pre-commit`)
- [ ] Configure lint-staged to run ESLint + Prettier on staged files
- [ ] Add `tsconfig.json` base config at root, extend in each package
- [ ] Verify `pnpm lint`, `pnpm format`, `pnpm type-check` all pass on clean scaffold

### 0.3 CI/CD Pipeline (GitHub Actions)

- [ ] Create `.github/workflows/ci.yml`:
  - Trigger on push to `main`, `staging`, and all PRs
  - Steps: install deps → lint → type-check → unit tests → build → integration tests
- [ ] Create `.github/workflows/deploy-preview.yml`:
  - Trigger on PR open/update
  - Deploy frontend preview to Vercel
  - Deploy API preview to Railway (or skip if Railway doesn't support PR previews)
- [ ] Create `.github/workflows/deploy-production.yml`:
  - Trigger on push to `main`
  - Deploy frontend to Vercel production
  - Deploy API to Railway production
  - Run DB migrations post-deploy
- [ ] Add GitHub Actions secrets placeholder documentation in README

### 0.4 Docker Setup

- [ ] Create `apps/api/Dockerfile` (multi-stage: deps → build → runtime, non-root user)
- [ ] Create `apps/web/Dockerfile` (multi-stage: build → nginx serve)
- [ ] Create `docker/docker-compose.yml` (api, web, postgres, redis, nginx)
- [ ] Create `docker/docker-compose.dev.yml` (dev overrides: volume mounts, hot reload)
- [ ] Create `docker/nginx.conf` (reverse proxy: `/` → web, `/api` → api, SSL termination placeholder)
- [ ] Create `docker/.env.example` with all required variables documented
- [ ] Verify `docker compose up` starts all services and health checks pass
- [ ] Document Docker self-host setup in README

### 0.5 Developer Experience

- [ ] Create `.env.example` files for `apps/web` and `apps/api`
- [ ] Add `pnpm dev` script that starts web + api + docker db/redis concurrently
- [ ] Verify hot reload works for both frontend and backend
- [ ] Create a root `README.md` with: project overview, prerequisites, setup instructions, scripts reference
- [ ] Add VS Code recommended extensions (`.vscode/extensions.json`)
- [ ] Add VS Code settings (`.vscode/settings.json`: format on save, ESLint auto-fix)

---

## Phase 1: Database & Auth Foundation (Week 2-3)

> Goal: PostgreSQL schema, Drizzle ORM, Lucia Auth with email/password + OAuth, all security measures.

### 1.1 Database Setup

- [ ] Install Drizzle ORM + `drizzle-kit` + `@neondatabase/serverless` or `postgres` driver
- [ ] Configure `drizzle.config.ts` with environment-based connection
- [ ] Create Drizzle schema for `users` table (all fields from spec §6.1)
- [ ] Create Drizzle schema for `oauth_accounts` table
- [ ] Create Drizzle schema for `sessions` table
- [ ] Create Drizzle schema for `password_reset_tokens` table
- [ ] Create Drizzle schema for `audit_logs` table
- [ ] Create Drizzle schema for `calendar_categories` table
- [ ] Create Drizzle schema for `events` table (including recurrence fields, soft delete)
- [ ] Create Drizzle schema for `tasks` table (including recurrence fields, soft delete)
- [ ] Create Drizzle schema for `reminders` table
- [ ] Create Drizzle schema for `user_push_subscriptions` table
- [ ] Define all foreign key constraints with correct cascade rules (per spec §7.2)
- [ ] Create all indexes (per spec §7.1) — include partial indexes for soft deletes
- [ ] Create full-text search indexes (GIN indexes on events + tasks)
- [ ] Generate initial migration (`drizzle-kit generate`)
- [ ] Run migration and verify schema in database (`drizzle-kit push` for dev)
- [ ] Create `db/index.ts` — connection pool with configurable max connections
- [ ] Create `db/seed.ts` — dev seed data (test user, categories, sample events/tasks)

### 1.2 Shared Schemas (packages/shared)

- [ ] Create `schemas/common.schema.ts` — CUID2 pattern, pagination, date range, hex color regex
- [ ] Create `schemas/auth.schema.ts` — signup, login, forgot-password, reset-password, update-profile
- [ ] Create `schemas/event.schema.ts` — create, update, query params (with field length limits)
- [ ] Create `schemas/task.schema.ts` — create, update, query params
- [ ] Create `schemas/category.schema.ts` — create, update
- [ ] Create `schemas/reminder.schema.ts` — create
- [ ] Create `types/index.ts` — inferred TypeScript types from all Zod schemas
- [ ] Create `constants/priorities.ts`, `constants/statuses.ts`, `constants/colors.ts`
- [ ] Export everything from `packages/shared/src/index.ts`
- [ ] Verify imports work from both `apps/web` and `apps/api`

### 1.3 API Skeleton & Middleware

- [ ] Set up Hono app factory (`app.ts`) with base configuration
- [ ] Create `index.ts` entry point with graceful shutdown handler (SIGTERM, SIGINT)
- [ ] Implement `request-id.middleware.ts` — generate CUID2, attach to context, set response header
- [ ] Implement `logger.middleware.ts` — Pino structured logging per request (method, path, status, duration)
- [ ] Create `lib/logger.ts` — Pino instance with environment-based log level
- [ ] Implement `security-headers.middleware.ts` — CSP, X-Frame-Options, HSTS, etc. (per spec §4.2)
- [ ] Implement `cors.middleware.ts` — restrict to `CORS_ORIGIN` env var (per spec §4.6)
- [ ] Implement `error-handler.middleware.ts` — catch AppError + unhandled, format response, log
- [ ] Create `AppError` class with statusCode, code, message, details
- [ ] Implement `validate.middleware.ts` — accept Zod schema, validate body/query/params
- [ ] Implement `rate-limit.middleware.ts` — Redis sliding window, configurable per route group (per spec §4.3)
- [ ] Create `lib/redis.ts` — Redis client singleton with connection error handling
- [ ] Create `health.routes.ts` — `/health` and `/health/ready` endpoints
- [ ] Wire all middleware in correct order in `app.ts`
- [ ] Test health endpoint manually

### 1.4 Authentication — Email/Password

- [ ] Install Lucia Auth v3 + PostgreSQL adapter + argon2
- [ ] Configure `lib/lucia.ts` — session configuration, cookie settings (per spec §13.2)
- [ ] Implement `auth.middleware.ts` — extract session from cookie, validate, attach user to context
- [ ] Implement `auth.service.ts`:
  - [ ] `signup()` — validate, check email uniqueness, hash password (Argon2id), create user + default category + session
  - [ ] `login()` — check lockout, verify credentials, handle failed attempts, rotate session
  - [ ] `logout()` — invalidate session, clear cookie
  - [ ] `getMe()` — return current user profile (strip passwordHash)
  - [ ] `updateProfile()` — update name, timezone, weekStart, timeFormat
  - [ ] `changePassword()` — verify current password, hash new, invalidate other sessions
  - [ ] `deleteAccount()` — verify password, cascade delete (DB handles via FK)
- [ ] Implement `auth.routes.ts` — wire all endpoints with validation middleware
- [ ] Apply rate limiting to login (5/15min), signup (3/1hr)
- [ ] Test all auth flows manually with curl/Hoppscotch
- [ ] Verify session cookie is HttpOnly, Secure, SameSite=Lax
- [ ] Verify account lockout after 5 failed attempts

### 1.5 Authentication — Password Reset

- [ ] Install Resend SDK
- [ ] Create `lib/email.ts` — Resend client, fallback to console.log in development
- [ ] Create email template for password reset (HTML + plain text)
- [ ] Implement `forgotPassword()` in auth service — generate token, hash with SHA-256, store, send email
- [ ] Implement `resetPassword()` in auth service — verify hashed token, check expiry, update password, invalidate sessions
- [ ] Ensure same response for existing and non-existing emails (prevent enumeration)
- [ ] Test password reset flow end-to-end

### 1.6 Authentication — OAuth (Google + GitHub)

- [ ] Install Arctic.js
- [ ] Implement Google OAuth:
  - [ ] `GET /auth/oauth/google` — generate state, store in cookie, redirect to Google
  - [ ] `GET /auth/oauth/google/callback` — verify state, exchange code, fetch profile
  - [ ] Link to existing user (by email) or create new user
  - [ ] Create session, redirect to frontend
- [ ] Implement GitHub OAuth:
  - [ ] `GET /auth/oauth/github` — same flow
  - [ ] `GET /auth/oauth/github/callback` — same flow
- [ ] Handle edge case: OAuth email matches existing email/password user → link accounts
- [ ] Handle edge case: OAuth provider doesn't return email → error with user-friendly message
- [ ] Test both OAuth flows (requires provider app setup)

### 1.7 CSRF Protection

- [ ] Generate CSRF token on session creation, store in separate cookie (HttpOnly: false, SameSite: Strict)
- [ ] Create CSRF validation middleware for POST/PATCH/DELETE routes
- [ ] Exempt GET endpoints (including SSE `/stream`)
- [ ] Add CSRF token reading utility to frontend API client

### 1.8 Session Management

- [ ] Implement `GET /auth/sessions` — list active sessions with userAgent, last active, current indicator
- [ ] Implement `DELETE /auth/sessions/:id` — revoke specific session (cannot revoke current)
- [ ] Implement `DELETE /auth/sessions` — revoke all sessions except current
- [ ] Enforce max 10 sessions per user (delete oldest on overflow)

### 1.9 Audit Logging

- [ ] Implement `audit.service.ts` — `log(action, userId, entityType?, entityId?, metadata?)`
- [ ] Log all auth events: signup, login, login.failed, logout, password.reset, lockout, oauth.link
- [ ] Log destructive operations: account.delete
- [ ] Ensure no PII in audit metadata
- [ ] Hash IP addresses before storage

---

## Phase 2: Core Events CRUD + Calendar Views (Week 4-5)

> Goal: Full event lifecycle, month/week/day views, drag-and-drop.

### 2.1 Event Service (Backend)

- [ ] Implement `event.service.ts`:
  - [ ] `listEvents(userId, start, end, categoryIds?)` — date range query, include expanded recurring instances
  - [ ] `getEvent(userId, eventId)` — single event with ownership check
  - [ ] `createEvent(userId, data)` — validate, create, emit SSE event
  - [ ] `updateEvent(userId, eventId, data, scope)` — handle non-recurring + 3 recurrence scopes
  - [ ] `deleteEvent(userId, eventId, scope)` — soft delete, handle recurrence scopes
  - [ ] `duplicateEvent(userId, eventId)` — create standalone copy
  - [ ] `exportIcs(userId, eventId)` — generate .ics file content
- [ ] Implement input sanitization for event description (DOMPurify, allowlisted tags)
- [ ] Implement `events.routes.ts` — all endpoints with validation and auth middleware
- [ ] Write unit tests for event service (CRUD, ownership, date range queries)
- [ ] Write API integration tests for event endpoints

### 2.2 Recurrence Service (Backend)

- [ ] Implement `recurrence.service.ts`:
  - [ ] `expandRecurringEvents(events, start, end)` — use rrule.js to generate instances within range
  - [ ] `handleEditScope('instance', parentEvent, instanceDate, updates)` — create exception record, add to exDates
  - [ ] `handleEditScope('following', parentEvent, instanceDate, updates)` — split series
  - [ ] `handleEditScope('all', parentEvent, updates)` — update parent directly
  - [ ] Validate RRULE strings before storage
  - [ ] Cap expansion at 1000 instances per series per query
- [ ] Write comprehensive unit tests:
  - [ ] Daily recurrence expansion
  - [ ] Weekly with specific days
  - [ ] Monthly by day-of-month and by weekday position
  - [ ] Yearly recurrence
  - [ ] Custom interval (every 3 weeks, etc.)
  - [ ] End conditions (count, until date)
  - [ ] Exception handling (exDates skipped)
  - [ ] Timezone edge cases (DST transitions)

### 2.3 Frontend Setup & Auth Pages

- [ ] Configure Vite with path aliases (`@/` → `src/`)
- [ ] Install and configure Tailwind CSS v4 with design tokens (per spec §8.1)
- [ ] Set up shadcn/ui (init, add base components: Button, Input, Dialog, Popover, DropdownMenu, Tooltip, Toast, Skeleton, Label, Checkbox, Select, Separator, Sheet, Command)
- [ ] Load Google Fonts (DM Serif Display, Outfit, DM Mono) with `font-display: swap`
- [ ] Configure TanStack Router (file-based routing)
- [ ] Configure TanStack Query (QueryClient with defaults: staleTime, retry, refetchOnWindowFocus)
- [ ] Create `lib/api-client.ts` — fetch wrapper with:
  - [ ] Base URL from env
  - [ ] Credentials: include (for cookies)
  - [ ] Auto-attach CSRF token header
  - [ ] Auto-parse JSON responses
  - [ ] Error handling (throw on non-2xx, extract error body)
  - [ ] 401 handling → redirect to login
- [ ] Create `lib/query-keys.ts` — query key factory (per spec §10.2)
- [ ] Build Login page (`/login`) — email, password, OAuth buttons, "Forgot password" link
- [ ] Build Signup page (`/signup`) — name, email, password (with zxcvbn strength meter), OAuth buttons
- [ ] Build Forgot Password page (`/forgot-password`) — email input, success message
- [ ] Build Reset Password page (`/reset-password`) — new password + confirm, token from URL
- [ ] Build OAuthButtons component — Google + GitHub buttons with correct redirect URLs
- [ ] Implement auth route guard (`_app/__layout.tsx`) — redirect to `/login` on 401
- [ ] Implement guest route guard (`_auth/__layout.tsx`) — redirect to `/calendar` if authenticated
- [ ] Test all auth flows in browser

### 2.4 App Shell & Layout

- [ ] Build Layout component (Topbar + Sidebar + main content area + TaskPanel slot)
- [ ] Build Topbar:
  - [ ] SidebarToggle (hamburger, visible on mobile/tablet)
  - [ ] Logo
  - [ ] DateNavigator (◀ title ▶ + Today button) — displays month/year or week range based on view
  - [ ] ViewSwitcher (Month | Week | Day | Agenda) — responsive (hide on mobile, show Day + Agenda only)
  - [ ] SearchButton (Cmd+K icon) — opens SearchModal
  - [ ] CreateButton (+ dropdown: New Event | New Task)
  - [ ] TaskPanelToggle
  - [ ] UserMenu (avatar → dropdown: Settings, Sign Out)
- [ ] Build Sidebar:
  - [ ] MiniCalendar (month grid, clickable dates, dot indicators for events)
  - [ ] CalendarList (category toggles with color dots, edit on right-click/hover)
  - [ ] AddCalendarButton
  - [ ] Collapsible to icon rail (240px → 60px transition)
  - [ ] Hidden on mobile (hamburger toggle)
- [ ] Set up Zustand stores: `useCalendarStore`, `useUIStore`
- [ ] Implement responsive behavior per spec §8.4 breakpoints
- [ ] Add skip navigation link ("Skip to main content")

### 2.5 Month View

- [ ] Build MonthGrid component — 6-row × 7-column CSS grid
- [ ] Build DayCell component:
  - [ ] Display date number (highlight today, dim out-of-month days)
  - [ ] Render EventPill components (max 3 visible, "+N more" overflow)
  - [ ] Render TaskPill components
  - [ ] Click empty area → QuickCreate popover
  - [ ] Click date number → navigate to Day view for that date
- [ ] Build EventPill component — colored bar with title, click → EventDetailPopover
- [ ] Build TaskPill component — checkbox + title, click checkbox → toggle complete
- [ ] Build MoreIndicator — "+N more" button → overflow popover listing all items
- [ ] Connect to TanStack Query — fetch events for visible month range + 1 month buffer
- [ ] Implement `useEvents` hook (fetch events by date range, memoize transformed data)
- [ ] Test month navigation (prev/next buttons, today button, keyboard arrows)

### 2.6 Week View

- [ ] Build WeekView container with WeekHeader + AllDayRow + TimeGrid
- [ ] Build WeekHeader — 7 day columns showing day name + date, highlight today
- [ ] Build AllDayRow — render all-day events as spanning bars
- [ ] Build TimeGrid:
  - [ ] 24-hour vertical axis with 30-minute slots (48 rows)
  - [ ] Scrollable; auto-scroll to current time on mount
  - [ ] Current time indicator (red line, updates every 60 seconds)
- [ ] Build TimeSlot — click → QuickCreate popover pre-populated with slot time
- [ ] Build EventBlock component:
  - [ ] Positioned absolutely based on startAt/endAt
  - [ ] Color-coded by category
  - [ ] Shows title, time, location (truncated)
  - [ ] Recurring icon indicator
  - [ ] Click → EventDetailPopover
- [ ] Handle overlapping events (column layout algorithm — stack side-by-side with reduced width)
- [ ] Build TaskMarker — small indicator for timed tasks in the time grid
- [ ] Connect to events query (same hook, different date range)

### 2.7 Day View

- [ ] Build DayView — single-column variant of WeekView
- [ ] Reuse TimeGrid, EventBlock, TimeSlot components
- [ ] Show all-day events at top
- [ ] Show full event details in wider blocks (more space available)

### 2.8 Agenda View

- [ ] Build AgendaView — chronological list grouped by date
- [ ] Build AgendaGroup — date header + list of events/tasks for that date
- [ ] Implement virtual scrolling with `@tanstack/react-virtual` (handle 500+ items efficiently)
- [ ] Show event time, title, category color, location
- [ ] Show task priority indicator, checkbox, due time
- [ ] Click item → EventDetailPopover or TaskDetailPopover
- [ ] Infinite scroll: load more dates as user scrolls down

### 2.9 Event Drawer (Create/Edit Form)

- [ ] Build EventDrawer as a Sheet (slide-in from right)
- [ ] Implement form with React Hook Form + Zod validation:
  - [ ] Title input (required, max 200 chars)
  - [ ] Date + time pickers for start and end (validate end > start)
  - [ ] All-day toggle (hides time pickers)
  - [ ] Description (Tiptap editor — bold, italic, links only)
  - [ ] Location text input
  - [ ] Category selector (dropdown with color dots)
  - [ ] Color override picker (optional)
  - [ ] Visibility toggle (public/private)
  - [ ] Recurrence dropdown (presets + "Custom" → RecurrenceBuilder modal)
  - [ ] Reminder selector (preset times + custom)
- [ ] Mode: Create (empty form or pre-populated from QuickCreate) vs Edit (loaded from API)
- [ ] On edit of recurring event: show scope selection dialog before saving
- [ ] Optimistic create/update mutation with toast feedback
- [ ] Validate all fields client-side before submission
- [ ] Test form validation edge cases (empty title, invalid dates, long descriptions)

### 2.10 Event Detail Popover

- [ ] Build EventDetailPopover — click an event pill/block to show details
- [ ] Display: title, date/time, location, description preview, category, recurrence indicator
- [ ] Action buttons: Edit (opens EventDrawer), Duplicate, Delete
- [ ] Delete button: if recurring, show scope selection dialog
- [ ] Close on click outside or Escape

### 2.11 Quick Create Popover

- [ ] Build QuickCreatePopover — appears on empty slot click
- [ ] Fields: Title (auto-focused), type toggle (Event/Task), start/end time (pre-populated)
- [ ] Submit on Enter
- [ ] "More options" link: closes popover, opens EventDrawer/TaskDrawer with fields populated
- [ ] Optimistic mutation on submit

### 2.12 Drag and Drop — Events

- [ ] Install and configure `@dnd-kit/core` + `@dnd-kit/sortable`
- [ ] Implement drag to reschedule in Week view (move event to different time/day)
- [ ] Implement drag to reschedule in Day view
- [ ] Implement drag edge to resize duration (top/bottom handles on EventBlock)
- [ ] Snap to 15-minute increments during drag
- [ ] Show ghost overlay (opacity 0.5) at original position during drag
- [ ] Optimistic UI: update position immediately, rollback on error
- [ ] Handle recurring events: show scope dialog after drop (for recurring)
- [ ] Implement drag in Month view (move event to different day)
- [ ] Add keyboard alternatives for all DnD actions (per spec §16, accessibility)

### 2.13 Recurrence Builder UI

- [ ] Build RecurrenceBuilderModal (opened from EventDrawer)
- [ ] Frequency selector: Daily / Weekly / Monthly / Yearly
- [ ] Interval input: "Every N [days/weeks/months/years]" (max 99)
- [ ] Weekly: day-of-week checkboxes (Mon-Sun)
- [ ] Monthly: radio for "day of month" vs "Nth weekday" (with selectors)
- [ ] End condition: radio for Never / After N occurrences / On date
- [ ] Preview: show next 5 occurrences based on current settings
- [ ] Output: generate RRULE string, pass back to EventDrawer
- [ ] Validate: ensure at least one day selected for weekly, valid end date

### 2.14 ICS Export

- [ ] Implement `.ics` file generation for single events (backend)
- [ ] Include VTIMEZONE, VEVENT with DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION, RRULE
- [ ] Frontend: "Export" button in EventDetailPopover triggers download
- [ ] Test with Google Calendar and Apple Calendar import

---

## Phase 3: Tasks System (Week 6)

> Goal: Full task lifecycle, task panel, priorities, status management, drag reorder.

### 3.1 Task Service (Backend)

- [ ] Implement `task.service.ts`:
  - [ ] `listTasks(userId, filters)` — filter by status, priority, due date range, sorted by sortOrder/dueAt
  - [ ] `getTask(userId, taskId)` — single task with ownership check
  - [ ] `createTask(userId, data)` — validate, create, emit SSE
  - [ ] `updateTask(userId, taskId, data, scope)` — handle non-recurring + recurrence scopes
  - [ ] `deleteTask(userId, taskId, scope)` — soft delete, recurrence scopes
  - [ ] `toggleTask(userId, taskId)` — toggle status (todo ↔ done), set/clear completedAt
  - [ ] `reorderTasks(userId, ids)` — update sortOrder for each task ID in order
- [ ] Implement `tasks.routes.ts` — all endpoints with validation and auth middleware
- [ ] Write unit tests for task service
- [ ] Write API integration tests for task endpoints

### 3.2 Task Panel (Frontend)

- [ ] Build TaskPanel — slide-in drawer from right (300px on desktop, full-screen on mobile)
- [ ] Toggle with toolbar button or `T` keyboard shortcut
- [ ] Build TaskPanelHeader — title + close button + "New Task" button
- [ ] Build TaskFilter — dropdown/toggle for: Show completed / Filter by priority / Filter by category
- [ ] Build TaskGroup component — collapsible group with label and count:
  - [ ] "Today" — tasks due today
  - [ ] "Overdue" — tasks past due date and not done (sorted oldest first)
  - [ ] "Upcoming" — tasks due in the future (sorted by due date)
  - [ ] "No Date" — tasks without a due date
  - [ ] "Completed" — done tasks (hidden by default, toggle to show)
- [ ] Build TaskItem component:
  - [ ] Checkbox (click → toggle complete with optimistic update)
  - [ ] Title (click → open TaskDrawer for editing)
  - [ ] Priority indicator (colored dot or icon: none/low/medium/high)
  - [ ] Due date badge (highlight overdue in red)
  - [ ] Category color stripe
  - [ ] Recurring icon if applicable
- [ ] Implement `useTasks` hook — fetch tasks with filters, group by section
- [ ] Connect to TanStack Query with optimistic updates for toggle/reorder

### 3.3 Task Drawer (Create/Edit Form)

- [ ] Build TaskDrawer as a Sheet (slide-in from right)
- [ ] Form fields (React Hook Form + Zod):
  - [ ] Title (required, max 200 chars)
  - [ ] Due date picker (optional)
  - [ ] Due time picker (optional, only shown if due date is set)
  - [ ] Description textarea (plain text, max 2000 chars)
  - [ ] Priority selector (None / Low / Medium / High)
  - [ ] Status selector (Todo / In Progress / Done) — for edit mode
  - [ ] Category selector
  - [ ] Recurrence (same presets + custom builder as events)
  - [ ] Reminder selector
- [ ] Mode: Create vs Edit
- [ ] On edit of recurring task: show scope selection dialog
- [ ] Optimistic create/update mutation

### 3.4 Task Drag & Drop

- [ ] Implement drag-to-reorder within TaskPanel groups (using @dnd-kit/sortable)
- [ ] Persist reorder via `PATCH /tasks/reorder`
- [ ] Implement drag task to calendar date (Month view) — sets due date
- [ ] Implement drag task to time slot (Week/Day view) — sets due date + time
- [ ] Optimistic UI for all drag operations

### 3.5 Bulk Operations

- [ ] Add multi-select mode to TaskPanel (checkboxes appear on long-press or toolbar toggle)
- [ ] Bulk complete — complete all selected tasks
- [ ] Bulk delete — delete all selected tasks (with confirmation dialog)
- [ ] Show count of selected items in toolbar

---

## Phase 4: Categories & Calendar Management (Week 7)

> Goal: Full category CRUD, color management, visibility toggles, reassignment on delete.

### 4.1 Category Service (Backend)

- [ ] Implement `category.service.ts`:
  - [ ] `listCategories(userId)` — sorted by sortOrder
  - [ ] `createCategory(userId, data)` — validate name uniqueness per user, max 20 check
  - [ ] `updateCategory(userId, categoryId, data)` — validate, emit SSE
  - [ ] `deleteCategory(userId, categoryId)` — cannot delete default, reassign events/tasks to default, emit SSE
  - [ ] `createDefaultCategory(userId)` — called during signup
- [ ] Implement `categories.routes.ts`
- [ ] Write tests

### 4.2 Category Management UI

- [ ] Build CalendarList in Sidebar:
  - [ ] Each item: color dot + name + visibility toggle (eye icon)
  - [ ] Click name or edit icon → opens inline edit (name + color picker)
  - [ ] Right-click / three-dot menu → Edit, Delete
- [ ] Build AddCalendarButton → opens create dialog (name + color picker)
- [ ] Build color picker component (preset palette of 12 colors + custom hex input)
- [ ] Build delete confirmation dialog — warning about reassignment to default
- [ ] Implement `useCategories` hook — fetch, create, update, delete mutations
- [ ] Visibility toggle: client-side only (stored in Zustand or localStorage), filters events/tasks in views

### 4.3 Category Color Integration

- [ ] Event pills/blocks use category color (or event color override if set)
- [ ] Task items show category color stripe
- [ ] Mini calendar date dots use category colors
- [ ] Ensure all category colors have accessible text contrast (compute dynamically)

---

## Phase 5: Search & Keyboard Shortcuts (Week 8)

> Goal: Full-text search, Cmd+K modal, all keyboard shortcuts, keyboard shortcut help.

### 5.1 Search Service (Backend)

- [ ] Implement `search.service.ts`:
  - [ ] `search(userId, query, limit)` — PostgreSQL full-text search using `tsvector`/`tsquery`
  - [ ] Search across event titles + descriptions, task titles + descriptions
  - [ ] Rank by relevance (ts_rank) then by date proximity
  - [ ] Return grouped results: `{ events: [...], tasks: [...] }`
  - [ ] Minimum query length: 2 characters
  - [ ] Exclude soft-deleted items
- [ ] Implement `search.routes.ts` with rate limiting (30/min)
- [ ] Write tests for search accuracy and ranking

### 5.2 Search Modal (Frontend)

- [ ] Build SearchModal — full-screen overlay triggered by Cmd/Ctrl+K
- [ ] Use shadcn/ui Command component (cmdk-based)
- [ ] Debounced search input (300ms)
- [ ] Loading state with skeleton results
- [ ] Results grouped: Events section + Tasks section
- [ ] Each result: icon, title, date, category color
- [ ] Arrow keys to navigate results, Enter to select
- [ ] On select: navigate to calendar date + open detail popover
- [ ] Recent searches (last 5, stored in localStorage)
- [ ] Empty state: "Type to search events and tasks"
- [ ] No results state: "No results found for '{query}'"

### 5.3 Keyboard Shortcuts

- [ ] Implement `useKeyboardShortcuts` hook:
  - [ ] `Cmd/Ctrl + K` → open search
  - [ ] `C` → quick create event on current date
  - [ ] `T` → toggle task panel
  - [ ] `M` → month view
  - [ ] `W` → week view
  - [ ] `D` → day view
  - [ ] `A` → agenda view
  - [ ] `←` / `→` → navigate prev/next
  - [ ] `.` or `Home` → go to today
  - [ ] `Escape` → close any open modal/drawer/popover
  - [ ] `Delete` / `Backspace` → delete selected item (with confirmation)
  - [ ] `?` → show keyboard shortcuts help modal
- [ ] Disable shortcuts when text input/textarea is focused
- [ ] Build KeyboardShortcutsHelp modal — list all shortcuts in a clean grid
- [ ] Test all shortcuts in different views and states

---

## Phase 6: Notifications & Reminders (Week 9)

> Goal: BullMQ reminder jobs, Web Push, email notifications, SSE real-time, in-app toasts.

### 6.1 Reminder Service (Backend)

- [ ] Implement `reminder.service.ts`:
  - [ ] `createReminder(userId, data)` — compute triggerAt, create record, enqueue BullMQ job
  - [ ] `deleteReminder(userId, reminderId)` — delete record, cancel BullMQ job
  - [ ] `listReminders(userId, itemType, itemId)` — reminders for a specific event/task
  - [ ] `reEnqueueMissedReminders()` — called on startup, re-enqueue unsent reminders
- [ ] Implement `reminders.routes.ts`
- [ ] Write tests

### 6.2 BullMQ Job Processing

- [ ] Configure BullMQ connection to Redis
- [ ] Implement `reminder.job.ts`:
  - [ ] Process delayed job at triggerAt
  - [ ] Verify reminder exists and isn't sent (idempotent)
  - [ ] Verify parent event/task exists
  - [ ] Based on method: send push, email, or both
  - [ ] Emit `reminder:fired` on SSE
  - [ ] Set `sentAt` on reminder record
  - [ ] Retry failed jobs 3 times with exponential backoff
- [ ] Implement `email.job.ts` — send reminder email via Resend with formatted template
- [ ] Implement `cleanup.job.ts` — scheduled (cron):
  - [ ] Delete expired sessions daily
  - [ ] Delete used/expired password reset tokens daily
  - [ ] Hard delete soft-deleted events/tasks older than 30 days
  - [ ] Delete sent reminders older than 30 days
  - [ ] Delete audit logs older than 90 days
- [ ] Register cleanup job as a BullMQ repeatable job (daily at 3 AM UTC)

### 6.3 SSE Implementation

- [ ] Implement `sse.service.ts`:
  - [ ] Manage active connections Map (userId → Set of response streams)
  - [ ] `addConnection(userId, stream)` / `removeConnection(userId, stream)`
  - [ ] `emit(userId, eventType, data)` — send to all connections for that user
  - [ ] Heartbeat: send comment every 30 seconds per connection
  - [ ] Max 5 connections per user (close oldest on overflow)
- [ ] Implement `stream.routes.ts`:
  - [ ] `GET /stream` — require auth, create SSE stream, register connection, cleanup on close
- [ ] Wire SSE emissions into event, task, category, and reminder services (emit on create/update/delete)
- [ ] Frontend: implement `useSSE` hook:
  - [ ] Connect to `/stream` using EventSource
  - [ ] Parse events and invalidate relevant TanStack Query cache keys
  - [ ] Reconnect with exponential backoff (EventSource built-in + manual fallback)
  - [ ] Show connection status indicator (optional)

### 6.4 Web Push Notifications

- [ ] Generate VAPID key pair, store in environment variables
- [ ] Create minimal Service Worker (`public/sw.js`) for push event handling:
  - [ ] Listen for `push` event → show notification with title, body, icon
  - [ ] Listen for `notificationclick` → open URL from data payload
- [ ] Implement `usePushNotifications` hook:
  - [ ] Check `Notification.permission`
  - [ ] Request permission when user enables notifications in settings
  - [ ] Subscribe via `PushManager.subscribe()` with VAPID public key
  - [ ] Send subscription to `POST /push-subscriptions` API
- [ ] Backend: Implement push subscription CRUD endpoints
- [ ] Backend: Send push notifications in reminder job using `web-push` library
- [ ] Handle expired subscriptions (delete on push error)

### 6.5 In-App Toast Notifications

- [ ] Configure toast/sonner component from shadcn/ui
- [ ] Show toast on:
  - [ ] Event/task created/updated/deleted (success)
  - [ ] Reminder fired (via SSE)
  - [ ] Errors (API failures, validation errors)
  - [ ] Rate limit hit (warning)
- [ ] Toast auto-dismiss after 4 seconds (configurable)
- [ ] Toast accessible via `aria-live` region

### 6.6 Email Notifications

- [ ] Create email template: reminder notification (event/task title, time, link to app)
- [ ] Create email template: password reset
- [ ] Create email template: account lockout warning
- [ ] Test email delivery in development (console fallback) and with Resend in staging

---

## Phase 7: Settings & User Preferences (Week 10)

> Goal: Settings pages for profile, calendar preferences, notification preferences, session management.

### 7.1 Profile Settings

- [ ] Build `/settings/profile` page:
  - [ ] Edit name
  - [ ] Display email (read-only for OAuth users, editable for email/password users)
  - [ ] Avatar display (from OAuth provider or Gravatar fallback — no upload in v1)
  - [ ] Timezone selector (searchable dropdown of IANA timezones)
  - [ ] Week start preference (Sunday / Monday)
  - [ ] Time format preference (12h / 24h)
  - [ ] Change password section (current + new + confirm — hidden for OAuth-only users)
  - [ ] Connected accounts section (show linked Google/GitHub, allow unlinking if password is set)
  - [ ] Delete account button (requires password confirmation, shows warning dialog)

### 7.2 Calendar Settings

- [ ] Build `/settings/calendars` page:
  - [ ] List all categories with color, name, default indicator
  - [ ] Create new category
  - [ ] Edit category (name, color)
  - [ ] Delete category (with reassignment warning)
  - [ ] Reorder categories via drag-and-drop

### 7.3 Notification Settings

- [ ] Build `/settings/notifications` page:
  - [ ] Default reminder time for new events (dropdown)
  - [ ] Default reminder method (push / email / both / none)
  - [ ] Enable/disable push notifications (triggers permission request)
  - [ ] Push notification status indicator (granted/denied/not-supported)
  - [ ] Email notification toggle

### 7.4 Session Management

- [ ] Build `/settings/sessions` page:
  - [ ] List all active sessions: device (from userAgent), last active, IP (hashed for display), current session indicator
  - [ ] "Revoke" button per session (except current)
  - [ ] "Sign out all other devices" button
  - [ ] Confirmation dialog for revocation actions

---

## Phase 8: Polish, Accessibility & Performance (Week 11)

> Goal: Accessibility audit, performance optimization, animations, error boundaries, edge cases.

### 8.1 Accessibility Audit & Fixes

- [ ] Run axe-core automated audit on all pages
- [ ] Add ARIA labels to all interactive elements:
  - [ ] Calendar grid: `role="grid"`, `role="gridcell"` with date labels
  - [ ] Event pills: `role="button"` with event title + time in aria-label
  - [ ] Form inputs: associated labels
  - [ ] Buttons: descriptive aria-labels for icon-only buttons
- [ ] Implement focus management:
  - [ ] Focus trapped in modals and drawers (Radix handles this)
  - [ ] Focus restored to trigger element on close
  - [ ] Skip navigation link ("Skip to main content") as first focusable element
- [ ] Implement keyboard DnD alternatives:
  - [ ] Arrow keys to navigate between events/time slots
  - [ ] Enter to "pick up" selected item
  - [ ] Arrow keys to move to new position
  - [ ] Enter to "drop", Escape to cancel
- [ ] Test with VoiceOver (macOS) or NVDA (Windows)
- [ ] Verify `prefers-reduced-motion` disables all animations
- [ ] Verify color contrast meets WCAG AA (4.5:1) for all text
- [ ] Verify all form errors announced via `aria-live="assertive"`
- [ ] Test entire flow with keyboard only (no mouse)

### 8.2 Performance Optimization

- [ ] Implement route-based code splitting (lazy load all route components)
- [ ] Lazy load heavy components: Tiptap editor, RecurrenceBuilderModal, color picker
- [ ] Wrap DayCell, EventPill, EventBlock, TaskItem with `React.memo`
- [ ] Implement `useMemo` for expensive date calculations in calendar views
- [ ] Verify Agenda view uses virtual scrolling for 500+ items
- [ ] Implement prefetching: when viewing March, prefetch Feb + April events
- [ ] Add `<link rel="preconnect">` for Google Fonts and API domain
- [ ] Analyze bundle size with `vite-plugin-visualizer`:
  - [ ] Verify initial JS < 150KB gzipped
  - [ ] Identify and tree-shake unused imports
- [ ] Test Core Web Vitals with Lighthouse:
  - [ ] LCP < 1.5s
  - [ ] INP < 100ms
  - [ ] CLS < 0.05
- [ ] Optimize database queries:
  - [ ] Verify all date range queries use indexes (EXPLAIN ANALYZE)
  - [ ] Verify connection pool settings (max 20 connections)
  - [ ] Add query timeout (30 seconds)

### 8.3 Animations & Transitions

- [ ] Implement view switch animation (crossfade + directional slide via AnimatePresence)
- [ ] Implement modal open animation (scale from click origin)
- [ ] Implement task check-off animation (strikethrough + fade)
- [ ] Implement sidebar collapse animation (width transition)
- [ ] Implement staggered page load reveal
- [ ] Implement toast slide-in animation
- [ ] All animations: verify they respect `prefers-reduced-motion`

### 8.4 Error Handling & Edge Cases

- [ ] Add React error boundaries per route (show "Something went wrong" + retry button)
- [ ] Handle network offline gracefully (show banner, disable mutations, auto-retry when online)
- [ ] Handle API rate limiting (show toast with retry-after time)
- [ ] Handle session expiration mid-session (401 → redirect to login with "session expired" message)
- [ ] Handle concurrent edits (SSE updates invalidate stale data, show toast if conflict)
- [ ] Handle very long event titles (truncate with ellipsis in pills/blocks)
- [ ] Handle overlapping events in week/day view (column stacking algorithm)
- [ ] Handle timezone changes (user changes timezone in settings → re-render all times)
- [ ] Handle daylight saving time transitions (events near DST boundary)

### 8.5 Loading & Empty States

- [ ] Skeleton screens for: calendar grid (month), week time grid, task panel, agenda list
- [ ] Empty states for:
  - [ ] No events this month: illustration + "Create your first event" CTA
  - [ ] No tasks: illustration + "Add a task" CTA
  - [ ] No search results: "No results for '{query}'"
  - [ ] No categories (shouldn't happen — always has default): fallback message
- [ ] Loading spinners for: individual mutations, OAuth redirects
- [ ] Full-page loading for: initial auth check only

---

## Phase 9: Testing & Quality Assurance (Week 11-12)

> Goal: Comprehensive test coverage, all P0/P1 E2E scenarios passing.

### 9.1 Unit Test Coverage

- [ ] Recurrence expansion (all frequency types, intervals, end conditions, edge cases)
- [ ] Date utility functions (timezone conversions, range calculations, overlap detection, DST)
- [ ] Zustand store actions (calendar store, UI store)
- [ ] Zod schema validation (valid + invalid inputs for all schemas)
- [ ] Event service (CRUD, ownership, recurrence scope handling)
- [ ] Task service (CRUD, toggle, reorder, ownership)
- [ ] Category service (CRUD, default protection, reassignment)
- [ ] Reminder service (create, compute triggerAt, re-enqueue missed)
- [ ] Search service (full-text ranking, edge cases)
- [ ] Auth service (signup, login, lockout, password reset)
- [ ] Password strength validation
- [ ] RRULE string validation and parsing
- [ ] Verify > 80% coverage on services/ and lib/

### 9.2 Integration Test Coverage

- [ ] Event creation form (all fields, validation, submission)
- [ ] Event edit form (pre-populated, scope dialog for recurring)
- [ ] Task creation and edit form
- [ ] Task toggle (check/uncheck) flow
- [ ] Calendar navigation (all views, date changes)
- [ ] Search modal (query, results, navigation)
- [ ] Auth forms (login, signup, forgot password, reset password)
- [ ] Quick create popover (create event/task, "more options")
- [ ] Category management (create, edit, delete with reassignment)
- [ ] Recurrence builder (all presets, custom builder)
- [ ] Verify > 70% coverage on components/

### 9.3 API Integration Tests

- [ ] Auth flow: signup → login → protected access → logout
- [ ] Auth flow: OAuth mock (Google + GitHub)
- [ ] Auth flow: password reset (request → reset → login with new password)
- [ ] Auth flow: account lockout after 5 failed attempts
- [ ] Event CRUD: create → read → update → delete
- [ ] Event recurrence: create → expand → edit instance → edit following → edit all → delete
- [ ] Task CRUD: create → read → toggle → reorder → delete
- [ ] Category CRUD: create → assign to event → update → delete → verify reassignment
- [ ] Reminder: create → verify BullMQ job scheduled → delete → verify job cancelled
- [ ] Search: create events + tasks → search → verify results
- [ ] Rate limiting: exceed limit → verify 429 response → verify Retry-After header
- [ ] Authorization: attempt to access another user's resource → verify 403/404
- [ ] Input validation: send invalid data → verify 400 with details

### 9.4 E2E Tests (Playwright)

- [ ] **P0 — Critical path**:
  - [ ] Signup → create first event → view in month view → verify event pill appears
  - [ ] Login → logout → login again → verify session
  - [ ] Create recurring event → edit single instance → verify series intact
  - [ ] Create task → check off → verify in done filter
- [ ] **P1 — Core features**:
  - [ ] Drag event to new time slot in week view → verify updated
  - [ ] Cmd+K search → type query → arrow to result → Enter → verify navigation
  - [ ] Create reminder → wait for trigger → verify in-app toast
  - [ ] Mobile viewport: agenda view navigation + task panel toggle
  - [ ] OAuth login flow (mocked provider)
  - [ ] Password reset flow (mocked email)
- [ ] **P2 — Edge cases**:
  - [ ] Category create → assign to event → delete category → verify event reassigned
  - [ ] Keyboard-only flow: navigate calendar, create event, complete task (no mouse)
  - [ ] Resize event duration by dragging edge in week view
  - [ ] Quick create from time slot click → Enter to save → verify event appears
  - [ ] All keyboard shortcuts work correctly

### 9.5 Cross-Browser Testing

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

---

## Phase 10: Deployment & Launch (Week 12)

> Goal: Production deployment, monitoring, documentation, launch readiness.

### 10.1 Production Environment Setup

- [ ] Set up Railway project (API + PostgreSQL + Redis)
- [ ] Set up Vercel project (frontend)
- [ ] Configure custom domain (calley.app or chosen domain):
  - [ ] DNS records for frontend (Vercel)
  - [ ] DNS records for API subdomain (api.calley.app → Railway)
  - [ ] SSL certificates (auto via Vercel + Railway)
- [ ] Configure all production environment variables in Railway
- [ ] Configure all production environment variables in Vercel
- [ ] Verify CORS origin matches production frontend URL
- [ ] Verify cookie domain matches production domain

### 10.2 Database Production Setup

- [ ] Run all migrations on production database
- [ ] Verify indexes are created and functional
- [ ] Create initial seed data (if needed — e.g., system defaults)
- [ ] Enable automated daily backups on Railway
- [ ] Test backup restoration procedure

### 10.3 Docker Production Build

- [ ] Build and test production Docker images locally
- [ ] Verify `docker compose up` works with production `.env`
- [ ] Tag and push images to container registry (GitHub Container Registry or Docker Hub)
- [ ] Document Docker deployment procedure in README
- [ ] Test self-hosted deployment on a VPS (DigitalOcean/Hetzner)

### 10.4 Monitoring Setup

- [ ] Verify structured logs are captured in Railway
- [ ] Set up alerts for: high error rate (5xx > 1%), high latency (p95 > 500ms)
- [ ] Configure Sentry (optional): set SENTRY_DSN in production
- [ ] Verify health check endpoints are being polled
- [ ] Test graceful shutdown (deploy a new version → verify zero-downtime)

### 10.5 Security Checklist

- [ ] Verify all environment variables are set (no defaults in production)
- [ ] Verify SESSION_SECRET is cryptographically random, ≥ 32 chars
- [ ] Verify VAPID keys are generated and consistent
- [ ] Verify CORS origin is exact match (no wildcards)
- [ ] Verify rate limiting is active on all endpoints
- [ ] Verify CSRF protection is active on state-changing endpoints
- [ ] Verify security headers are present in responses (CSP, HSTS, X-Frame-Options, etc.)
- [ ] Verify cookies have Secure, HttpOnly, SameSite flags
- [ ] Verify no sensitive data in logs (grep for passwords, tokens, secrets)
- [ ] Verify password reset doesn't leak email existence
- [ ] Verify account lockout works
- [ ] Run `pnpm audit` — resolve any critical/high vulnerabilities
- [ ] Enable Dependabot on GitHub repository

### 10.6 Performance Validation

- [ ] Run Lighthouse on production:
  - [ ] Performance score > 90
  - [ ] Accessibility score > 95
  - [ ] Best practices score > 95
- [ ] Verify initial bundle size < 150KB gzipped
- [ ] Verify API response times < 150ms (p95) under load
- [ ] Verify calendar renders at 60fps with 100 events

### 10.7 CI/CD Pipeline Verification

- [ ] Verify CI runs on every PR (lint + type-check + tests + build)
- [ ] Verify preview deployments work for PRs
- [ ] Verify production deployment triggers on `main` push
- [ ] Verify migrations run automatically on deploy
- [ ] Verify rollback procedure works (revert to previous Railway deployment)

### 10.8 Documentation

- [ ] Finalize README.md:
  - [ ] Project overview and screenshots
  - [ ] Tech stack summary
  - [ ] Prerequisites (Node 22, pnpm, Docker)
  - [ ] Quick start (local development)
  - [ ] Docker self-hosting guide
  - [ ] Environment variables reference
  - [ ] Available scripts
  - [ ] Architecture overview
  - [ ] Contributing guidelines
- [ ] Add `CHANGELOG.md` with v1.0.0 entry
- [ ] Add `LICENSE` file
- [ ] Verify all `.env.example` files are accurate and complete
- [ ] Document API endpoints (auto-generate from Zod schemas or create OpenAPI spec)

---

## Post-Launch Checklist

> Verify within 48 hours of launch:

- [ ] Sign up flow works end-to-end (email + Google + GitHub)
- [ ] Event CRUD works in all views
- [ ] Recurring events expand correctly
- [ ] Task panel works, check/uncheck persists
- [ ] Search returns relevant results
- [ ] Reminders fire (push + email + in-app)
- [ ] SSE reconnects after network blip
- [ ] Mobile experience is usable
- [ ] No errors in Sentry / logs
- [ ] Backup runs successfully
- [ ] Rate limiting prevents abuse
- [ ] No security headers missing

---

*Last updated: February 2026*
