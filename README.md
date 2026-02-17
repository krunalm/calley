# Calley

A modern, production-grade calendar web application for managing events, tasks, and recurring schedules. Built as a TypeScript monorepo with a React SPA frontend and Hono API backend.

## Features

- **Calendar Views** — Month, Week, Day, and Agenda views with smooth animated transitions
- **Event Management** — Full CRUD with drag-and-drop rescheduling, duration resizing, and ICS export
- **Task Management** — Grouped task panel (Today, Overdue, Upcoming, No Date) with priorities and bulk operations
- **Recurring Items** — RFC 5545 RRULE support with edit scopes (this instance, this and following, all in series)
- **Calendar Categories** — Up to 20 color-coded categories with visibility toggles
- **Full-Text Search** — Cmd/Ctrl+K search across events and tasks via PostgreSQL tsvector
- **Keyboard Shortcuts** — Comprehensive keyboard navigation for power users
- **Reminders** — Push notifications, email, and in-app toasts via BullMQ delayed jobs
- **Real-time Sync** — Server-Sent Events (SSE) for live updates across tabs
- **Authentication** — Email/password + Google/GitHub OAuth with session management
- **Responsive** — Adaptive layouts for desktop, tablet, and mobile
- **Accessible** — ARIA labels, keyboard navigation, screen reader support, reduced motion
- **Self-Hostable** — Full Docker Compose setup with nginx, PostgreSQL, and Redis

## Tech Stack

| Layer       | Technology                                                 |
| ----------- | ---------------------------------------------------------- |
| Frontend    | React 18, TypeScript 5, Vite 5, Tailwind CSS v4, shadcn/ui |
| State       | Zustand (client), TanStack Query v5 (server)               |
| Routing     | TanStack Router (file-based)                               |
| Forms       | React Hook Form + Zod                                      |
| DnD         | @dnd-kit/core                                              |
| Backend     | Hono 4.x, Node.js 22                                       |
| Database    | PostgreSQL 16, Drizzle ORM                                 |
| Cache/Queue | Redis 7, BullMQ                                            |
| Auth        | Lucia Auth v3, Arctic.js (OAuth)                           |
| Real-time   | Server-Sent Events (SSE)                                   |
| Email       | Resend                                                     |
| Monorepo    | pnpm workspaces, Turborepo                                 |
| CI/CD       | GitHub Actions                                             |
| Deployment  | Vercel (frontend), Railway (API), Docker (self-hosted)     |

## Architecture

```text
┌───────────────────┐
│   CDN / Vercel    │
│   (React SPA)     │
└─────────┬─────────┘
          │ HTTPS
┌─────────▼─────────┐
│   Hono API        │
│   (Node.js 22)    │
│                    │
│   Middleware:      │
│   • CORS          │
│   • Security Hdrs │
│   • Rate Limiting │
│   • Auth (Lucia)  │
│   • Validation    │
│   • Logging       │
└──┬─────────────┬──┘
   │             │
┌──▼──────┐  ┌──▼──────────────┐
│PostgreSQL│  │ Redis            │
│ 16       │  │ 7                │
│          │  │                  │
│ Users    │  │ BullMQ queues    │
│ Events   │  │ Rate limiting    │
│ Tasks    │  │ SSE pub/sub      │
│ Sessions │  │                  │
│ ...      │  │                  │
└──────────┘  └──────────────────┘
```

### Project Structure

