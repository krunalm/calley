# CLAUDE.md — Calley Project Guide for Claude Code

> This file helps Claude Code understand the Calley project, its conventions, architecture, and implementation patterns. Read this before working on any task.

---

## Project Overview

**Calley** is a production-grade calendar web application (events + tasks + recurrence) built as a TypeScript monorepo. It has a React SPA frontend and a Hono API backend with PostgreSQL and Redis.

**Key documents:**
- `SPECS.md` — Full technical specification (architecture, security, data models, API design)
- `TASKS.md` — Phase-wise task breakdown with progress tracking

---

## Architecture Summary

```
calley/                          # pnpm + Turborepo monorepo
├── apps/web/                    # React 18 SPA (Vite, TanStack Router)
├── apps/api/                    # Hono REST API (Node.js 22)
├── packages/shared/             # Shared Zod schemas + TypeScript types
└── docker/                      # Docker Compose for self-hosting
```

**Data flow:** Frontend → REST API (Hono) → PostgreSQL (Drizzle ORM) + Redis (BullMQ queues, rate limiting). Real-time updates via Server-Sent Events (SSE).

---

## Tech Stack Quick Reference

| What | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript 5 |
| Build tool | Vite 5 |
| CSS | Tailwind CSS v4 |
| UI components | shadcn/ui (Radix-based) |
| Client state | Zustand |
| Server state | TanStack Query v5 |
| Routing | TanStack Router (file-based) |
| Forms | React Hook Form + Zod |
| Dates | date-fns + date-fns-tz |
| Recurrence | rrule.js (RFC 5545) |
| Drag & drop | @dnd-kit/core |
| Rich text | Tiptap v2 (bold, italic, links only) |
| Animations | Framer Motion |
| Backend framework | Hono 4.x |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Auth | Lucia Auth v3 + Arctic.js (OAuth) |
| Job queue | BullMQ + Redis 7 |
| Email | Resend |
| Logging | Pino |
| Password hashing | argon2 (Argon2id) |
| IDs | @paralleldrive/cuid2 |
| Package manager | pnpm (strict) |
| Monorepo | Turborepo |

---

## Critical Conventions

### File & Naming

- **Files**: `kebab-case.ts` for all files (e.g., `event.service.ts`, `use-events.ts`, `calendar-store.ts`)
- **Components**: `PascalCase.tsx` for React components (e.g., `EventDrawer.tsx`, `MonthView.tsx`)
- **Types**: PascalCase (e.g., `Event`, `TaskFilter`, `CalendarStore`)
- **Zod schemas**: camelCase with `Schema` suffix (e.g., `createEventSchema`, `loginSchema`)
- **Database columns**: `snake_case` in PostgreSQL, mapped to `camelCase` in Drizzle schema
- **API routes**: `kebab-case` paths (e.g., `/auth/forgot-password`, `/events/:id/ics`)
- **Environment variables**: `SCREAMING_SNAKE_CASE`

### Import Order

```typescript
// 1. Node builtins / external packages
import { useState } from 'react';
import { z } from 'zod';

// 2. Internal packages (@calley/shared)
import { createEventSchema } from '@calley/shared';

// 3. Internal paths (@/ alias)
import { useEvents } from '@/hooks/use-events';
import { apiClient } from '@/lib/api-client';

// 4. Relative imports
import { EventPill } from './EventPill';

// 5. Types (type-only imports)
import type { Event } from '@calley/shared';
```

### Export Pattern

- **Components**: Default export for page components, named exports for reusable components.
- **Hooks**: Named exports always (e.g., `export function useEvents() {}`).
- **Services**: Named exports always (e.g., `export class EventService {}`).
- **Types**: Named exports always.
- **Schemas**: Named exports always.

---

## Key Architectural Patterns

### 1. Zod as Single Source of Truth

All data validation schemas live in `packages/shared/src/schemas/`. Both frontend and backend import from here. Types are inferred from Zod schemas — never define types manually that duplicate a schema.

```typescript
// packages/shared/src/schemas/event.schema.ts
export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  // ...
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
```

### 2. Backend Service Layer Pattern

All business logic lives in service files. Routes are thin wrappers that validate input and call services. Never put business logic in route handlers.

```typescript
// routes/events.routes.ts — THIN
app.post('/events', authMiddleware, validate(createEventSchema), async (c) => {
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const event = await eventService.createEvent(userId, data);
  return c.json(event, 201);
});

// services/event.service.ts — BUSINESS LOGIC HERE
export class EventService {
  async createEvent(userId: string, data: CreateEventInput) {
    // Validate business rules
    // Insert into DB
    // Create reminder if specified
    // Emit SSE event
    // Log audit event
    return event;
  }
}
```

