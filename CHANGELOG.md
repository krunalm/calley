# Changelog

All notable changes to the Calley project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Login errors**: a wrong password now shows "Invalid email or password" on the form instead of "Your session has expired" followed by a page reload. The global 401 handler no longer intercepts responses from credential-check endpoints.
- **Change password**: a wrong current password now shows an inline field error instead of signing the user out.
- **Task descriptions** are sanitized with DOMPurify on create and update, matching event descriptions.
- **Mobile sidebar**: the overlay backdrop no longer covers the topbar, so the hamburger can close the sidebar it opened.
- **Auth form validation**: the login, signup, forgot-password and reset-password forms show their own field errors for a malformed email instead of a native browser tooltip.

## [1.0.0] - 2026-02-17

### Added

- **Calendar Views**: Month, Week, Day, and Agenda views with smooth transitions
- **Event Management**: Full CRUD for events with drag-and-drop rescheduling and duration resizing
- **Task Management**: Task panel with grouping (Today, Overdue, Upcoming, No Date), priority levels, and bulk operations
- **Recurrence Engine**: RFC 5545 RRULE support for events and tasks with edit scopes (this instance, this and following, all)
- **Calendar Categories**: Create up to 20 color-coded categories with visibility toggles
- **Authentication**: Email/password signup and login with Argon2id password hashing
- **OAuth**: Google and GitHub OAuth sign-in with account linking
- **Password Reset**: Secure token-based password reset flow via email
- **Session Management**: View and revoke active sessions, max 10 concurrent sessions per user
- **Account Security**: Account lockout after 5 failed login attempts (30-minute cooldown)
- **Search**: Full-text search across events and tasks via Cmd/Ctrl+K modal (PostgreSQL tsvector)
- **Keyboard Shortcuts**: Comprehensive keyboard navigation (view switching, navigation, quick create, search)
- **Reminders**: Push notifications, email reminders, and in-app toasts via BullMQ delayed jobs
- **Real-time Updates**: Server-Sent Events (SSE) for live sync across tabs
- **Quick Create**: Click any empty time slot to quickly create an event or task
- **ICS Export**: Export individual events as .ics files
- **Settings**: Profile management, calendar settings, notification preferences, session management
- **Responsive Design**: Mobile-friendly with adaptive layouts for phone, tablet, and desktop
- **Accessibility**: ARIA labels, keyboard navigation, screen reader announcements, focus management, reduced motion support
- **Docker Self-Hosting**: Full Docker Compose setup with nginx reverse proxy, PostgreSQL, and Redis
- **CI/CD**: GitHub Actions pipelines for lint, type-check, test, build, and deploy
- **Security**: CSRF protection, rate limiting, security headers (CSP, HSTS), input validation via Zod

### Security

- All passwords hashed with Argon2id (memory: 64MB, iterations: 3, parallelism: 4)
- Session-based authentication with HttpOnly, Secure, SameSite cookies
- CSRF double-submit cookie pattern on all state-changing endpoints
- Redis-backed rate limiting on all API endpoints
- Content Security Policy, HSTS, X-Frame-Options, and other security headers
- Input sanitization with DOMPurify for rich text content
- Soft deletes with 30-day retention for events and tasks
- Audit logging for security-relevant actions (login, logout, password changes)

### Infrastructure

- TypeScript monorepo with pnpm + Turborepo
- React 18 SPA with Vite, TanStack Router, TanStack Query, Zustand
- Hono API with Drizzle ORM on PostgreSQL 16
- BullMQ job queue on Redis 7 for reminders and cleanup tasks
- Multi-stage Docker builds for lean production images
- Automated database migrations via Drizzle Kit