```text
calley/
├── .github/
│   ├── workflows/          # CI/CD pipelines
│   └── dependabot.yml      # Automated dependency updates
├── apps/
│   ├── api/                # Hono REST API
│   │   ├── src/
│   │   │   ├── routes/     # Route handlers (thin)
│   │   │   ├── services/   # Business logic
│   │   │   ├── middleware/  # Auth, validation, rate-limit, etc.
│   │   │   ├── db/         # Drizzle schema, migrations, seed
│   │   │   ├── jobs/       # BullMQ job processors
│   │   │   └── lib/        # Shared utilities
│   │   └── Dockerfile
│   └── web/                # React 18 SPA
│       ├── src/
│       │   ├── routes/     # TanStack Router file-based routes
│       │   ├── components/ # UI components (calendar, events, tasks, layout)
│       │   ├── hooks/      # Custom React hooks
│       │   ├── stores/     # Zustand stores
│       │   └── lib/        # API client, date utils, query keys
│       └── Dockerfile
├── packages/
│   └── shared/             # Shared Zod schemas + TypeScript types
│       └── src/
│           ├── schemas/    # Zod validation schemas (single source of truth)
│           ├── types/      # Inferred TypeScript types
│           └── constants/  # Priorities, statuses, colors
├── docker/
│   ├── docker-compose.yml      # Production self-hosted stack
│   ├── docker-compose.dev.yml  # Dev environment (Postgres + Redis)
│   ├── nginx.conf              # Reverse proxy config
│   └── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) 22+ (LTS)
- [pnpm](https://pnpm.io/) 9+
- [Docker](https://www.docker.com/) + Docker Compose (for local PostgreSQL + Redis)
- Git

## Getting Started

### 1. Clone and install dependencies

```bash
git clone <repo-url> && cd calley
pnpm install
```

### 2. Start infrastructure (PostgreSQL + Redis)

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

### 3. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit the `.env` files as needed. The defaults work with the dev Docker Compose setup.

### 4. Run database migrations

```bash
pnpm --filter api db:push
```

### 5. Seed development data (optional)

```bash
pnpm --filter api db:seed
```

### 6. Start development servers

```bash
pnpm dev
```

This starts the frontend (http://localhost:5173) and API (http://localhost:4000) concurrently with hot reload.

## Available Scripts

| Script                          | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `pnpm dev`                      | Start web + api dev servers concurrently     |
| `pnpm build`                    | Build all packages                           |
| `pnpm lint`                     | Lint all packages with ESLint                |
| `pnpm format`                   | Format all files with Prettier               |
| `pnpm type-check`               | TypeScript type checking across all packages |
| `pnpm test`                     | Run unit + integration tests                 |
| `pnpm test:e2e`                 | Run Playwright E2E tests                     |
| `pnpm --filter api db:generate` | Generate Drizzle migration                   |
| `pnpm --filter api db:push`     | Apply schema to dev database                 |
| `pnpm --filter api db:seed`     | Seed development data                        |
| `pnpm --filter api db:studio`   | Open Drizzle Studio                          |

## Deployment

### Managed Deployment (Vercel + Railway)

This is the recommended deployment approach for most users.

**Frontend (Vercel):**

1. Connect your GitHub repository to [Vercel](https://vercel.com)
2. Set framework preset to **Vite**
3. Set root directory to `apps/web`
4. Set build command: `cd ../.. && pnpm turbo build --filter=web`
5. Set output directory: `dist`
6. Add environment variables: `VITE_API_URL`, `VITE_VAPID_PUBLIC_KEY`

**API (Railway):**

1. Create a new project on [Railway](https://railway.app)
2. Add services: **API** (from Dockerfile at `apps/api/Dockerfile`), **PostgreSQL**, **Redis**
3. Configure all environment variables (see [Environment Variables](#environment-variables) below)
4. Set health check path: `/health/ready`
5. Set the API service's custom domain or use the Railway-provided URL

**Custom Domain Setup:**

1. Point your frontend domain (e.g., `calley.app`) to Vercel via CNAME/A records
2. Point your API subdomain (e.g., `api.calley.app`) to Railway
3. Update `CORS_ORIGIN` to match the frontend domain
4. Update `COOKIE_DOMAIN` to the root domain (e.g., `.calley.app`)
5. SSL certificates are provisioned automatically by both Vercel and Railway

### Docker Self-Hosting

Calley can be self-hosted using Docker Compose on any VPS or server.

#### 1. Configure environment

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` and fill in all required values:

- Generate `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Generate VAPID keys: `npx web-push generate-vapid-keys`
- Set strong passwords for `DB_PASSWORD` and `REDIS_PASSWORD`

#### 2. Build and start

```bash
cd docker
docker compose up -d --build
```

This starts all services:

- **nginx** — Reverse proxy on ports 80/443
- **web** — React frontend (served via nginx)
- **api** — Hono API server
- **db** — PostgreSQL 16
- **redis** — Redis 7

#### 3. Verify health

```bash
curl http://localhost/api/health/ready
# Expected: {"status":"ok","db":"ok","redis":"ok","timestamp":"..."}
```

#### 4. SSL/TLS

To enable HTTPS:

1. Place your SSL certificate files in `docker/certs/` (`fullchain.pem` and `privkey.pem`)
2. Uncomment the SSL server block in `docker/nginx.conf`
3. Restart nginx: `docker compose restart nginx`

Alternatively, use [Caddy](https://caddyserver.com/) or [Traefik](https://traefik.io/) as a reverse proxy with automatic Let's Encrypt certificates.

#### 5. Backups

For self-hosted deployments, set up automated PostgreSQL backups:

```bash
# Create backup directory
mkdir -p ~/calley-backups

# Daily backup via cron (add to crontab with: crontab -e)
0 3 * * * cd /path/to/calley/docker && docker compose exec -T db pg_dump -U calley calley | gzip > ~/calley-backups/calley-$(date +\%Y\%m\%d).sql.gz

# Restore from backup
cd /path/to/calley/docker && gunzip < ~/calley-backups/calley-20260217.sql.gz | docker compose exec -T db psql -U calley calley
```

Redis data is non-critical and is reconstructable from PostgreSQL (reminder jobs are re-enqueued on API startup).

## Environment Variables

### Frontend (`apps/web/.env`)

| Variable                | Description               | Default                        |
| ----------------------- | ------------------------- | ------------------------------ |
| `VITE_API_URL`          | API base URL              | `http://localhost:4000/api/v1` |
| `VITE_VAPID_PUBLIC_KEY` | Web Push VAPID public key | —                              |

### Backend (`apps/api/.env`)

| Variable               | Description                                                                       | Default                       |
| ---------------------- | --------------------------------------------------------------------------------- | ----------------------------- |
| `NODE_ENV`             | Environment                                                                       | `development`                 |
| `PORT`                 | API server port                                                                   | `4000`                        |
| `DATABASE_URL`         | PostgreSQL connection string                                                      | — (required)                  |
| `DB_POOL_MAX`          | Max database pool connections                                                     | `20`                          |
| `DB_QUERY_TIMEOUT`     | Query timeout in milliseconds                                                     | `30000`                       |
| `REDIS_URL`            | Redis connection string                                                           | — (required)                  |
| `SESSION_SECRET`       | Session signing secret (min 32 chars)                                             | — (required)                  |
| `COOKIE_DOMAIN`        | Cookie domain                                                                     | `localhost`                   |
| `CORS_ORIGIN`          | Allowed CORS origin (frontend URL; `*` rejected in production — see `lib/env.ts`) | — (required)                  |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                                                            | —                             |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                                                        | —                             |
| `GOOGLE_REDIRECT_URI`  | Google OAuth callback URL                                                         | —                             |
| `GITHUB_CLIENT_ID`     | GitHub OAuth client ID                                                            | —                             |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret                                                        | —                             |
| `GITHUB_REDIRECT_URI`  | GitHub OAuth callback URL                                                         | —                             |
| `RESEND_API_KEY`       | Resend email API key                                                              | —                             |
| `EMAIL_FROM`           | Sender email address                                                              | `Calley <noreply@calley.app>` |
| `VAPID_PRIVATE_KEY`    | Web Push VAPID private key                                                        | —                             |
| `VAPID_PUBLIC_KEY`     | Web Push VAPID public key                                                         | —                             |
| `VAPID_SUBJECT`        | VAPID subject (mailto: URL)                                                       | —                             |
| `RATE_LIMIT_ENABLED`   | Enable rate limiting                                                              | `true`                        |
| `SENTRY_DSN`           | Sentry error tracking DSN (optional)                                              | —                             |
| `LOG_LEVEL`            | Pino log level                                                                    | `info`                        |