### 3. Ownership Enforcement

Every service method that reads/writes user data MUST include `userId` in the WHERE clause. Never trust a userId from the request body — always extract from the session.

```typescript
// CORRECT — userId from session, enforced in query
async getEvent(userId: string, eventId: string) {
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)),
  });
  if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');
  return event;
}

// WRONG — never do this
async getEvent(eventId: string) {
  return db.query.events.findFirst({ where: eq(events.id, eventId) });
}
```

### 4. Optimistic Updates (Frontend)

All TanStack Query mutations follow this pattern:

```typescript
const mutation = useMutation({
  mutationFn: (data) => apiClient.post('/events', data),
  onMutate: async (newEvent) => {
    // 1. Cancel outgoing queries
    await queryClient.cancelQueries({ queryKey: queryKeys.events.all });
    // 2. Snapshot current cache
    const previous = queryClient.getQueryData(queryKeys.events.range(start, end));
    // 3. Optimistic update
    queryClient.setQueryData(queryKeys.events.range(start, end), (old) => [...old, newEvent]);
    return { previous };
  },
  onError: (err, newEvent, context) => {
    // 4. Rollback
    queryClient.setQueryData(queryKeys.events.range(start, end), context.previous);
    toast.error('Failed to create event');
  },
  onSettled: () => {
    // 5. Refetch
    queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
  },
});
```

### 5. Error Handling (Backend)

Use `AppError` for all expected errors. The error handler middleware catches everything.

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

// Usage:
throw new AppError(404, 'NOT_FOUND', 'Event not found');
throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule');
throw new AppError(429, 'RATE_LIMITED', 'Too many requests');
```

### 6. Soft Deletes

Events and Tasks use `deletedAt` column. All queries MUST filter `WHERE deleted_at IS NULL`. Drizzle has partial indexes to optimize this.

```typescript
// CORRECT
const events = await db.query.events.findMany({
  where: and(eq(events.userId, userId), isNull(events.deletedAt)),
});

// WRONG — will return deleted items
const events = await db.query.events.findMany({
  where: eq(events.userId, userId),
});
```

### 7. Recurrence Pattern

Recurring items are stored as a single parent record with an RRULE string. Instances are expanded on-the-fly per query range, never materialized in the DB.

```
Parent Event (id: evt_001)
  ├── rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR"
  ├── exDates: ["2026-03-17"]  ← skipped occurrence
  └── [expanded dynamically per query range]

Exception (id: evt_002)
  ├── recurringEventId: "evt_001"  ← links to parent
  ├── originalDate: "2026-03-19"   ← which occurrence this replaces
  └── [has its own title, time, etc.]
```

**Expansion flow:**
1. Query finds parent events with RRULE in the date range.
2. Use `rrule.js` to expand occurrences within the range.
3. Subtract exDates.
4. Merge in exception records (matched by `recurringEventId` + `originalDate`).
5. Return all instances with `isRecurringInstance: true` flag.

### 8. Date/Time Handling

- All dates stored in PostgreSQL as UTC (`TIMESTAMP WITH TIME ZONE`).
- Frontend converts to user's timezone for display using `date-fns-tz`.
- User's timezone stored in their profile.
- All-day events stored as midnight-to-midnight UTC.
- RRULE expansion uses `date-fns` and `rrule.js` with timezone awareness.

**Critical: never use `new Date()` for business logic without timezone context. Always use `date-fns` utilities.**

---

## Security Requirements (Non-Negotiable)

These must be followed in every piece of code:

1. **No raw SQL** — always use Drizzle ORM parameterized queries.
2. **Validate all input** — every endpoint uses Zod validation middleware.
3. **Sanitize HTML** — event descriptions go through DOMPurify (isomorphic-dompurify) before storage.
4. **Ownership checks** — every service method checks `userId`. No IDOR.
5. **No secrets in code** — all secrets via environment variables. Never log secrets.
6. **Rate limiting** — all endpoints are rate limited (see SPECS.md §4.3).
7. **CSRF protection** — all state-changing requests validated via double-submit cookie.
8. **Argon2id for passwords** — never bcrypt, never SHA-*, never MD5.
9. **Secure cookies** — `HttpOnly`, `Secure`, `SameSite=Lax`.
10. **No user enumeration** — login and password reset always return generic messages.
11. **Soft deletes** — events and tasks use `deletedAt`, all queries filter it.
12. **Session rotation** — new session token on every login.
13. **Account lockout** — 5 failed logins → 30 minute lockout.
14. **Max field lengths** — enforced in Zod schemas (title: 200, description: 5000, etc.).

---

## Database Schema Overview

```
users
  ├── oauth_accounts (1:N)
  ├── sessions (1:N)
  ├── password_reset_tokens (1:N)
  ├── calendar_categories (1:N, cascade delete)
  │   ├── events (N:1, SET DEFAULT on category delete)
  │   └── tasks (N:1, SET DEFAULT on category delete)
  ├── events (1:N, cascade delete)
  │   ├── events [exceptions] (self-referential via recurring_event_id)
  │   └── reminders (1:N, cascade delete)
  ├── tasks (1:N, cascade delete)
  │   ├── tasks [exceptions] (self-referential via recurring_task_id)
  │   └── reminders (1:N, cascade delete)
  ├── user_push_subscriptions (1:N)
  └── audit_logs (1:N, SET NULL on user delete)
