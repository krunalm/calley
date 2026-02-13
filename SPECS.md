# Calley — Production Specification v2.0

> A modern, secure, full-featured calendar application for managing events, tasks, and recurring schedules.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Security Architecture](#4-security-architecture)
5. [Features & Functional Requirements](#5-features--functional-requirements)
6. [Data Models](#6-data-models)
7. [Database Design](#7-database-design)
8. [UI/UX Specification](#8-uiux-specification)
9. [Component Tree](#9-component-tree)
10. [State Management](#10-state-management)
11. [Routing](#11-routing)
12. [API Design](#12-api-design)
13. [Authentication & Authorization](#13-authentication--authorization)
14. [Notifications & Reminders](#14-notifications--reminders)
15. [Error Handling & Logging](#15-error-handling--logging)
16. [Accessibility](#16-accessibility)
17. [Performance Targets](#17-performance-targets)
18. [Testing Strategy](#18-testing-strategy)
19. [Deployment & Infrastructure](#19-deployment--infrastructure)
20. [Monitoring & Observability](#20-monitoring--observability)
21. [Backup & Disaster Recovery](#21-backup--disaster-recovery)
22. [Environment Configuration](#22-environment-configuration)
23. [Future Enhancements](#23-future-enhancements)

---

## 1. Project Overview

**Calley** is a web-based calendar application that enables users to create, manage, and organize events, one-off tasks, and recurring tasks in a clean, fast interface. It supports multiple calendar views, drag-and-drop scheduling, and a flexible recurrence engine.

### Goals

- Provide a unified workspace for time-blocked events and task management.
- Support flexible recurrence rules (daily, weekly, monthly, custom RRULE per RFC 5545).
- Deliver a responsive, accessible UI that works across desktop and mobile.
- Offer real-time sync across tabs/devices via Server-Sent Events (SSE).
- Maintain production-grade security posture (OWASP Top 10 mitigated).
- Support both managed (Railway/Vercel) and self-hosted (Docker) deployments.

### Non-Goals (v1)

- Native mobile apps (iOS/Android).
- Team collaboration / shared calendars (planned for v2).
- Video conferencing integrations.
- Offline support / Service Worker (planned for v2).
- CalDAV / Google Calendar sync (planned for v2).

### Target Users

- Individual professionals managing personal and work schedules.
- Freelancers needing unified event + task tracking.
- Power users who want keyboard-driven calendar interaction.

---

## 2. Tech Stack

### Frontend

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Framework | React | 18.x | Concurrent rendering, mature ecosystem |
| Language | TypeScript | 5.x | Type safety, better DX |
| Build Tool | Vite | 5.x | Fast HMR, ESM-native |
| Styling | Tailwind CSS | v4 | Utility-first, design tokens |
| Component Library | shadcn/ui | latest | Accessible, headless, composable (Radix-based) |
| State Management | Zustand | 4.x | Lightweight, minimal boilerplate |
| Server State | TanStack Query | v5 | Cache, sync, background refetch |
| Routing | TanStack Router | latest | Type-safe routes, file-based |
| Forms | React Hook Form + Zod | latest | Performant, schema-validated |
| Date/Time | date-fns + date-fns-tz | latest | Tree-shakeable, timezone-aware |
| Recurrence Engine | rrule.js | latest | RFC 5545 RRULE support |
| Drag & Drop | @dnd-kit/core | latest | Accessible, customizable |
| Rich Text | Tiptap | v2 | Headless, extensible (bold/italic/links only) |
| Animations | Framer Motion | latest | Layout animations, page transitions |
| Icons | Lucide React | latest | Consistent icon set |
| Virtualization | @tanstack/react-virtual | latest | Virtual scrolling for agenda/task lists |
| Testing | Vitest + React Testing Library | latest | Fast unit + integration tests |
| E2E Testing | Playwright | latest | Cross-browser E2E |

### Backend

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | Latest LTS, performance improvements |
| Framework | Hono | 4.x | Lightweight, edge-ready, middleware ecosystem |
| ORM | Drizzle ORM | latest | Type-safe, SQL-first, lightweight |
| Database | PostgreSQL | 16 | Mature, JSONB support, full-text search |
| Auth | Lucia Auth | v3 | Session-based, adapter ecosystem |
| OAuth | Arctic.js | latest | OAuth 2.0 providers (Google, GitHub) |
| Real-time | Server-Sent Events (SSE) | native | Simpler than WebSocket for unidirectional updates |
| Job Queue | BullMQ | latest | Delayed jobs, retries, dashboard |
| Cache/Queue | Redis | 7.x | BullMQ backend, rate limiting, session cache |
| Email | Resend | latest | Transactional email, templates |
| Web Push | web-push | latest | VAPID-based push notifications |
| Logging | Pino | latest | Structured JSON logging, high performance |
| Validation | Zod | latest | Shared schemas between frontend/backend |
| Password | argon2 | latest | Memory-hard hashing (superior to bcrypt) |
| CUID | @paralleldrive/cuid2 | latest | Collision-resistant, sortable IDs |

### Monorepo & Tooling

| Tool | Purpose |
|---|---|
| Turborepo | Monorepo build orchestration |
| pnpm | Package management (strict, fast) |
| ESLint + Prettier | Linting + formatting |
| Husky + lint-staged | Pre-commit hooks |
| GitHub Actions | CI/CD pipeline |
| Docker + Docker Compose | Containerized deployment option |

---

## 3. Architecture

### System Diagram

```
                              ┌────────────────┐
                              │   CDN / Vercel  │
                              │  (Static SPA)   │
                              └───────┬────────┘
                                      │ HTTPS
                              ┌───────▼────────┐
                              │   API Gateway   │
                              │  (Hono on Node) │
                              │                 │
                              │ ┌─────────────┐ │
                              │ │  Middleware  │ │
                              │ │  Pipeline    │ │
                              │ │             │ │
                              │ │ • CORS      │ │
                              │ │ • Helmet    │ │
                              │ │ • Rate Limit│ │
                              │ │ • Auth      │ │
                              │ │ • Validate  │ │
                              │ │ • Log       │ │
                              │ └─────────────┘ │
                              └──┬──────────┬───┘
                                 │          │
                    ┌────────────▼──┐  ┌────▼───────────────┐
                    │  PostgreSQL   │  │   Redis             │
                    │               │  │                     │
                    │ • Users       │  │ • BullMQ queues     │
                    │ • Events      │  │ • Rate limit store  │
                    │ • Tasks       │  │ • SSE pub/sub       │
                    │ • Sessions    │  │                     │
                    │ • Categories  │  │                     │
                    │ • Reminders   │  │                     │
                    │ • Audit Log   │  │                     │
                    └───────────────┘  └─────────────────────┘
```

### Folder Structure

```
calley/
├── apps/
│   ├── web/                          # React frontend (Vite)
│   │   ├── public/
│   │   │   └── sw.js                 # Service worker (push notifications only)
│   │   ├── src/
│   │   │   ├── routes/               # TanStack Router file-based routes
│   │   │   │   ├── _auth/            # Unauthenticated routes
│   │   │   │   │   ├── login.tsx
│   │   │   │   │   ├── signup.tsx
│   │   │   │   │   ├── forgot-password.tsx
│   │   │   │   │   └── reset-password.tsx
│   │   │   │   └── _app/             # Authenticated shell
│   │   │   │       ├── __layout.tsx
│   │   │   │       ├── index.tsx
│   │   │   │       ├── calendar/
│   │   │   │       │   ├── index.tsx
│   │   │   │       │   └── $date.tsx
│   │   │   │       └── settings/
│   │   │   │           ├── index.tsx
│   │   │   │           ├── profile.tsx
│   │   │   │           ├── calendars.tsx
│   │   │   │           └── notifications.tsx
│   │   │   ├── components/
│   │   │   │   ├── calendar/         # Calendar view components
│   │   │   │   │   ├── MonthView.tsx
│   │   │   │   │   ├── WeekView.tsx
│   │   │   │   │   ├── DayView.tsx
│   │   │   │   │   ├── AgendaView.tsx
│   │   │   │   │   ├── MiniCalendar.tsx
│   │   │   │   │   ├── TimeGrid.tsx
│   │   │   │   │   ├── DayCell.tsx
│   │   │   │   │   ├── EventPill.tsx
│   │   │   │   │   ├── EventBlock.tsx
│   │   │   │   │   ├── TaskPill.tsx
│   │   │   │   │   └── TaskMarker.tsx
│   │   │   │   ├── events/           # Event form, event card
│   │   │   │   │   ├── EventDrawer.tsx
│   │   │   │   │   ├── EventDetailPopover.tsx
│   │   │   │   │   ├── QuickCreatePopover.tsx
│   │   │   │   │   └── RecurrenceBuilder.tsx
│   │   │   │   ├── tasks/            # Task list, task item
│   │   │   │   │   ├── TaskPanel.tsx
│   │   │   │   │   ├── TaskDrawer.tsx
│   │   │   │   │   ├── TaskItem.tsx
│   │   │   │   │   ├── TaskGroup.tsx
│   │   │   │   │   └── TaskFilter.tsx
│   │   │   │   ├── layout/           # Shell components
│   │   │   │   │   ├── Layout.tsx
│   │   │   │   │   ├── Topbar.tsx
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── ViewSwitcher.tsx
│   │   │   │   │   └── UserMenu.tsx
│   │   │   │   ├── search/
│   │   │   │   │   └── SearchModal.tsx
│   │   │   │   ├── auth/
│   │   │   │   │   ├── LoginForm.tsx
│   │   │   │   │   ├── SignupForm.tsx
│   │   │   │   │   ├── ForgotPasswordForm.tsx
│   │   │   │   │   ├── ResetPasswordForm.tsx
│   │   │   │   │   └── OAuthButtons.tsx
│   │   │   │   └── ui/               # shadcn/ui primitives
│   │   │   ├── stores/               # Zustand stores
│   │   │   │   ├── calendar-store.ts
│   │   │   │   └── ui-store.ts
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   │   ├── use-events.ts
│   │   │   │   ├── use-tasks.ts
│   │   │   │   ├── use-categories.ts
│   │   │   │   ├── use-sse.ts
│   │   │   │   ├── use-keyboard-shortcuts.ts
│   │   │   │   └── use-push-notifications.ts
│   │   │   ├── lib/                  # Utilities
│   │   │   │   ├── api-client.ts     # Fetch wrapper with auth, error handling
│   │   │   │   ├── date-utils.ts
│   │   │   │   ├── rrule-utils.ts
│   │   │   │   ├── query-keys.ts
│   │   │   │   └── constants.ts
│   │   │   ├── types/                # Frontend-specific types
│   │   │   └── styles/
│   │   │       └── globals.css
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── tsconfig.json
│   │
│   └── api/                          # Hono backend
│       ├── src/
│       │   ├── index.ts              # App entry point
│       │   ├── app.ts                # Hono app factory
│       │   ├── routes/               # Route handlers
│       │   │   ├── auth.routes.ts
│       │   │   ├── events.routes.ts
│       │   │   ├── tasks.routes.ts
│       │   │   ├── categories.routes.ts
│       │   │   ├── reminders.routes.ts
│       │   │   ├── search.routes.ts
│       │   │   ├── stream.routes.ts  # SSE
│       │   │   └── health.routes.ts
│       │   ├── db/
│       │   │   ├── schema.ts         # Drizzle schema
│       │   │   ├── migrations/       # Drizzle migrations
│       │   │   ├── index.ts          # DB connection + pool
│       │   │   └── seed.ts           # Dev seed data
│       │   ├── services/             # Business logic
│       │   │   ├── auth.service.ts
│       │   │   ├── event.service.ts
│       │   │   ├── task.service.ts
│       │   │   ├── category.service.ts
│       │   │   ├── reminder.service.ts
│       │   │   ├── recurrence.service.ts
│       │   │   ├── search.service.ts
│       │   │   ├── sse.service.ts
│       │   │   └── email.service.ts
│       │   ├── jobs/                 # BullMQ job definitions
│       │   │   ├── reminder.job.ts
│       │   │   ├── email.job.ts
│       │   │   └── cleanup.job.ts    # Expired session/token cleanup
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts
│       │   │   ├── rate-limit.middleware.ts
│       │   │   ├── validate.middleware.ts
│       │   │   ├── error-handler.middleware.ts
│       │   │   ├── security-headers.middleware.ts
│       │   │   ├── request-id.middleware.ts
│       │   │   └── logger.middleware.ts
│       │   ├── lib/
│       │   │   ├── lucia.ts          # Lucia auth config
│       │   │   ├── redis.ts          # Redis client
│       │   │   ├── logger.ts         # Pino logger instance
│       │   │   ├── email.ts          # Resend client
│       │   │   └── constants.ts
│       │   └── types/
│       │       └── hono.d.ts         # Hono context type extensions
│       ├── drizzle.config.ts
│       ├── tsconfig.json
│       └── Dockerfile
│
├── packages/
│   └── shared/                       # Shared between frontend & backend
│       ├── src/
│       │   ├── schemas/              # Zod schemas (source of truth)
│       │   │   ├── event.schema.ts
│       │   │   ├── task.schema.ts
│       │   │   ├── category.schema.ts
│       │   │   ├── reminder.schema.ts
│       │   │   ├── auth.schema.ts
│       │   │   └── common.schema.ts
│       │   ├── types/                # Inferred TS types from Zod
│       │   │   └── index.ts
│       │   └── constants/
│       │       ├── priorities.ts
│       │       ├── statuses.ts
│       │       └── colors.ts
│       ├── tsconfig.json
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml            # Full stack for self-hosting
│   ├── docker-compose.dev.yml        # Dev environment
│   ├── nginx.conf                    # Reverse proxy config
│   └── .env.example
│
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint → type-check → test → build
│       ├── deploy-preview.yml        # PR preview deployments
│       └── deploy-production.yml     # Main branch → production
│
├── turbo.json
├── pnpm-workspace.yaml
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
└── README.md
```

---

## 4. Security Architecture

### 4.1 OWASP Top 10 Mitigation

| Threat | Mitigation |
|---|---|
| **A01 – Broken Access Control** | All API routes validate `userId` from session; no IDOR possible. Row-level ownership checks in every service method. |
| **A02 – Cryptographic Failures** | Passwords hashed with Argon2id (memory: 64MB, iterations: 3, parallelism: 4). All secrets via environment variables; never logged. TLS enforced. |
| **A03 – Injection** | Drizzle ORM parameterized queries (no raw SQL). All input validated through Zod schemas. HTML sanitized via DOMPurify on Tiptap output before storage. |
| **A04 – Insecure Design** | Rate limiting on all endpoints. Account lockout after failed attempts. CSRF protection on state-changing operations. |
| **A05 – Security Misconfiguration** | Security headers via middleware (Helmet-equivalent). CORS restricted to allowed origins. Debug mode disabled in production. |
| **A06 – Vulnerable Components** | Dependabot enabled. `pnpm audit` in CI. Lock file committed. |
| **A07 – Auth Failures** | Session-based auth (no JWT for session). Session rotation on login. Secure cookie flags. Brute-force protection. |
| **A08 – Data Integrity** | All inputs validated with Zod. CSRF double-submit cookie. Content-Type enforcement. |
| **A09 – Logging Failures** | Structured logging (Pino) for all auth events, errors, and security-relevant actions. No PII in logs. |
| **A10 – SSRF** | No user-supplied URLs are fetched server-side. Location field is plain text only. |

### 4.2 Security Headers

Applied to all responses via `security-headers.middleware.ts`:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' {API_URL}; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### 4.3 Rate Limiting

Implemented via Redis sliding window (`rate-limit.middleware.ts`):

| Endpoint Group | Limit | Window | Key |
|---|---|---|---|
| `POST /auth/login` | 5 attempts | 15 minutes | IP address |
| `POST /auth/signup` | 3 requests | 1 hour | IP address |
| `POST /auth/forgot-password` | 3 requests | 1 hour | IP address |
| `POST /auth/reset-password` | 5 requests | 1 hour | IP + token |
| General authenticated API | 100 requests | 1 minute | User ID |
| SSE `/stream` | 5 connections | per user | User ID |
| Search `/search` | 30 requests | 1 minute | User ID |

When rate limited, respond with `429 Too Many Requests` and `Retry-After` header.

### 4.4 Account Security

- **Account lockout**: After 5 failed login attempts within 15 minutes, lock account for 30 minutes. Send email notification on lockout.
- **Password policy (NIST 800-63B aligned)**:
  - Minimum 8 characters.
  - Maximum 128 characters.
  - No composition rules (uppercase/symbol requirements removed per NIST guidance).
  - Checked against list of 100,000 breached passwords (via `zxcvbn` strength estimator on frontend + backend).
  - No periodic forced rotation.
- **Session management**:
  - Session token: 256-bit cryptographically random, stored in PostgreSQL.
  - Session lifetime: 30 days (absolute), 7 days (idle timeout).
  - Session rotation: Generate new session token on login success.
  - Concurrent sessions: Allowed (max 10 per user), viewable in settings.
  - Session revocation: Logout invalidates current session; "Sign out all devices" option available.
- **Password reset**:
  - Token: 256-bit random, stored hashed (SHA-256) in DB.
  - Expiry: 1 hour.
  - Single use: Deleted after successful reset.
  - Always respond with the same message ("If that email exists, we sent a reset link") to prevent user enumeration.

### 4.5 Input Validation & Sanitization

- All request bodies, query params, and path params validated via Zod schemas (defined in `packages/shared`).
- String fields have maximum length constraints.
- HTML content from Tiptap rich text editor is sanitized with DOMPurify (server-side via `isomorphic-dompurify`) before storage. Only `<b>`, `<i>`, `<em>`, `<strong>`, `<a>`, `<p>`, `<br>`, `<ul>`, `<ol>`, `<li>` tags allowed.
- RRULE strings validated against RFC 5545 syntax before storage.
- Color values validated as hex format (`/^#[0-9a-fA-F]{6}$/`).
- Email addresses validated with Zod email + normalized to lowercase.
- Timezone strings validated against IANA timezone database.

### 4.6 CORS Policy

```typescript
{
  origin: [process.env.FRONTEND_URL],  // Exact match, no wildcards in production
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400,
}
```

### 4.7 CSRF Protection

- Double-submit cookie pattern.
- On session creation, set `csrf_token` as a separate cookie (`HttpOnly: false`, `SameSite: Strict`).
- Frontend reads the cookie and sends it as `X-CSRF-Token` header on all state-changing requests (POST, PATCH, DELETE).
- Backend middleware validates the header matches the cookie value.
- SSE GET endpoint is exempt.

---

## 5. Features & Functional Requirements

### 5.1 Calendar Views

| View | Description |
|---|---|
| **Month** | Grid showing all days of the month; event pills per day. Max 3 visible per cell with "+N more" overflow. |
| **Week** | 7-day time-column grid; 30-minute slots. Draggable, resizable time blocks. |
| **Day** | Single-day time grid; 30-minute slots. Same interaction as week view. |
| **Agenda** | Chronological virtual-scrolled list of upcoming events & tasks. Grouped by date. |
| **Mini Calendar** | Sidebar month picker for navigation; dots indicate days with events. |

**Behaviors:**
- Navigate forward/backward with keyboard arrows or header chevron buttons.
- "Today" button always jumps to the current date.
- Events and tasks are color-coded by calendar category.
- Clicking an empty slot opens the Quick Create popover pre-populated with the clicked time.
- Current time indicator (red line) shown in Week and Day views, updated every minute.
- View selection and current date are persisted in URL search params for shareable state.

### 5.2 Events

An **Event** is a time-bounded occurrence with a defined start and end.

**Create / Edit Fields:**
- **Title** — required, max 200 characters.
- **Start date + time** — required.
- **End date + time** — required, must be after start. Max duration: 7 days.
- **All-day toggle** — hides time pickers, stores as midnight-to-midnight UTC.
- **Description** — optional rich text (Tiptap: bold, italic, links only). Max 5,000 characters (rendered).
- **Location** — optional free-text, max 500 characters.
- **Color** — optional hex color override (defaults to category color).
- **Calendar category** — required, defaults to user's default category.
- **Reminder** — optional, preset: 0/5/15/30/60/1440 minutes before. Custom input allowed.
- **Recurrence** — see §5.4.
- **Visibility** — `public` or `private` (default: `private`). Relevant for future shared calendars.

**Actions:**
- Drag to reschedule (week/day view). Optimistic UI with rollback.
- Drag edge to resize duration (week/day view). Snap to 15-minute increments.
- Duplicate event (creates a new standalone event with same fields).
- Delete with scope: `this instance` / `this and following` / `all in series`.
- Export as `.ics` file (single event download).

### 5.3 Tasks

A **Task** is a to-do item optionally anchored to a date with no fixed end time.

**Create / Edit Fields:**
- **Title** — required, max 200 characters.
- **Due date** — optional.
- **Due time** — optional (if set, shows in day/week time grid as a marker).
- **Description** — optional plain text, max 2,000 characters.
- **Priority** — `none` / `low` / `medium` / `high`. Default: `none`.
- **Status** — `todo` / `in_progress` / `done`. Default: `todo`.
- **Calendar category** — required, defaults to user's default category.
- **Reminder** — optional, same presets as events.
- **Recurrence** — see §5.4.

**Actions:**
- Check off (mark complete) directly from any calendar view or task panel. Sets `status: done` and `completedAt`.
- Uncheck to reopen (sets `status: todo`, clears `completedAt`).
- Drag to a different due date (month/week view).
- Filter by priority, status, or date range.
- Bulk complete / bulk delete (with confirmation dialog).

**Task Panel:**
- Slide-in right sidebar (300px) listing all tasks grouped by: **Today** / **Overdue** / **Upcoming** / **No Date**.
- Tasks can be reordered via drag-and-drop within groups (persisted `sortOrder`).
- Toggle panel with toolbar button or keyboard shortcut `T`.

### 5.4 Recurring Items

Both Events and Tasks support recurrence using **RFC 5545 RRULE**.

**Preset Options (UI dropdown):**
- Does not repeat
- Every day
- Every weekday (Mon–Fri)
- Every weekend (Sat–Sun)
- Every week on [selected days]
- Every month on the Nth day (e.g., "15th of every month")
- Every month on the Nth weekday (e.g., "2nd Tuesday")
- Every year on [month + day]
- Custom → opens Advanced Recurrence Builder

**Advanced Recurrence Builder:**
- Frequency: Daily / Weekly / Monthly / Yearly
- Interval: every N [days/weeks/months/years] (max: 99)
- Day selector (for weekly frequency)
- Month day or weekday position selector (for monthly)
- End condition:
  - Never (no limit — internally capped at 1,000 occurrences for expansion)
  - After N occurrences (max: 999)
  - On date (must be after start date)

**Recurrence Edit Scope (when editing a recurring item):**
- **This event only** — creates a standalone exception; adds original date to parent's `exDates`.
- **This and all following events** — splits the series. Original series gets `UNTIL` set. New series created for the rest.
- **All events in the series** — updates the parent record directly.

**Display:**
- Recurring items show a loop icon (↻) indicator on pills/blocks.
- Exceptions (moved/deleted instances) are tracked independently via `exDates` array and exception records.

**Storage model:**
- The parent record stores the RRULE string and base event data.
- Instances are expanded on-the-fly server-side per query date range using `rrule.js`.
- Exceptions (single-instance edits) are stored as separate records with `recurringEventId` pointing to the parent and `originalDate` recording which occurrence they replace.

### 5.5 Calendar Management

- Create multiple **Calendar Categories** (e.g., Work, Personal, Health).
- Each category has a name (max 50 characters) + hex color.
- Toggle visibility per category (client-side only — still fetched from API).
- Default "Personal" calendar pre-created on signup (non-deletable).
- Delete category: moves all events/tasks to default category (with confirmation).
- Max 20 categories per user.

### 5.6 Search

- Global search triggered by `Cmd/Ctrl + K`.
- Full-text search across event titles, task titles, and descriptions using PostgreSQL `tsvector` + `tsquery`.
- Results grouped by type (Events, Tasks), sorted by date proximity to current date.
- Max 20 results returned.
- Click result to navigate to the item's date on the calendar and open the detail popover.
- Search input debounced (300ms).

### 5.7 Quick Create

- Click any empty time slot in Month/Week/Day views → inline popover.
- Fields: Title (auto-focused) + start/end time (pre-populated from clicked slot).
- Type selector: Event (default) or Task.
- Hit Enter to save instantly via optimistic mutation.
- "More options" link opens the full Event/Task drawer with fields populated.

### 5.8 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Open search |
| `C` | Quick create event (on current selected date) |
| `T` | Toggle task panel |
| `M` / `W` / `D` / `A` | Switch to Month / Week / Day / Agenda view |
| `←` / `→` | Navigate previous / next (period depends on view) |
| `.` or `Home` | Go to today |
| `Escape` | Close modal/drawer/popover |
| `Delete/Backspace` | Delete selected item (with confirmation) |

Keyboard shortcuts are disabled when a text input/textarea is focused. All shortcuts displayed in a help modal accessible via `?` key.

---

## 6. Data Models

### 6.1 User

```typescript
type User = {
  id:            string;         // CUID2
  email:         string;         // unique, lowercase, max 254 chars
  passwordHash:  string | null;  // null for OAuth-only users
  name:          string;         // max 100 chars
  avatarUrl:     string | null;
  timezone:      string;         // IANA timezone, e.g. "America/New_York"
  weekStart:     0 | 1;          // 0 = Sunday, 1 = Monday
  timeFormat:    '12h' | '24h';
  lockedUntil:   Date | null;    // account lockout timestamp
  failedLogins:  number;         // reset on successful login
  createdAt:     Date;
  updatedAt:     Date;
};
```

### 6.2 OAuthAccount

```typescript
type OAuthAccount = {
  id:            string;         // CUID2
  userId:        string;         // FK → User
  provider:      'google' | 'github';
  providerAccountId: string;     // external ID from provider
  createdAt:     Date;
};
```

### 6.3 Session

```typescript
type Session = {
  id:            string;         // 256-bit random token (hashed in DB)
  userId:        string;         // FK → User
  userAgent:     string | null;  // for "manage sessions" UI
  ipAddress:     string | null;  // hashed for privacy
  expiresAt:     Date;           // absolute expiry
  lastActiveAt:  Date;           // for idle timeout
  createdAt:     Date;
};
```

### 6.4 CalendarCategory

```typescript
type CalendarCategory = {
  id:         string;           // CUID2
  userId:     string;           // FK → User
  name:       string;           // max 50 chars
  color:      string;           // hex color, validated
  isDefault:  boolean;          // exactly one per user
  visible:    boolean;          // client-side visibility toggle
  sortOrder:  number;
  createdAt:  Date;
  updatedAt:  Date;
};
```

### 6.5 Event

```typescript
type Event = {
  id:              string;
  userId:          string;
  categoryId:      string;
  title:           string;         // max 200 chars
  description:     string | null;  // sanitized HTML, max 5000 chars
  location:        string | null;  // max 500 chars
  startAt:         Date;           // stored as UTC
  endAt:           Date;           // stored as UTC
  isAllDay:        boolean;
  color:           string | null;  // hex override
  visibility:      'public' | 'private';

  // Recurrence (parent event)
  rrule:           string | null;  // RFC 5545 RRULE string
  exDates:         Date[];         // excluded occurrence dates

  // Recurrence (exception instance)
  recurringEventId: string | null; // FK → Event (parent series)
  originalDate:     Date | null;   // the occurrence date this exception replaces

  createdAt:       Date;
  updatedAt:       Date;
  deletedAt:       Date | null;    // soft delete
};
```

### 6.6 Task

```typescript
type Task = {
  id:              string;
  userId:          string;
  categoryId:      string;
  title:           string;         // max 200 chars
  description:     string | null;  // plain text, max 2000 chars
  dueAt:           Date | null;    // full datetime in UTC, null = no due date
  priority:        'none' | 'low' | 'medium' | 'high';
  status:          'todo' | 'in_progress' | 'done';
  completedAt:     Date | null;

  // Recurrence
  rrule:           string | null;
  exDates:         Date[];
  recurringTaskId: string | null;
  originalDate:    Date | null;

  sortOrder:       number;         // for manual reordering in task panel
  createdAt:       Date;
  updatedAt:       Date;
  deletedAt:       Date | null;    // soft delete
};
```

### 6.7 Reminder

```typescript
type Reminder = {
  id:            string;
  userId:        string;
  itemType:      'event' | 'task';
  itemId:        string;
  minutesBefore: number;           // 0 = at time, 5, 15, 30, 60, 1440, or custom
  method:        'push' | 'email' | 'both';
  triggerAt:     Date;             // computed: item start/due - minutesBefore
  sentAt:        Date | null;      // null until delivered
  createdAt:     Date;
};
```

### 6.8 UserPushSubscription

```typescript
type UserPushSubscription = {
  id:            string;
  userId:        string;
  endpoint:      string;          // Push API endpoint URL
  p256dh:        string;          // Public key
  auth:          string;          // Auth secret
  userAgent:     string | null;   // device identification
  createdAt:     Date;
};
```

### 6.9 PasswordResetToken

```typescript
type PasswordResetToken = {
  id:           string;
  userId:       string;
  tokenHash:    string;          // SHA-256 hash of the actual token
  expiresAt:    Date;            // 1 hour from creation
  usedAt:       Date | null;
  createdAt:    Date;
};
```

### 6.10 AuditLog

```typescript
type AuditLog = {
  id:           string;
  userId:       string | null;   // null for unauthenticated events (failed logins)
  action:       string;          // e.g., 'user.login', 'user.login.failed', 'event.created'
  entityType:   string | null;   // 'event', 'task', 'category', etc.
  entityId:     string | null;
  metadata:     Record<string, unknown> | null;  // additional context (no PII)
  ipAddress:    string | null;   // hashed
  userAgent:    string | null;
  createdAt:    Date;
};
```

---

## 7. Database Design

### 7.1 Indexes

```sql
-- Users
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- OAuth Accounts
CREATE UNIQUE INDEX idx_oauth_provider_id ON oauth_accounts (provider, provider_account_id);
CREATE INDEX idx_oauth_user_id ON oauth_accounts (user_id);

-- Sessions
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

-- Events (critical for date range queries)
CREATE INDEX idx_events_user_date ON events (user_id, start_at, end_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_user_category ON events (user_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_recurring_parent ON events (recurring_event_id) WHERE recurring_event_id IS NOT NULL;
CREATE INDEX idx_events_search ON events USING gin (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Tasks
CREATE INDEX idx_tasks_user_due ON tasks (user_id, due_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_user_status ON tasks (user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_recurring_parent ON tasks (recurring_task_id) WHERE recurring_task_id IS NOT NULL;
CREATE INDEX idx_tasks_search ON tasks USING gin (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Categories
CREATE INDEX idx_categories_user ON calendar_categories (user_id);

-- Reminders
CREATE INDEX idx_reminders_trigger ON reminders (trigger_at) WHERE sent_at IS NULL;
CREATE INDEX idx_reminders_item ON reminders (item_type, item_id);

-- Audit Log (append-only, read by time range)
CREATE INDEX idx_audit_user_time ON audit_logs (user_id, created_at);
CREATE INDEX idx_audit_action ON audit_logs (action, created_at);

-- Password Reset Tokens
CREATE INDEX idx_reset_tokens_user ON password_reset_tokens (user_id);
CREATE INDEX idx_reset_tokens_expires ON password_reset_tokens (expires_at);
```

### 7.2 Foreign Keys & Cascade Rules

| FK Relationship | On Delete |
|---|---|
| `events.user_id → users.id` | CASCADE (user deletion removes all events) |
| `events.category_id → calendar_categories.id` | SET DEFAULT (re-assign to default category) |
| `events.recurring_event_id → events.id` | CASCADE (delete parent → delete exceptions) |
| `tasks.user_id → users.id` | CASCADE |
| `tasks.category_id → calendar_categories.id` | SET DEFAULT |
| `tasks.recurring_task_id → tasks.id` | CASCADE |
| `reminders.user_id → users.id` | CASCADE |
| `calendar_categories.user_id → users.id` | CASCADE |
| `sessions.user_id → users.id` | CASCADE |
| `oauth_accounts.user_id → users.id` | CASCADE |
| `user_push_subscriptions.user_id → users.id` | CASCADE |
| `password_reset_tokens.user_id → users.id` | CASCADE |
| `audit_logs.user_id → users.id` | SET NULL |

### 7.3 Soft Deletes

Events and Tasks use `deletedAt` column for soft deletes. All queries filter `WHERE deleted_at IS NULL` by default. A nightly cleanup job hard-deletes records where `deletedAt` is older than 30 days.

### 7.4 Data Retention

| Data | Retention |
|---|---|
| Soft-deleted events/tasks | 30 days, then hard deleted |
| Expired sessions | Cleaned up daily via cron job |
| Used/expired password reset tokens | Cleaned up daily |
| Audit logs | 90 days, then deleted |
| Sent reminders | 30 days after `sentAt`, then deleted |

---

## 8. UI/UX Specification

### 8.1 Design Tokens

```css
/* Light Theme (default) */
--color-bg:          #f8f7f4;
--color-surface:     #ffffff;
--color-border:      #e4e2dd;
--color-text:        #1a1916;
--color-text-muted:  #7a7570;
--color-accent:      #c8522a;        /* CTA buttons, today highlight */
--color-accent-hover:#b5461f;
--color-success:     #3a6b5c;        /* task done, positive actions */
--color-danger:      #c0392b;        /* destructive actions */
--color-warning:     #d4a017;        /* overdue indicators */

/* Typography */
--font-display:      'DM Serif Display', serif;
--font-body:         'Outfit', sans-serif;
--font-mono:         'DM Mono', monospace;

/* Spacing & Radius */
--radius-sm:         4px;
--radius-md:         8px;
--radius-lg:         16px;

/* Shadows */
--shadow-sm:         0 1px 3px rgba(0,0,0,0.06);
--shadow-md:         0 4px 16px rgba(0,0,0,0.10);
--shadow-lg:         0 16px 48px rgba(0,0,0,0.14);

/* Z-Index Scale */
--z-dropdown:        100;
--z-sticky:          200;
--z-modal-backdrop:  300;
--z-modal:           400;
--z-popover:         500;
--z-toast:           600;
```

### 8.2 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  TOPBAR (60px, sticky)                                           │
│  [☰] [Logo]  [◀ March 2026 ▶]  [Month|Week|Day|Agenda]  [🔍] [+] [👤]│
├──────────┬───────────────────────────────────────┬───────────────┤
│ SIDEBAR  │            CALENDAR GRID              │  TASK PANEL   │
│ (240px)  │        (flex: 1, scrollable)          │  (300px,      │
│          │                                       │   slide-in)   │
│ Mini Cal │                                       │               │
│ ──────── │                                       │  Today (3)    │
│ Calendars│                                       │  □ Call dentist│
│ ☑ Work   │                                       │  □ Review PR  │
│ ☑ Personal│                                      │  □ Buy groceries│
│ ☑ Health │                                       │               │
│          │                                       │  Overdue (1)  │
│ [+ Add]  │                                       │  □ Tax filing │
│          │                                       │               │
└──────────┴───────────────────────────────────────┴───────────────┘
```

- **Sidebar**: 240px fixed width; collapsible to 60px icon rail. Hidden on mobile with hamburger toggle.
- **Task Panel**: 300px slide-in from right; toggled via toolbar button or `T` key.
- **Topbar**: 60px height; sticky positioned.
- **Calendar Grid**: fills remaining width. Scrollable vertically in Day/Week views.

### 8.3 Interactions & Motion

| Interaction | Animation | Duration |
|---|---|---|
| View switch (Month↔Week) | `AnimatePresence` crossfade + directional slide | 200ms |
| New event modal open | Scale up from click origin | 150ms ease-out |
| Event drag | `@dnd-kit` ghost overlay + opacity 0.5 on source | real-time |
| Task check-off | Strikethrough + fade + slide-up removal | 300ms |
| Sidebar collapse | Width transition 240px → 60px | 200ms ease |
| Page load | Staggered column/row reveal | 50ms delay per item |
| Toast notification | Slide in from top-right + auto-dismiss | 4000ms display |

All animations respect `prefers-reduced-motion: reduce` — replaced with instant transitions.

### 8.4 Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `< 640px` (mobile) | Sidebar hidden; bottom navigation; only Agenda + Day views; Task panel full-screen overlay |
| `640px – 1024px` (tablet) | Sidebar as icon rail; Week + Day + Agenda views; Task panel overlay |
| `> 1024px` (desktop) | Full layout; all views; Task panel as inline slide-in |

### 8.5 Loading States

- Skeleton screens for calendar grid on initial load.
- Inline spinners for individual mutations.
- Full-page loading spinner only on initial auth check.
- Error boundaries per route with "Retry" button.

---

## 9. Component Tree

```
<App>
  <QueryClientProvider>
    <AuthGuard>
      <Layout>
        <Topbar>
          <SidebarToggle />           {/* hamburger on mobile */}
          <Logo />
          <DateNavigator />           {/* ◀ March 2026 ▶ + Today */}
          <ViewSwitcher />            {/* Month | Week | Day | Agenda */}
          <SearchButton />            {/* Cmd+K trigger */}
          <CreateButton />            {/* + Create dropdown: Event | Task */}
          <TaskPanelToggle />
          <UserMenu />                {/* avatar → dropdown: settings, sign out */}
        </Topbar>

        <Sidebar>
          <MiniCalendar />
          <CalendarList>
            <CalendarItem />          {/* toggle visibility, color dot, edit */}
          </CalendarList>
          <AddCalendarButton />
        </Sidebar>

        <CalendarMain>
          <AnimatePresence mode="wait">
            <MonthView>
              <MonthGrid>
                <DayCell>
                  <EventPill />
                  <TaskPill />
                  <MoreIndicator />   {/* "+2 more" → overflow popover */}
                </DayCell>
              </MonthGrid>
            </MonthView>

            <WeekView>
              <WeekHeader />
              <AllDayRow />
              <TimeGrid>
                <CurrentTimeIndicator />
                <TimeSlot />          {/* click → QuickCreate */}
                <EventBlock />        {/* draggable, resizable */}
                <TaskMarker />
              </TimeGrid>
            </WeekView>

            <DayView />               {/* single-column WeekView */}
            <AgendaView>
              <VirtualList>
                <AgendaGroup />       {/* grouped by date */}
              </VirtualList>
            </AgendaView>
          </AnimatePresence>
        </CalendarMain>

        <TaskPanel>                   {/* slide-in right drawer */}
          <TaskPanelHeader />
          <TaskFilter />
          <TaskGroup label="Today" />
          <TaskGroup label="Overdue" />
          <TaskGroup label="Upcoming" />
          <TaskGroup label="No Date" />
        </TaskPanel>
      </Layout>

      {/* Portals */}
      <EventDrawer />                 {/* full create/edit form */}
      <TaskDrawer />
      <RecurrenceBuilderModal />
      <QuickCreatePopover />
      <SearchModal />                 {/* Cmd+K full-screen search */}
      <EventDetailPopover />
      <ConfirmDeleteDialog />
      <KeyboardShortcutsHelp />       {/* ? key */}
      <Toaster />                     {/* toast notifications */}
    </AuthGuard>
  </QueryClientProvider>
</App>
```

---

## 10. State Management

### 10.1 Zustand Stores

**`useCalendarStore`** — Calendar UI state only (not server data):

```typescript
interface CalendarStore {
  currentDate:     Date;
  view:            'month' | 'week' | 'day' | 'agenda';
  selectedItemId:  string | null;
  isTaskPanelOpen: boolean;
  isSidebarOpen:   boolean;

  setView:          (view: CalendarStore['view']) => void;
  navigate:         (direction: 'prev' | 'next' | 'today') => void;
  setDate:          (date: Date) => void;
  selectItem:       (id: string | null) => void;
  toggleTaskPanel:  () => void;
  toggleSidebar:    () => void;
}
```

**`useUIStore`** — Modal/drawer state:

```typescript
interface UIStore {
  eventDrawer:  { open: boolean; eventId: string | null; defaultDate?: Date; defaultTime?: Date };
  taskDrawer:   { open: boolean; taskId: string | null;  defaultDate?: Date };
  searchOpen:   boolean;

  openEventDrawer:  (opts?: Partial<UIStore['eventDrawer']>) => void;
  closeEventDrawer: () => void;
  openTaskDrawer:   (opts?: Partial<UIStore['taskDrawer']>) => void;
  closeTaskDrawer:  () => void;
  toggleSearch:     () => void;
  closeAll:         () => void;
}
```

### 10.2 TanStack Query Keys

```typescript
export const queryKeys = {
  events: {
    all:          ['events'] as const,
    range:        (start: string, end: string) => ['events', 'range', start, end] as const,
    detail:       (id: string) => ['events', 'detail', id] as const,
    occurrences:  (id: string, start: string, end: string) => ['events', 'occurrences', id, start, end] as const,
  },
  tasks: {
    all:          ['tasks'] as const,
    list:         (filters: TaskFilter) => ['tasks', 'list', filters] as const,
    detail:       (id: string) => ['tasks', 'detail', id] as const,
  },
  categories: {
    all:          ['categories'] as const,
  },
  reminders: {
    byItem:       (itemType: string, itemId: string) => ['reminders', itemType, itemId] as const,
  },
  search: {
    results:      (query: string) => ['search', query] as const,
  },
  user: {
    me:           ['user', 'me'] as const,
    sessions:     ['user', 'sessions'] as const,
  },
} as const;
```

### 10.3 Optimistic Updates

All mutations use optimistic updates with TanStack Query:

1. `onMutate`: Cancel outgoing queries for the affected key. Snapshot current cache. Apply optimistic update.
2. `onError`: Rollback to snapshot. Show error toast.
3. `onSettled`: Invalidate queries to refetch from server.

---

## 11. Routing

Using **TanStack Router** with file-based routing:

```
routes/
├── _auth/                        # Unauthenticated layout
│   ├── __layout.tsx              # Centered card layout
│   ├── login.tsx                 → /login
│   ├── signup.tsx                → /signup
│   ├── forgot-password.tsx       → /forgot-password
│   └── reset-password.tsx        → /reset-password?token=xxx
├── _app/                         # Authenticated layout
│   ├── __layout.tsx              # Main shell (topbar + sidebar + outlet)
│   ├── index.tsx                 → / (redirects to /calendar)
│   ├── calendar/
│   │   ├── index.tsx             → /calendar  (default: month view, today)
│   │   └── $date.tsx             → /calendar/2025-03-15
│   └── settings/
│       ├── index.tsx             → /settings (redirects to /settings/profile)
│       ├── profile.tsx           → /settings/profile
│       ├── calendars.tsx         → /settings/calendars
│       ├── notifications.tsx     → /settings/notifications
│       └── sessions.tsx          → /settings/sessions
```

**URL Search Params** (persisted in URL for shareable state):

```
/calendar?view=week&date=2025-03-10
/calendar/2025-03-15?view=day
```

**Route Guards:**
- `_app/__layout.tsx` checks for valid session via `useQuery(['user', 'me'])`. Redirects to `/login` on 401.
- `_auth/__layout.tsx` checks if already authenticated. Redirects to `/calendar` if logged in.

---

## 12. API Design

**Base URL**: `/api/v1`
**Content-Type**: `application/json` for all request/response bodies.
**Auth**: All endpoints except `/auth/*` and `/health` require a valid session cookie.
**Errors**: Consistent error response shape:

```typescript
{
  error: {
    code: string;        // machine-readable, e.g. "VALIDATION_ERROR", "NOT_FOUND"
    message: string;     // human-readable
    details?: unknown;   // optional Zod validation errors array
  }
}
```

**HTTP Status Codes Used:**
- `200` — Success (GET, PATCH)
- `201` — Created (POST)
- `204` — No Content (DELETE)
- `400` — Bad Request (validation errors)
- `401` — Unauthorized (no/invalid session)
- `403` — Forbidden (accessing another user's resource)
- `404` — Not Found
- `409` — Conflict (duplicate email, etc.)
- `422` — Unprocessable Entity (business logic violations)
- `429` — Too Many Requests (rate limited)
- `500` — Internal Server Error

### Auth

```
POST   /auth/signup                 Create account (email + password)
POST   /auth/login                  Login with email + password
POST   /auth/logout                 Logout (invalidate session)
POST   /auth/forgot-password        Request password reset email
POST   /auth/reset-password         Reset password with token
GET    /auth/me                     Get current user profile
PATCH  /auth/me                     Update profile (name, timezone, preferences)
PATCH  /auth/me/password            Change password (requires current password)
DELETE /auth/me                     Delete account (requires password confirmation)
GET    /auth/sessions               List active sessions
DELETE /auth/sessions/:id           Revoke a specific session
DELETE /auth/sessions               Revoke all sessions except current
GET    /auth/oauth/google           Initiate Google OAuth flow
GET    /auth/oauth/google/callback  Google OAuth callback
GET    /auth/oauth/github           Initiate GitHub OAuth flow
GET    /auth/oauth/github/callback  GitHub OAuth callback
```

### Events

```
GET    /events?start=ISO&end=ISO&categoryIds=id1,id2
       → Returns events in date range, including expanded recurring instances.
       → Each recurring instance includes { ...event, instanceDate, isRecurringInstance: true }

POST   /events
       → Create event. Body: EventCreateSchema.
       → Returns 201 + created event.

GET    /events/:id
       → Get single event by ID.

PATCH  /events/:id?scope=instance|following|all
       → Update event. Scope required for recurring events.
       → Body: EventUpdateSchema (partial).

DELETE /events/:id?scope=instance|following|all
       → Delete event. Scope required for recurring events.
       → Returns 204.

POST   /events/:id/duplicate
       → Duplicate event as a new standalone event.
       → Returns 201 + new event.

GET    /events/:id/ics
       → Export single event as .ics file.
       → Returns text/calendar content.
```

### Tasks

```
GET    /tasks?status=todo,in_progress&priority=high,medium&due_start=ISO&due_end=ISO&sort=due_at
       → Returns filtered task list.

POST   /tasks
       → Create task. Body: TaskCreateSchema.

GET    /tasks/:id
       → Get single task.

PATCH  /tasks/:id?scope=instance|following|all
       → Update task.

DELETE /tasks/:id?scope=instance|following|all
       → Delete task.

PATCH  /tasks/:id/toggle
       → Toggle task completion (todo ↔ done). Sets/clears completedAt.

PATCH  /tasks/reorder
       → Reorder tasks. Body: { ids: string[] } — ordered list of task IDs.
       → Updates sortOrder for each task.
```

### Categories

```
GET    /categories
       → Returns all categories for the current user, sorted by sortOrder.

POST   /categories
       → Create category. Body: { name, color }.

PATCH  /categories/:id
       → Update category. Body: { name?, color?, visible?, sortOrder? }.

DELETE /categories/:id
       → Delete category. Events/tasks reassigned to default category.
       → Cannot delete the default category (returns 422).
```

### Reminders

```
GET    /reminders?itemType=event&itemId=xxx
       → Returns reminders for a specific event or task.

POST   /reminders
       → Create reminder. Body: { itemType, itemId, minutesBefore, method }.
       → Computes triggerAt and enqueues BullMQ job.

DELETE /reminders/:id
       → Delete reminder. Cancels the BullMQ job.
```

### Real-time (SSE)

```
GET    /stream
       → Server-Sent Events stream. Requires valid session cookie.
       → Connection kept alive with heartbeat every 30 seconds.
       → Auto-reconnects on client side (EventSource + exponential backoff).
```

**Events emitted:**
- `event:created` — `{ id, title, startAt, endAt, categoryId }`
- `event:updated` — `{ id, ...changedFields }`
- `event:deleted` — `{ id }`
- `task:created` — `{ id, title, dueAt, status }`
- `task:updated` — `{ id, ...changedFields }`
- `task:deleted` — `{ id }`
- `reminder:fired` — `{ id, itemType, itemId, title }`
- `category:updated` — `{ id, ...changedFields }`
- `category:deleted` — `{ id }`

### Search

```
GET    /search?q=meeting&limit=20
       → Full-text search across events + tasks.
       → Returns { events: [...], tasks: [...] }, each sorted by relevance.
       → Minimum query length: 2 characters.
```

### Health

```
GET    /health
       → Returns 200 { status: 'ok', db: 'ok', redis: 'ok', timestamp: ISO }
       → No auth required. For deployment health checks.

GET    /health/ready
       → Returns 200 only when all services are connected and ready.
       → For Kubernetes/Railway readiness probes.
```

---

## 13. Authentication & Authorization

### 13.1 Auth Strategy

Session-based authentication via **Lucia Auth v3** with PostgreSQL session storage.

**Why sessions over JWT:**
- Immediate revocation (no waiting for token expiry).
- Server-side session state enables concurrent session management.
- Simpler security model (no refresh token rotation complexity).
- Cookie-based delivery handles XSS protection via `HttpOnly`.

### 13.2 Session Cookie Configuration

```typescript
{
  name: 'calley_session',
  httpOnly: true,
  secure: true,                    // HTTPS only in production
  sameSite: 'lax',                 // allows top-level navigation redirects (OAuth)
  path: '/',
  maxAge: 30 * 24 * 60 * 60,      // 30 days (absolute)
  domain: process.env.COOKIE_DOMAIN, // e.g., '.calley.app'
}
```

### 13.3 Auth Flows

**Email + Password Signup:**
1. Validate email uniqueness + password strength (Zod + zxcvbn).
2. Hash password with Argon2id.
3. Create User record + default "Personal" category.
4. Create Session + set cookie.
5. Log `user.signup` audit event.
6. Redirect to `/calendar`.

**Email + Password Login:**
1. Check if account is locked (`lockedUntil > now`). If so, return 423 Locked.
2. Lookup user by email. If not found, return generic 401 (prevent enumeration).
3. Verify password hash. If mismatch:
   - Increment `failedLogins`.
   - If `failedLogins >= 5`, set `lockedUntil = now + 30 min`, send lockout email.
   - Return generic 401.
4. Reset `failedLogins` to 0, clear `lockedUntil`.
5. Create Session (rotate token) + set cookie + set CSRF cookie.
6. Log `user.login` audit event.

**OAuth (Google / GitHub):**
1. Frontend redirects to `/auth/oauth/{provider}`.
2. Backend generates state token (stored in short-lived cookie), redirects to provider.
3. Provider callback hits `/auth/oauth/{provider}/callback`.
4. Backend verifies state, exchanges code for access token, fetches profile.
5. Lookup `OAuthAccount` by `provider + providerAccountId`:
   - If exists: load linked user, create session.
   - If not exists but email matches existing user: link OAuth account to existing user, create session.
   - If not exists and no email match: create new User + OAuthAccount + default category, create session.
6. Redirect to `/calendar`.

**Password Reset:**
1. User submits email to `/auth/forgot-password`.
2. Backend always responds 200 (prevent enumeration).
3. If email exists: generate 256-bit token, store SHA-256 hash in `password_reset_tokens`, send email via Resend with reset link.
4. Reset link: `{FRONTEND_URL}/reset-password?token={raw_token}`.
5. User submits new password + token to `/auth/reset-password`.
6. Backend hashes token with SHA-256, looks up matching record.
7. If valid (not expired, not used): update password hash, mark token as used, invalidate all sessions for user.
8. Log `user.password_reset` audit event.

### 13.4 Authorization

All API endpoints enforce ownership checks:
- Every authenticated route extracts `userId` from the session.
- Every database query includes `WHERE user_id = :userId` (service layer, not middleware).
- No endpoint accepts a `userId` parameter from the client.
- Category reassignment on delete is scoped to the user's own default category.

---

## 14. Notifications & Reminders

### 14.1 Reminder Flow

1. User creates a Reminder attached to an Event or Task via the UI.
2. API creates a `Reminder` record with computed `triggerAt = itemDateTime - minutesBefore`.
3. API enqueues a BullMQ delayed job with `delay = triggerAt - now` (in milliseconds).
4. At trigger time, the BullMQ worker:
   - Verifies the reminder still exists and isn't already sent (idempotency).
   - Verifies the parent event/task still exists (not deleted).
   - Based on `method`:
     - `push`: Sends Web Push notification to all user's subscriptions.
     - `email`: Enqueues an email job via Resend.
     - `both`: Does both.
   - Emits `reminder:fired` on the user's SSE stream (in-app toast).
   - Sets `sentAt` timestamp on the Reminder record.
5. Failed jobs retry up to 3 times with exponential backoff (1min, 5min, 15min).

### 14.2 Web Push Setup

1. Frontend checks `Notification.permission` on app load.
2. If `'default'`, prompt user (via settings or first reminder creation).
3. On grant, call `PushManager.subscribe()` with the VAPID public key.
4. Send subscription object to `POST /push-subscriptions`.
5. Backend stores subscription in `user_push_subscriptions` table.
6. Push payload (encrypted, max 4KB):
   ```json
   {
     "title": "Reminder: Team Standup",
     "body": "Starting in 15 minutes",
     "icon": "/icon-192.png",
     "data": { "url": "/calendar?date=2026-03-15&view=day" }
   }
   ```
7. On push subscription error (endpoint expired), delete the subscription record.

### 14.3 SSE Connection Management

- Client uses `EventSource` to connect to `/api/v1/stream`.
- Server stores active connections in a Map keyed by `userId`.
- On mutation (event/task create/update/delete), the service layer calls `sseService.emit(userId, eventType, data)`.
- Heartbeat: server sends `:heartbeat\n\n` comment every 30 seconds to keep connection alive.
- Client reconnects automatically (EventSource built-in) with exponential backoff capped at 30 seconds.
- Max 5 concurrent SSE connections per user (enforced by rate limiter). Oldest connection is closed on overflow.

---

## 15. Error Handling & Logging

### 15.1 API Error Handling

Centralized error handler middleware (`error-handler.middleware.ts`):

```typescript
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

// Usage in services:
throw new AppError(404, 'NOT_FOUND', 'Event not found');
throw new AppError(422, 'VALIDATION_ERROR', 'End time must be after start time');
throw new AppError(409, 'CONFLICT', 'Email already registered');
```

Error handler catches all errors, maps to response format, and logs:
- 4xx errors: logged at `warn` level.
- 5xx errors: logged at `error` level with stack trace.
- Unhandled exceptions: logged at `fatal` level, return generic 500.

### 15.2 Structured Logging (Pino)

Every log entry includes:
```json
{
  "level": "info",
  "time": "2026-03-15T10:30:00.000Z",
  "requestId": "req_abc123",
  "userId": "usr_xyz789",
  "method": "POST",
  "path": "/api/v1/events",
  "statusCode": 201,
  "duration": 45,
  "msg": "Request completed"
}
```

**What is logged:**
- All HTTP requests (method, path, status, duration).
- Auth events (login, logout, signup, failed login, lockout, password reset).
- Errors (with stack trace for 5xx, without for 4xx).
- BullMQ job completions and failures.
- SSE connection open/close.

**What is never logged:**
- Passwords, tokens, session IDs.
- Full request/response bodies.
- PII beyond userId.

### 15.3 Request ID Tracing

- `request-id.middleware.ts` generates a `X-Request-ID` (CUID2) for every request.
- Passed to Pino child logger context.
- Returned in the response header for client-side correlation.
- BullMQ jobs include the originating request ID in metadata.

---

## 16. Accessibility

| Requirement | Implementation |
|---|---|
| **Keyboard navigation** | All interactive elements focusable; Tab order follows visual layout. Arrow keys navigate calendar grid cells. Enter opens events. |
| **Screen reader support** | ARIA labels on event pills, grid cells, buttons. `role="grid"` on calendar with `role="gridcell"` on day cells. Live regions for toast notifications. |
| **Color contrast** | All text/background pairs meet WCAG AA (4.5:1 minimum). Event colors always paired with accessible text. |
| **Focus management** | Focus trapped in modals/drawers (via Radix UI Dialog). Focus restored to trigger element on close. |
| **Reduced motion** | `prefers-reduced-motion: reduce` disables all Framer Motion animations. Replaced with instant opacity transitions. |
| **Time format** | Respects user's 12h/24h preference across the entire UI. |
| **Drag & Drop alternatives** | All DnD actions have keyboard equivalents: arrow keys to move focus, Enter to pick up, arrows to move, Enter to drop, Escape to cancel. Context menu as alternative. |
| **Skip navigation** | "Skip to main content" link as first focusable element. |
| **Error announcements** | Form validation errors announced via `aria-live="assertive"` regions. |

---

## 17. Performance Targets

| Metric | Target |
|---|---|
| LCP (Largest Contentful Paint) | < 1.5s |
| INP (Interaction to Next Paint) | < 100ms |
| CLS (Cumulative Layout Shift) | < 0.05 |
| Bundle size (initial JS, gzipped) | < 150 KB |
| API response (list endpoints, p95) | < 150ms |
| API response (single item, p95) | < 50ms |
| Calendar render (month, 100 events) | < 16ms (60fps) |
| Time to Interactive | < 2.0s |
| SSE reconnection | < 5s |

### Performance Strategies

- **Code splitting**: Route-based lazy loading via TanStack Router. Heavy components (RecurrenceBuilder, Tiptap editor) loaded on demand.
- **Virtualization**: `@tanstack/react-virtual` for Agenda view and long task lists (>50 items).
- **Date range queries**: Only fetch events within the current view's visible range + 1 month buffer on either side. Prefetch adjacent date ranges.
- **Recurring expansion**: Expand recurring events server-side per query range. Never expand more than 1000 instances per series per query.
- **Optimistic UI**: All mutations update the local cache instantly. Rollback on server error.
- **Memoization**: `React.memo` on DayCell, EventPill, TaskItem components. `useMemo` for expensive date calculations.
- **Font loading**: Google Fonts loaded with `font-display: swap` and preconnect hints.
- **Image optimization**: User avatars limited to 256x256, served as WebP.
- **DB query optimization**: Partial indexes (with `WHERE deleted_at IS NULL`). Connection pooling (max 20 connections).

---

## 18. Testing Strategy

### 18.1 Unit Tests (Vitest)

- Recurrence expansion logic (`rrule.js` wrappers, edge cases: timezone transitions, DST).
- Date utility functions (timezone conversions, range calculations, overlap detection).
- Zustand store actions and state transitions.
- Zod schema validation (valid + invalid inputs).
- Service layer business logic (mock DB).
- Password strength validation.
- RRULE string validation and parsing.

### 18.2 Integration Tests (React Testing Library + Vitest)

- Event creation form (validation, submission, error display).
- Task creation and edit form.
- Recurring event edit scope selection dialog.
- Task check-off and status update flow.
- Calendar navigation (month, week, day transitions).
- Search modal (query, results display, navigation).
- Auth forms (login, signup, password reset — with mocked API).
- Quick create popover.
- Category management (create, edit, delete, reassignment).

### 18.3 API Integration Tests (Vitest + supertest/hono test client)

- Auth flow (signup → login → access protected route → logout).
- Event CRUD with ownership enforcement.
- Task CRUD with status transitions.
- Recurring event creation, expansion, and edit scope handling.
- Rate limiting behavior.
- Error responses for invalid input.
- Search result accuracy and ranking.

### 18.4 E2E Tests (Playwright)

| Scenario | Priority | Coverage |
|---|---|---|
| Sign up → create first event → view in month view | P0 | Critical path |
| Login → logout → login again | P0 | Auth flow |
| Create recurring event → edit single instance → verify series intact | P0 | Recurrence scope |
| Create task → check off → verify in done filter | P0 | Task lifecycle |
| Drag event to new time slot in week view | P1 | DnD |
| Cmd+K search → navigate to result | P1 | Search |
| Create reminder → verify in-app toast fires | P1 | Notifications |
| Mobile: agenda view navigation + task panel toggle | P1 | Responsive |
| OAuth login with Google (mocked provider) | P1 | OAuth |
| Password reset flow | P1 | Password recovery |
| Category create → assign to event → delete category → verify reassignment | P2 | Categories |
| Keyboard-only: navigate calendar, create event, complete task | P2 | Accessibility |

### 18.5 CI Pipeline (GitHub Actions)

```
┌──────────┐    ┌────────────┐    ┌──────────┐    ┌───────────────┐    ┌───────┐    ┌──────────┐
│  Lint +  │───▶│ Type-check │───▶│  Unit    │───▶│ Integration   │───▶│ Build │───▶│  E2E     │
│ Format   │    │ (tsc)      │    │  Tests   │    │ Tests         │    │       │    │  Tests   │
└──────────┘    └────────────┘    └──────────┘    └───────────────┘    └───────┘    └──────────┘
                                                                                         │
                                                                                   ┌─────▼──────┐
                                                                                   │  Deploy    │
                                                                                   │  Preview   │
                                                                                   └────────────┘
```

**Coverage Requirements:**
- Unit tests: > 80% line coverage on `services/` and `lib/`.
- Integration tests: > 70% coverage on components.
- E2E: All P0 scenarios must pass before merge.

---

## 19. Deployment & Infrastructure

### 19.1 Managed Deployment (Primary)

| Component | Service | Configuration |
|---|---|---|
| Frontend (SPA) | Vercel | Auto-deploy from `main` branch. Framework: Vite. Build command: `pnpm turbo build --filter=web`. |
| API Server | Railway | Dockerfile deployment. Auto-scaling. Health check: `/api/v1/health`. |
| PostgreSQL | Railway (managed) | 16.x, 1GB RAM minimum. Daily automated backups. |
| Redis | Railway (managed) | 7.x, 256MB minimum. Persistence: RDB snapshots. |

**Environment separation:**
- `production` — `main` branch, custom domain.
- `staging` — `staging` branch, subdomain.
- `preview` — per PR, ephemeral.

### 19.2 Docker Self-Hosted Deployment

**`docker-compose.yml`**:

```yaml
version: '3.9'

services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - api
    environment:
      - VITE_API_URL=http://api:4000/api/v1

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "4000:4000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: calley
      POSTGRES_USER: calley
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-ARGS", "pg_isready", "-U", "calley"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/certs:/etc/nginx/certs:ro
    depends_on:
      - web
      - api

volumes:
  pgdata:
  redisdata:
```

**API Dockerfile** (`apps/api/Dockerfile`):

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=api

FROM base AS runtime
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
USER hono
EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

### 19.3 Graceful Shutdown

The API server handles `SIGTERM` and `SIGINT`:

1. Stop accepting new requests.
2. Close SSE connections with a "server-shutdown" event.
3. Wait for in-flight requests to complete (max 30 second timeout).
4. Close BullMQ workers (let current jobs finish).
5. Close Redis connection.
6. Close PostgreSQL connection pool.
7. Exit process.

---

## 20. Monitoring & Observability

### 20.1 Health Checks

- **Liveness** (`/health`): Returns 200 if the process is running.
- **Readiness** (`/health/ready`): Returns 200 only when PostgreSQL and Redis are connected.
- Both are unauthenticated, excluded from rate limiting, and excluded from logging.

### 20.2 Structured Logs

All logs output as JSON (Pino) to stdout. In production:
- Managed deployment: Railway captures stdout automatically. Use Railway's log viewer or forward to a log aggregator.
- Docker: Use `docker logs` or configure a log driver (e.g., Loki, Datadog).

### 20.3 Key Metrics to Track

| Metric | Source | Alert Threshold |
|---|---|---|
| API error rate (5xx) | Pino logs | > 1% of requests |
| API latency (p95) | Pino logs | > 500ms |
| Failed login rate | Audit log | > 50/hour |
| BullMQ job failure rate | BullMQ events | > 5% |
| Active SSE connections | In-memory counter | > 1000 |
| DB connection pool utilization | Drizzle/pg pool | > 80% |
| Redis memory usage | Redis INFO | > 80% of limit |

### 20.4 Error Tracking (Optional)

For production, optionally integrate Sentry:
- Frontend: `@sentry/react` with React error boundary integration.
- Backend: `@sentry/node` with Hono middleware.
- Environment-gated: only active when `SENTRY_DSN` is set.

---

## 21. Backup & Disaster Recovery

### 21.1 Database Backups

| Strategy | Frequency | Retention | Method |
|---|---|---|---|
| Automated (Railway) | Daily | 7 days | Railway managed backups |
| Manual (self-hosted) | Daily at 3:00 AM UTC | 30 days | `pg_dump` via cron, stored in S3-compatible storage |
| Point-in-time recovery | Continuous | 7 days | WAL archiving (self-hosted only) |

### 21.2 Recovery Procedures

- **Data corruption**: Restore from latest backup. Apply WAL logs to minimize data loss.
- **Service outage**: Railway auto-restarts on crash. Docker: restart policy `unless-stopped`.
- **Redis data loss**: Non-critical (queued jobs are recreated from Reminder records on startup). BullMQ jobs re-enqueued from `unsent` reminders.
- **Complete disaster**: Redeploy from Git + restore PostgreSQL backup. Redis is reconstructable.

### 21.3 Reminder Recovery on Startup

On API server startup:
1. Query all Reminders where `sentAt IS NULL` and `triggerAt > now - 5 minutes`.
2. Re-enqueue each as a BullMQ delayed job.
3. For reminders where `triggerAt < now` (missed during downtime), send immediately.

---

## 22. Environment Configuration

### 22.1 Environment Variables

```env
# ─── Frontend (.env) ──────────────────────────────────
VITE_API_URL=http://localhost:4000/api/v1
VITE_VAPID_PUBLIC_KEY=                             # base64url encoded

# ─── Backend (.env) ───────────────────────────────────
NODE_ENV=development                                # development | staging | production
PORT=4000

# Database
DATABASE_URL=postgresql://calley:password@localhost:5432/calley
DB_POOL_MAX=20                                      # max pool connections

# Redis
REDIS_URL=redis://:password@localhost:6379

# Auth
SESSION_SECRET=                                     # min 32 chars, cryptographically random
COOKIE_DOMAIN=localhost                             # .calley.app in production

# OAuth — Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/v1/auth/oauth/google/callback

# OAuth — GitHub
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:4000/api/v1/auth/oauth/github/callback

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM=Calley <noreply@calley.app>

# Web Push (VAPID)
VAPID_PRIVATE_KEY=                                  # base64url encoded
VAPID_PUBLIC_KEY=                                   # must match VITE_VAPID_PUBLIC_KEY
VAPID_SUBJECT=mailto:hello@calley.app

# Security
CORS_ORIGIN=http://localhost:3000                   # exact frontend URL
RATE_LIMIT_ENABLED=true

# Observability (Optional)
SENTRY_DSN=
LOG_LEVEL=info                                      # debug | info | warn | error
```

### 22.2 Secrets Management

- **Development**: `.env` file (`.gitignore`'d). Copy from `.env.example`.
- **Staging / Production (Railway)**: Railway encrypted environment variables. Never committed to Git.
- **Docker self-hosted**: `.env` file with strict file permissions (`chmod 600`). Alternatively, Docker secrets or Vault.
- **CI/CD**: GitHub Actions secrets for deploy credentials, database URLs, API keys.

### 22.3 Required External Accounts

| Service | Purpose | Required for Dev? |
|---|---|---|
| Google Cloud Console | OAuth Client ID/Secret | Only if testing Google OAuth |
| GitHub OAuth Apps | OAuth Client ID/Secret | Only if testing GitHub OAuth |
| Resend | Transactional email | Only if testing email (can use console logging fallback) |
| Railway | Managed deployment | No (use Docker for local) |
| Vercel | Frontend deployment | No (use `vite dev` locally) |

---

## 23. Future Enhancements

| Feature | Target Version | Complexity |
|---|---|---|
| Shared / collaborative calendars | v2 | High |
| Google Calendar / iCal sync (CalDAV) | v2 | High |
| Meeting invite emails (ICS attachment) | v2 | Medium |
| Time blocking from task list (drag task → calendar) | v2 | Medium |
| Kanban view for tasks | v2 | Medium |
| Calendar analytics (time tracking reports) | v2 | Medium |
| Offline support (Service Worker + IndexedDB) | v2 | High |
| Dark mode theme | v2 | Low |
| AI scheduling suggestions | v3 | High |
| Native mobile apps (React Native) | v3 | Very High |

---

*Spec version 2.0 — February 2026*
*Authored for production deployment with security-first design.*