## CI/CD

GitHub Actions workflows are configured for:

- **CI** (`.github/workflows/ci.yml`) — Runs on push to `main`/`staging` and all PRs. Steps: lint, type-check, unit tests, build, integration tests, E2E tests.
- **Preview Deploys** (`.github/workflows/deploy-preview.yml`) — Deploys frontend preview to Vercel on PR open/update.
- **Production Deploys** (`.github/workflows/deploy-production.yml`) — Deploys to Vercel (frontend) and Railway (API) on push to `main`, runs database migrations, and verifies health post-deploy.

### Required GitHub Actions Secrets

| Secret              | Description                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | Vercel API token                                                                                                                      |
| `VERCEL_ORG_ID`     | Vercel organization ID                                                                                                                |
| `VERCEL_PROJECT_ID` | Vercel project ID                                                                                                                     |
| `RAILWAY_TOKEN`     | Railway API token                                                                                                                     |
| `DATABASE_URL`      | Production PostgreSQL connection string (for migrations). Copy from Railway project → Connect tab and add as a GitHub Actions secret. |

### Required GitHub Actions Variables

| Variable                  | Description                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- |
| `PRODUCTION_API_URL`      | Production API URL for health checks (e.g., `https://api.calley.app/api/v1`) |
| `PRODUCTION_FRONTEND_URL` | Production frontend URL for health checks (e.g., `https://calley.app`)       |

## API Endpoints

### Authentication

| Method   | Path                          | Description                       |
| -------- | ----------------------------- | --------------------------------- |
| `POST`   | `/auth/signup`                | Create account (email + password) |
| `POST`   | `/auth/login`                 | Login with email + password       |
| `POST`   | `/auth/logout`                | Logout (invalidate session)       |
| `POST`   | `/auth/forgot-password`       | Request password reset email      |
| `POST`   | `/auth/reset-password`        | Reset password with token         |
| `GET`    | `/auth/me`                    | Get current user profile          |
| `PATCH`  | `/auth/me`                    | Update profile                    |
| `PATCH`  | `/auth/me/password`           | Change password                   |
| `DELETE` | `/auth/me`                    | Delete account                    |
| `GET`    | `/auth/sessions`              | List active sessions              |
| `DELETE` | `/auth/sessions/:id`          | Revoke a specific session         |
| `DELETE` | `/auth/sessions`              | Revoke all other sessions         |
| `GET`    | `/auth/oauth/google`          | Initiate Google OAuth             |
| `GET`    | `/auth/oauth/google/callback` | Google OAuth callback             |
| `GET`    | `/auth/oauth/github`          | Initiate GitHub OAuth             |
| `GET`    | `/auth/oauth/github/callback` | GitHub OAuth callback             |

### Events

| Method   | Path                    | Description                     |
| -------- | ----------------------- | ------------------------------- |
| `GET`    | `/events`               | List events in date range       |
| `POST`   | `/events`               | Create event                    |
| `GET`    | `/events/:id`           | Get single event                |
| `PATCH`  | `/events/:id`           | Update event (with scope param) |
| `DELETE` | `/events/:id`           | Delete event (with scope param) |
| `POST`   | `/events/:id/duplicate` | Duplicate event                 |
| `GET`    | `/events/:id/ics`       | Export as .ics file             |

### Tasks