```

**Key indexes** (see SPECS.md §7.1 for full list):
- `idx_events_user_date` — critical for calendar range queries
- `idx_tasks_user_due` — critical for task panel
- `idx_events_search` / `idx_tasks_search` — GIN indexes for full-text search
- `idx_reminders_trigger` — for finding unsent reminders

---

## API Patterns

### Route Structure

```typescript
// apps/api/src/routes/events.routes.ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createEventSchema, updateEventSchema } from '@calley/shared';
import { eventService } from '../services/event.service';

const events = new Hono();

events.use('/*', authMiddleware);

events.get('/', validate('query', listEventsQuerySchema), async (c) => {
  const userId = c.get('userId');
  const { start, end, categoryIds } = c.req.valid('query');
  const result = await eventService.listEvents(userId, start, end, categoryIds);
  return c.json(result);
});

events.post('/', validate('json', createEventSchema), async (c) => {
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const event = await eventService.createEvent(userId, data);
  return c.json(event, 201);
});

// ... more routes

export default events;
```

### Error Response Shape

All API errors follow this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "path": ["title"], "message": "Required" }
    ]
  }
}
```

Error codes used: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `LOCKED`, `INVALID_RRULE`.

### API Client (Frontend)

```typescript
// apps/web/src/lib/api-client.ts
const API_URL = import.meta.env.VITE_API_URL;

class ApiClient {
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const csrfToken = getCsrfTokenFromCookie();
    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...options?.headers,
      },
      ...options,
    });

    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const body = await res.json();
      throw new ApiError(res.status, body.error);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }); }
  patch<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }); }
  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }
}

export const apiClient = new ApiClient();
```

---

## Frontend Component Patterns

### Custom Hooks for Data Fetching

```typescript
// hooks/use-events.ts
export function useEvents(start: string, end: string) {
  return useQuery({
    queryKey: queryKeys.events.range(start, end),
    queryFn: () => apiClient.get<Event[]>(`/events?start=${start}&end=${end}`),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEventInput) => apiClient.post<Event>('/events', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      toast.success('Event created');
    },
    onError: () => toast.error('Failed to create event'),
  });
}
```

### Component Structure

```typescript
// components/calendar/EventPill.tsx
import { memo } from 'react';
import type { Event } from '@calley/shared';

interface EventPillProps {
  event: Event;
  onClick: (event: Event) => void;
}

export const EventPill = memo(function EventPill({ event, onClick }: EventPillProps) {
  return (
    <button
      onClick={() => onClick(event)}
      className="..."
      aria-label={`${event.title}, ${formatEventTime(event)}`}
    >
      {/* ... */}
    </button>
  );
});
```

---

## Environment Setup

### Prerequisites

- Node.js 22 (LTS)
- pnpm 9+
- Docker + Docker Compose (for local PostgreSQL + Redis)
- Git

### Local Development

```bash
# 1. Clone and install
git clone <repo-url> && cd calley
pnpm install

# 2. Start infrastructure
docker compose -f docker/docker-compose.dev.yml up -d

# 3. Setup environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit .env files with your values

# 4. Run migrations
pnpm --filter api db:push

# 5. Seed dev data (optional)
pnpm --filter api db:seed

# 6. Start development
pnpm dev
```

### Useful Scripts

```bash
pnpm dev              # Start web + api in parallel
pnpm build            # Build all packages
pnpm lint             # ESLint all packages
pnpm format           # Prettier format all
pnpm type-check       # TypeScript check all
pnpm test             # Run unit + integration tests
pnpm test:e2e         # Run Playwright E2E tests
pnpm --filter api db:generate   # Generate Drizzle migration
pnpm --filter api db:push       # Apply schema to dev DB
pnpm --filter api db:seed       # Seed development data
pnpm --filter api db:studio     # Open Drizzle Studio
```

---

## Common Implementation Tasks — Quick Reference

### Adding a New API Endpoint

