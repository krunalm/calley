# Calley — Project Review Document

> Comprehensive review of the Calley calendar application covering implementation status, gaps, issues, and enhancement opportunities.
>
> **Review Date:** 2026-03-15

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Implementation Status](#2-implementation-status)
3. [Critical Issues](#3-critical-issues)
4. [Gaps — Missing or Incomplete Features](#4-gaps--missing-or-incomplete-features)
5. [Code Quality Issues](#5-code-quality-issues)
6. [Security Findings](#6-security-findings)
7. [Performance Concerns](#7-performance-concerns)
8. [Testing Gaps](#8-testing-gaps)
9. [Enhancement Opportunities](#9-enhancement-opportunities)
10. [Deployment Readiness](#10-deployment-readiness)
11. [Recommendations & Prioritized Action Items](#11-recommendations--prioritized-action-items)

---

## 1. Executive Summary

**Calley** is a production-grade calendar web application built as a TypeScript monorepo with a React 18 SPA frontend and Hono REST API backend. The project is **~86% complete** (386 of 448 tasks done, 62 remaining).

### Key Metrics

| Metric | Value |
|--------|-------|
| Total production code | ~34,000 lines |
| Test code | ~10,700 lines (31% of total) |
| Test files | 22 files, >1,000 test cases |
| Phases complete | 9 of 10 (Phase 10: Deployment pending) |
| Tasks completed | 386 / 448 (86%) |
| Tasks remaining | 62 (mostly testing & deployment) |
| Dependencies | 96 packages (well-managed) |

### Overall Assessment

| Area | Rating | Notes |
|------|--------|-------|
| Architecture | **A** | Clean monorepo, service layer, middleware pipeline |
| Security | **A** | Argon2id, CSRF, rate limiting, ownership checks |
| Code Quality | **A-** | TypeScript strict, consistent patterns, minor gaps |
| Test Coverage | **B+** | Good service/route tests, frontend tests need expansion |
| Accessibility | **B+** | ARIA labels, keyboard nav done; full WCAG audit pending |
| Performance | **B** | Code splitting, lazy loading done; Lighthouse audit pending |
| Documentation | **A+** | 173KB of specs, guides, and task tracking |
| Deployment Readiness | **C** | Code ready, infrastructure setup not done |

---

## 2. Implementation Status

### Phase Completion

| Phase | Description | Status | Completion |
|-------|-------------|--------|------------|
| 0 | Project Scaffolding & Tooling | ✅ Complete | 100% |
| 1 | Database & Auth Foundation | ✅ Complete | 97% (2 test items pending) |
| 2 | Core Events CRUD + Calendar Views | ✅ Complete | 95% (3 test items pending) |
| 3 | Tasks System | ✅ Complete | 92% (3 items pending) |
| 4 | Drag & Drop + ICS | ✅ Complete | 97% (1 item pending) |
| 5 | Categories & Calendar Management | ✅ Complete | 93% (3 items pending) |
| 6 | Search & Keyboard Shortcuts | ✅ Complete | 95% (2 items pending) |
| 7 | Notifications & Reminders | ✅ Complete | 97% (1 item pending) |
| 8 | Settings & User Preferences | ✅ Complete | 100% |
| 9 | Polish, Accessibility & Performance | ✅ Complete | 90% (6 items pending) |
| 10 | Deployment & Launch | ⏳ Pending | 0% (all manual setup) |

### What's Fully Built

- **Calendar Views**: Month, Week, Day, Agenda — all with responsive layouts, animations, and accessibility
- **Event Management**: Full CRUD, recurrence (RFC 5545), edit scopes (instance/following/all), drag-and-drop rescheduling, duration resize, ICS export, duplicate
- **Task Management**: Full CRUD, priority levels, grouped display, drag-to-reorder, drag-to-calendar, bulk operations
- **Authentication**: Email/password + Google/GitHub OAuth, password reset, session management, account lockout
- **Recurrence Engine**: Daily/weekly/monthly/yearly/custom intervals, exception dates, server-side expansion
- **Notifications**: Web Push (VAPID), email reminders (Resend), in-app toasts, BullMQ delayed jobs
- **Real-Time Sync**: SSE with auto-reconnect, cache invalidation
- **Search**: Full-text via PostgreSQL tsvector/tsquery, Cmd/Ctrl+K modal
- **Settings**: Profile, calendars, notifications, sessions, connected accounts
- **Categories**: Color-coded calendars with visibility toggles (up to 20 per user)
- **Keyboard Shortcuts**: 11 shortcuts for navigation, creation, and search

---

## 3. Critical Issues

### 3.1 Missing Rate Limiting on Core Endpoints (Severity: HIGH)

**Events and Tasks routes lack endpoint-specific rate limiting**, violating the spec requirement that "all endpoints are rate limited" (SPECS.md §4.3).

| Route File | Affected Endpoints | Current Rate Limit |
|------------|-------------------|-------------------|
| `events.routes.ts` | All 7 endpoints (GET, POST, PATCH, DELETE, duplicate, ICS, move) | **None** |
| `tasks.routes.ts` | 7 of 9 endpoints (all except bulk-complete, bulk-delete) | **None** |

**Properly rate-limited routes:**
- Auth routes: 3-5 req/hr per IP ✅
- Categories: 100/min global ✅
- Reminders: 30/min per user ✅
- Search: 30/min per user ✅
- Push subscriptions: 20/min ✅
- SSE stream: 10/min ✅
- Global middleware: 100/min ✅

**Impact**: An attacker could flood event/task creation or query endpoints, causing resource exhaustion and degraded performance for all users.

**Recommendation**: Add per-endpoint rate limiting:
- GET (list): 120 req/min per user
- POST (create): 30 req/min per user
- PATCH (update): 60 req/min per user
- DELETE: 30 req/min per user
- Bulk operations: 10 req/min per user

### 3.2 Task Description Field Length Exceeds Spec (Severity: MEDIUM)

The task description schema allows 5,000 characters, but SPECS.md §6.2 specifies a maximum of 2,000 characters for task descriptions (event descriptions are correctly set to 5,000).

- **File**: `packages/shared/src/schemas/task.schema.ts:20`
- **Current**: `.max(5000, 'Description must be at most 5000 characters')`
- **Expected**: `.max(2000, 'Description must be at most 2000 characters')`

**Impact**: Users can submit task descriptions 2.5x longer than intended, increasing storage and rendering costs.

### 3.3 No `.nvmrc` or `.node-version` File (Severity: LOW)

The project requires Node.js 22 but doesn't have a version pinning file. Developers may use incorrect Node versions.

**Recommendation**: Add `.nvmrc` with content `22`.

---

## 4. Gaps — Missing or Incomplete Features

### 4.1 Untested Flows (62 items from TASKS.md)

These items are marked `[ ]` (not started) in TASKS.md:

#### Testing Gaps (High Priority)
| Item | Phase | Risk |
|------|-------|------|
| Test password reset flow end-to-end | 1.5 | Auth regression |
| Test both OAuth flows | 1.6 | OAuth breakage undetected |
| Test all auth flows in browser | 2.3 | Auth UX issues |
| Test month navigation (prev/next, today, keyboard arrows) | 2.5 | Navigation bugs |
| Test form validation edge cases (empty title, invalid dates, long descriptions) | 2.9 | Data integrity |
| Write unit tests for task service | 3.1 | Task logic regression |
| Write API integration tests for task endpoints | 3.1 | Task API breakage |
| Test with Google Calendar and Apple Calendar import | 4.2 | ICS compatibility |
| Write tests for search accuracy and ranking | 6.1 | Search quality |
| Test all shortcuts in different views and states | 6.2 | Shortcut conflicts |
| Write tests (for settings) | 8.1 | Settings regression |
| Write tests (for notifications) | 7.2 | Notification failures |

#### Accessibility Gaps (Medium Priority)
| Item | Phase | Risk |
|------|-------|------|
| Run axe-core automated audit on all pages | 9.1 | WCAG violations |
| Test with VoiceOver (macOS) or NVDA (Windows) | 9.1 | Screen reader issues |
| Verify color contrast meets WCAG AA (4.5:1) | 9.1 | Inaccessible text |
| Test entire flow with keyboard only | 9.1 | Keyboard-only users blocked |
| Add keyboard alternatives for all DnD actions | 4.1 | Accessibility gap |

#### Feature Gaps (Low Priority)
| Item | Phase | Risk |
|------|-------|------|
| Toggle task panel with toolbar button or `T` shortcut | 3.2 | Minor UX |
| Mini calendar date dots use category colors | 5.2 | Minor UX |
| Ensure all category colors have accessible text contrast | 5.2 | Accessibility |
| Generate VAPID key pair, store in environment variables | 7.1 | Push notifications won't work |

#### Performance Verification (Medium Priority)
| Item | Phase | Risk |
|------|-------|------|
| Test Core Web Vitals with Lighthouse | 9.2 | Performance issues undetected |
| Verify initial bundle size < 150KB gzipped | 10.3 | Slow load times |
| Verify API response times < 150ms (p95) under load | 10.3 | Poor API performance |
| Verify calendar renders at 60fps with 100 events | 10.3 | Janky UI |

### 4.2 Deployment Infrastructure (Phase 10 — Entirely Manual)

All 30+ items in Phase 10 are pending:
- Railway project setup (API + PostgreSQL + Redis)
- Vercel project setup (frontend)
- Custom domain configuration
- Production environment variables
- Database migrations on production
- Automated backups
- Monitoring & alerting (Sentry, log aggregation)
- Docker image publishing
- SSL/TLS setup
- Health check polling
- Smoke testing checklist

---

## 5. Code Quality Issues

### 5.1 Strengths

- **Consistent architecture**: All services follow the same ownership-enforcement pattern (`userId` in every WHERE clause)
- **Thin route handlers**: All business logic properly lives in services, routes are just validation + delegation
- **AppError used consistently**: No raw exceptions leaking implementation details
- **Soft delete filtering**: Every query properly includes `isNull(deletedAt)` — no stale data leaks
- **No TODO/FIXME/HACK comments**: Codebase is clean
- **Proper transaction usage**: Multi-step operations wrapped in `db.transaction()`
- **Input sanitization**: DOMPurify applied to all user HTML content (event descriptions)
- **No raw SQL**: All queries via Drizzle ORM or parameterized template literals

### 5.2 Frontend Code Quality (from Detailed Audit)

| Area | Status | Notes |
|------|--------|-------|
| Component structure | Excellent | 58 components well-organized into functional subdirectories |
| Zustand stores | Excellent | 4 stores with clear responsibilities, localStorage persistence |
| TanStack Query | Excellent | Optimistic updates with proper rollback on all mutations |
| Form validation | Good | React Hook Form + Zod with timezone-aware refinements |
| Accessibility | Very Good | ARIA live regions, keyboard nav, semantic HTML, skip-to-content |
| Error boundaries | Good | At route level; no Sentry integration yet |
| Loading states | Good | Skeleton loaders + Suspense for all major views |
| Responsive design | Excellent | Mobile-first with proper breakpoints |
| Performance | Good | memo(), lazy loading, useMemo, reduced-motion support |
| Routing guards | Excellent | Auth guard with `beforeLoad`, guest redirect |
| CSS/Tailwind | Excellent | Semantic design tokens, theme system, z-index scale |

### 5.3 Areas for Improvement

| Issue | Location | Severity |
|-------|----------|----------|
| Task description max length (5000) doesn't match spec (2000) | `packages/shared/src/schemas/task.schema.ts:20` | Medium |
| Task service tests marked incomplete in TASKS.md but test files exist (`task.service.test.ts` 35KB) — TASKS.md may be out of date | `TASKS.md:424-425` | Low |
| No `any` type audit performed — potential type safety gaps | Project-wide | Low |
| No explicit API versioning strategy (e.g., `/v1/events`) | `apps/api/src/app.ts` | Medium |
| No request timeout middleware for long-running requests | `apps/api/src/middleware/` | Medium |
| ErrorBoundary lacks Sentry/error reporting integration | `apps/web/src/components/ErrorBoundary.tsx` | Low |

---

## 6. Security Findings

### 6.1 Excellent (No Action Required)

| Control | Implementation | Status |
|---------|---------------|--------|
| Password hashing | Argon2id (64MB memory, 3 iterations, 4 parallelism) | ✅ Excellent |
| CSRF protection | Double-submit cookie on all POST/PATCH/DELETE | ✅ Excellent |
| Input validation | Zod middleware on every endpoint | ✅ Excellent |
| Ownership enforcement | `userId` in all service queries | ✅ Excellent |
| SQL injection prevention | Drizzle ORM + parameterized queries | ✅ Excellent |
| XSS prevention | DOMPurify on descriptions, allowlisted tags only | ✅ Excellent |
| Session management | Lucia Auth v3, HttpOnly/Secure/SameSite cookies | ✅ Excellent |
| Account lockout | 5 failed logins → 30 min lockout | ✅ Excellent |
| User enumeration prevention | Generic messages on login/reset | ✅ Excellent |
| Session rotation | New session token on every login | ✅ Excellent |
| Max sessions | 10 per user, oldest deleted on overflow | ✅ Excellent |
| Audit logging | PII sanitized, IP hashed, fire-and-forget | ✅ Excellent |
| Security headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options | ✅ Excellent |
| Soft deletes | `deletedAt` column, all queries filter | ✅ Excellent |

### 6.2 Issues Requiring Action

| Issue | Severity | Details |
|-------|----------|---------|
| Missing rate limits on events/tasks endpoints | **HIGH** | See §3.1 above |
| No request body size limits explicitly configured | **MEDIUM** | Large payloads could cause memory issues. Hono may have defaults but explicit limits are safer. |
| No VAPID key generation documented as required step | **LOW** | Push notifications will fail without keys; documented in TASKS.md but not enforced at startup |

---

## 7. Performance Concerns

### 7.1 What's Done Well

- **Route-based code splitting** with `.lazy.tsx` files
- **Heavy component lazy loading** (Tiptap editor, RecurrenceBuilder, color picker)
- **React.memo** on expensive components (EventPill, TaskPill, DayCell)
- **Virtual scrolling** in Agenda view for 500+ items
- **Data prefetching** (±1 month for month view, ±1 week for week view)
- **TanStack Query caching** with stale-while-revalidate
- **Database connection pooling** (max 20 connections)
- **Query optimization** with indexes on all critical columns
- **Partial indexes** for soft deletes
- **GIN indexes** for full-text search

### 7.2 Unverified Performance Targets

| Target | Spec Value | Status |
|--------|-----------|--------|
| Initial JS bundle | < 150KB gzipped | ⚠️ Not measured |
| LCP (Largest Contentful Paint) | < 1.5s | ⚠️ Not measured |
| INP (Interaction to Next Paint) | < 100ms | ⚠️ Not measured |
| CLS (Cumulative Layout Shift) | < 0.05 | ⚠️ Not measured |
| API response time (p95) | < 150ms | ⚠️ Not measured |
| Calendar render with 100 events | 60fps | ⚠️ Not measured |

### 7.3 Potential Performance Risks

| Risk | Area | Mitigation |
|------|------|------------|
| Recurring event expansion could be expensive for long date ranges | Backend | Capped at 1000 instances per query ✅ |
| SSE connections consume server resources | Backend | Max 5 per user ✅, but no global limit |
| No bundle analysis has been run | Frontend | `rollup-plugin-visualizer` is configured but not verified |
| No load testing has been performed | Backend | Unknown behavior under concurrent load |

---

## 8. Testing Gaps

### 8.1 Current Coverage

| Layer | Files | Lines | Assessment |
|-------|-------|-------|------------|
| Backend service tests | 7 | ~6,000 | ✅ Strong |
| Backend route tests | 7 | ~3,500 | ✅ Good |
| Schema validation tests | 1 | 124 cases | ✅ Good |
| Frontend component tests | 2 | ~500 | ⚠️ Minimal |
| Frontend store tests | 3 | ~400 | ✅ Adequate |
| Frontend utility tests | 1 | ~100 | ✅ Adequate |
| E2E tests (Playwright) | 3 | ~800 | ✅ Good (P0/P1/P2 tiers) |

### 8.2 Missing Test Coverage

| Area | What's Missing | Priority |
|------|---------------|----------|
| Frontend components | Only 2 test files for 58 components; calendar views, drag-and-drop, settings pages untested | **HIGH** |
| End-to-end auth flows | OAuth flows, password reset flow not tested E2E | **MEDIUM** |
| ICS import/export | No tests for Google Calendar / Apple Calendar compatibility | **MEDIUM** |
| Keyboard shortcuts | No automated tests for shortcut behavior across views | **MEDIUM** |
| Search ranking | No tests verifying result quality and ordering | **MEDIUM** |
| Accessibility (automated) | No axe-core integration in CI | **MEDIUM** |
| Load/stress testing | No performance test suite | **LOW** |
| Cross-browser testing | Not automated in CI (documented only) | **LOW** |

---

## 9. Enhancement Opportunities

### 9.1 Short-Term Improvements (Low Effort, High Impact)

| Enhancement | Effort | Impact | Details |
|-------------|--------|--------|---------|
| Add rate limiting to events/tasks routes | 1-2 hours | High | Security hardening — see §3.1 |
| Add `.nvmrc` file | 5 minutes | Medium | Developer experience |
| Add request body size limits | 30 minutes | Medium | Prevent memory exhaustion attacks |
| Run and document Lighthouse audit | 1 hour | Medium | Identify performance bottlenecks |
| Add axe-core to CI pipeline | 2 hours | Medium | Catch accessibility regressions automatically |
| Add API versioning prefix (`/v1/`) | 2 hours | Medium | Future-proof API for breaking changes |

### 9.2 Medium-Term Improvements (Moderate Effort)

| Enhancement | Effort | Impact | Details |
|-------------|--------|--------|---------|
| Expand frontend test coverage | 1-2 weeks | High | Cover calendar views, DnD, settings |
| Add request timeout middleware | 2-3 hours | Medium | Prevent hung requests from consuming resources |
| Add global SSE connection limit | 2-3 hours | Medium | Prevent resource exhaustion from too many connections |
| Add database query logging in development | 2-3 hours | Medium | Debug slow queries, catch N+1 issues |
| Add structured error tracking (Sentry) | 4-6 hours | High | Production error visibility |
| Implement health check dashboard | 4-6 hours | Medium | Operational visibility |

### 9.3 Long-Term Enhancements (from SPECS.md §23)

| Enhancement | Description |
|-------------|-------------|
| Offline support | Service Worker for offline-first experience |
| CalDAV sync | Google Calendar / Apple Calendar bidirectional sync |
| Team collaboration | Shared calendars, event invitations, RSVP |
| Native mobile apps | iOS/Android with React Native or Capacitor |
| AI scheduling | Smart event suggestions based on patterns |
| Calendar widgets | Embeddable widgets for external sites |
| Zapier/webhook integration | Third-party automation support |

---

## 10. Deployment Readiness

### 10.1 What's Ready

| Component | Status | Notes |
|-----------|--------|-------|
| API Docker image | ✅ Ready | Multi-stage, non-root user, health checks |
| Web Docker image | ✅ Ready | Multi-stage, nginx-based serving |
| Docker Compose (production) | ✅ Ready | web + api + postgres + redis + nginx |
| Docker Compose (dev) | ✅ Ready | Volume mounts, hot reload |
| Nginx reverse proxy | ✅ Ready | Security headers, gzip, rate limiting, SSE support |
| CI pipeline | ✅ Ready | Lint, type-check, test, build, E2E |
| Database migrations | ✅ Ready | Auto-generated, scripted for deployment |
| Seed data | ✅ Ready | Development seed script |
| Environment templates | ✅ Ready | .env.example for api, web, and docker |
| README documentation | ✅ Ready | Setup, scripts, deployment, API reference |

### 10.2 What's NOT Ready (Phase 10)

| Component | Status | Action Required |
|-----------|--------|----------------|
| Railway account & project | ❌ Not started | Create account, configure project |
| Vercel account & project | ❌ Not started | Create account, link repo |
| Custom domain & DNS | ❌ Not started | Purchase domain, configure DNS |
| Production environment variables | ❌ Not started | Set all secrets in Railway/Vercel |
| SSL/TLS certificates | ❌ Not started | Automatic via Vercel/Railway |
| Database backups | ❌ Not started | Enable on Railway |
| Monitoring & alerting | ❌ Not started | Configure Sentry, log aggregation |
| VAPID key generation | ❌ Not started | Required for push notifications |
| Production smoke tests | ❌ Not started | Post-deployment verification |
| Rollback procedure | ❌ Not tested | Document and test rollback |

---

## 11. Recommendations & Prioritized Action Items

### P0 — Critical (Do Before Launch)

1. **Add rate limiting to events and tasks endpoints** — Security gap that could lead to resource exhaustion
2. **Generate and configure VAPID keys** — Push notifications will fail without them
3. **Set up deployment infrastructure** (Railway + Vercel) — Blocking production launch
4. **Configure production environment variables** — Required for any deployment
5. **Enable automated database backups** — Data loss risk without backups
6. **Run production smoke test checklist** — Verify all critical flows work end-to-end

### P1 — Important (Do Within First Sprint Post-Launch)

7. **Run Lighthouse audit and verify Core Web Vitals** — Quantify actual performance
8. **Add axe-core accessibility audit to CI** — Prevent accessibility regressions
9. **Test OAuth flows end-to-end** — Currently untested, could silently break
10. **Test password reset flow end-to-end** — Auth-critical, untested
11. **Set up Sentry or equivalent error tracking** — Production error visibility
12. **Add request body size limits** — Defense-in-depth against large payloads
13. **Add `.nvmrc` file** — Pin Node.js version for team consistency

### P2 — Desirable (Do Within First Month)

14. **Expand frontend component test coverage** — Only 2 of 58 components tested
15. **Test ICS import/export with Google Calendar and Apple Calendar** — Compatibility verification
16. **Complete keyboard shortcut testing across all views** — Prevent shortcut conflicts
17. **Run full WCAG AA accessibility audit** (automated + manual) — Compliance verification
18. **Add API versioning prefix** (`/v1/`) — Future-proof for breaking changes
19. **Perform load testing** — Verify performance under concurrent usage
20. **Add request timeout middleware** — Prevent hung requests

### P3 — Nice to Have (Backlog)

21. **Add cross-browser testing to CI** — Automate Safari/Firefox verification
22. **Implement global SSE connection limit** — Resource protection at scale
23. **Add database query logging** (dev only) — Debug performance issues
24. **Verify and optimize bundle size** — Run visualizer, tree-shake unused code
25. **Document rollback procedures** — Operational runbook

---

## Appendix: File Reference

| Category | Key Files |
|----------|-----------|
| API entry point | `apps/api/src/index.ts`, `apps/api/src/app.ts` |
| Event service | `apps/api/src/services/event.service.ts` |
| Task service | `apps/api/src/services/task.service.ts` |
| Auth service | `apps/api/src/services/auth.service.ts` |
| Database schema | `apps/api/src/db/schema.ts` |
| Rate limit middleware | `apps/api/src/middleware/rate-limit.middleware.ts` |
| Event routes (missing rate limits) | `apps/api/src/routes/events.routes.ts` |
| Task routes (missing rate limits) | `apps/api/src/routes/tasks.routes.ts` |
| Frontend entry | `apps/web/src/main.tsx`, `apps/web/src/App.tsx` |
| Shared schemas | `packages/shared/src/schemas/` |
| CI pipeline | `.github/workflows/ci.yml` |
| Docker production | `docker/docker-compose.yml` |
| Specs | `SPECS.md` |
| Task tracking | `TASKS.md` |

---

*This review was generated by analyzing the full codebase, SPECS.md, TASKS.md, and all source files across the monorepo.*