| Method   | Path                | Description                    |
| -------- | ------------------- | ------------------------------ |
| `GET`    | `/tasks`            | List tasks with filters        |
| `POST`   | `/tasks`            | Create task                    |
| `GET`    | `/tasks/:id`        | Get single task                |
| `PATCH`  | `/tasks/:id`        | Update task (with scope param) |
| `DELETE` | `/tasks/:id`        | Delete task (with scope param) |
| `PATCH`  | `/tasks/:id/toggle` | Toggle task completion         |
| `PATCH`  | `/tasks/reorder`    | Reorder tasks                  |

### Categories, Reminders, Search, Health

| Method   | Path              | Description             |
| -------- | ----------------- | ----------------------- |
| `GET`    | `/categories`     | List categories         |
| `POST`   | `/categories`     | Create category         |
| `PATCH`  | `/categories/:id` | Update category         |
| `DELETE` | `/categories/:id` | Delete category         |
| `GET`    | `/reminders`      | List reminders for item |
| `POST`   | `/reminders`      | Create reminder         |
| `DELETE` | `/reminders/:id`  | Delete reminder         |
| `GET`    | `/search`         | Full-text search        |
| `GET`    | `/stream`         | SSE real-time updates   |
| `GET`    | `/health`         | Liveness probe          |
| `GET`    | `/health/ready`   | Readiness probe         |

## Security

Calley implements production-grade security measures:

- **Authentication**: Session-based (Lucia Auth) with HttpOnly, Secure, SameSite cookies
- **Password Hashing**: Argon2id (memory: 64MB, iterations: 3, parallelism: 4)
- **CSRF Protection**: Double-submit cookie pattern on all state-changing endpoints
- **Rate Limiting**: Redis-backed sliding window on all API endpoints
- **Security Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Input Validation**: All inputs validated via Zod schemas (shared between frontend and backend)
- **HTML Sanitization**: DOMPurify for rich text content
- **Account Security**: Lockout after 5 failed login attempts (30-minute cooldown)
- **Ownership Enforcement**: All queries include userId — no IDOR vulnerabilities
- **Soft Deletes**: Events and tasks use deletedAt with 30-day retention
- **Audit Logging**: Security-relevant actions logged with hashed IP addresses
- **Dependency Auditing**: Dependabot enabled for automated vulnerability detection

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Install dependencies: `pnpm install`
4. Start the dev environment (see [Getting Started](#getting-started))
5. Make your changes following the conventions in `CLAUDE.md`
6. Run checks: `pnpm lint && pnpm type-check && pnpm test`
7. Commit with a clear message describing the change
8. Push and open a pull request

### Code Conventions

- **Files**: `kebab-case.ts` for files, `PascalCase.tsx` for React components
- **Schemas**: Defined in `packages/shared/src/schemas/` — single source of truth for validation
- **Services**: Business logic in `apps/api/src/services/` — routes are thin wrappers
- **Hooks**: Named exports, data fetching via TanStack Query
- **State**: UI state in Zustand stores, server state in TanStack Query cache

See `CLAUDE.md` for detailed conventions and patterns.

## Troubleshooting

### Database connection errors

Ensure the dev Docker containers are running:

```bash
docker compose -f docker/docker-compose.dev.yml ps
# If not running:
docker compose -f docker/docker-compose.dev.yml up -d
```

### Port already in use

If port 4000 (API) or 5173 (frontend) is in use:

```bash
# Check what's using the port
lsof -i :4000
# Kill the process or change the port in .env
```

### Redis connection warnings

The API will start without Redis but with limited functionality (no rate limiting, no reminders). Ensure Redis is running:

```bash
docker compose -f docker/docker-compose.dev.yml up -d redis
```

### Migration issues

If the database schema is out of sync:

```bash
# Reset and re-apply (development only)
pnpm --filter api db:push
# Re-seed if needed
pnpm --filter api db:seed
```

### Docker build failures

Ensure you're building from the repository root (Docker context needs access to the monorepo):

```bash
# From the calley/ root directory:
docker build -f apps/api/Dockerfile .
```

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