1. Define Zod schema in `packages/shared/src/schemas/`.
2. Export type from `packages/shared/src/types/index.ts`.
3. Add service method in `apps/api/src/services/`.
4. Add route in `apps/api/src/routes/` with auth + validation middleware.
5. Register route in `apps/api/src/app.ts`.
6. Add TanStack Query hook in `apps/web/src/hooks/`.
7. Write unit test for service, integration test for route.

### Adding a New Database Table

1. Define Drizzle schema in `apps/api/src/db/schema.ts`.
2. Add indexes and foreign keys.
3. Generate migration: `pnpm --filter api db:generate`.
4. Test migration locally: `pnpm --filter api db:push`.
5. Add corresponding Zod schema in `packages/shared`.

### Adding a New Frontend Page

1. Create route file in `apps/web/src/routes/` (file-based routing).
2. Create page component.
3. Add any new hooks/stores needed.
4. Add route guard if needed (auth/guest).
5. Add to navigation (Topbar, Sidebar, or Settings).
6. Write integration test.

### Adding a New Keyboard Shortcut

1. Add to `useKeyboardShortcuts` hook.
2. Add to `KeyboardShortcutsHelp` modal.
3. Ensure it's disabled when a text input is focused.
4. Test the shortcut in context.

---

## Testing Patterns

### Unit Tests (Vitest)

```typescript
// services/__tests__/event.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EventService } from '../event.service';

describe('EventService', () => {
  let service: EventService;

  beforeEach(() => {
    service = new EventService(mockDb);
  });

  it('should reject events where end is before start', async () => {
    await expect(
      service.createEvent('user_1', { startAt: '2026-03-15T14:00:00Z', endAt: '2026-03-15T13:00:00Z', /* ... */ })
    ).rejects.toThrow('End time must be after start time');
  });
});
```

### Component Tests (React Testing Library)

```typescript
// components/__tests__/EventDrawer.test.tsx
import { render, screen, userEvent } from '@testing-library/react';

it('shows validation error for empty title', async () => {
  render(<EventDrawer open={true} onClose={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /save/i }));
  expect(screen.getByText(/title is required/i)).toBeInTheDocument();
});
```

### E2E Tests (Playwright)

```typescript
// e2e/event-crud.spec.ts
import { test, expect } from '@playwright/test';

test('create and view event', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'testpassword123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/calendar');
  // ... create event, verify it appears
});
```

---

## Gotchas & Known Patterns

1. **TanStack Router file-based routing**: Files prefixed with `_` are layout routes (not rendered as pages). Files prefixed with `$` are dynamic params. `__layout.tsx` is the layout wrapper.

2. **Drizzle ORM**: Use `db.query.*` for simple reads (relational query API). Use `db.select()...from()...where()` for complex queries with joins. Drizzle doesn't auto-apply soft delete filters — always include `isNull(table.deletedAt)`.

3. **Lucia Auth v3**: Sessions are managed via cookies. The `authMiddleware` extracts the session and sets `userId` on the Hono context (`c.set('userId', session.userId)`). Always access via `c.get('userId')`.

4. **rrule.js timezone handling**: Always pass `dtstart` with timezone info. Use `RRule.fromString()` for parsing. Use `.between(start, end, true)` for expansion within a range. Be cautious around DST transitions.

5. **shadcn/ui**: Components are copied into the project (not imported from a package). They live in `components/ui/`. Customize directly. They use Radix UI primitives under the hood.

6. **BullMQ delayed jobs**: When a reminder is created, compute the delay in milliseconds (`triggerAt - Date.now()`). If the delay is negative (trigger time is in the past), process immediately. On server restart, re-enqueue all unsent reminders.

7. **SSE connections**: EventSource reconnects automatically on disconnect. But it doesn't include cookies on reconnect in some browsers. Use a token-in-URL fallback if needed (pass session token as query param for SSE only, validated server-side).

8. **CSRF token**: The frontend reads the CSRF cookie (which is not HttpOnly) and sends it as the `X-CSRF-Token` header. The backend validates the header matches the cookie. This works because the cookie is `SameSite: Strict` — third-party sites can't read it.

---

## Performance Checklist (Before Marking Any Phase Complete)

- [ ] No unnecessary re-renders (check with React DevTools Profiler)
- [ ] Large lists are virtualized (Agenda view, task lists with 50+ items)
- [ ] Heavy components are lazy loaded (Tiptap, RecurrenceBuilder, color picker)
- [ ] Date calculations are memoized
- [ ] API queries use appropriate date ranges (not fetching all data)
- [ ] Recurring events are expanded server-side (not client-side)
- [ ] Images/avatars are properly sized
- [ ] No console errors or warnings in production build

---

*This file should be updated as the project evolves. When completing a phase, update conventions or patterns if they changed during implementation.*
