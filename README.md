# Calley

A modern, production-grade calendar web application for managing events, tasks, and recurring schedules. Built as a TypeScript monorepo with a React SPA frontend and Hono API backend.

## Tech Stack

| Layer       | Technology                                                 |
| ----------- | ---------------------------------------------------------- |
| Frontend    | React 18, TypeScript 5, Vite 5, Tailwind CSS v4, shadcn/ui |
| State       | Zustand (client), TanStack Query v5 (server)               |
| Routing     | TanStack Router (file-based)                               |
| Backend     | Hono 4.x, Node.js 22                                       |
| Database    | PostgreSQL 16, Drizzle ORM                                 |
| Cache/Queue | Redis 7, BullMQ                                            |
| Auth        | Lucia Auth v3, Arctic.js (OAuth)                           |
| Real-time   | Server-Sent Events (SSE)                                   |
| Monorepo    | pnpm workspaces, Turborepo                                 |

## Architecture

```
calley/
├── apps/web/           # React 18 SPA (Vite, TanStack Router)
├── apps/api/           # Hono REST API (Node.js 22)
├── packages/shared/    # Shared Zod schemas + TypeScript types
└── docker/             # Docker Compose for self-hosting
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
| `pnpm --filter api db:generate` | Generate Drizzle migration                   |
| `pnpm --filter api db:push`     | Apply schema to dev database                 |
| `pnpm --filter api db:seed`     | Seed development data                        |
| `pnpm --filter api db:studio`   | Open Drizzle Studio                          |

## Docker Self-Hosting

Calley can be self-hosted using Docker Compose.

### 1. Configure environment

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` and fill in all required values:

- Generate `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Generate VAPID keys: `npx web-push generate-vapid-keys`
- Set strong passwords for `DB_PASSWORD` and `REDIS_PASSWORD`

### 2. Build and start

```bash
cd docker
docker compose up -d --build
```

This starts all services:

- **nginx** — Reverse proxy on ports 80/443
- **web** — React frontend
- **api** — Hono API server
- **db** — PostgreSQL 16
- **redis** — Redis 7

### 3. Verify health

```bash
curl http://localhost/api/health
# Expected: {"status":"ok"}
```

### SSL/TLS

To enable HTTPS:

1. Place your SSL certificate files in `docker/certs/` (`fullchain.pem` and `privkey.pem`)
2. Uncomment the SSL server block in `docker/nginx.conf`
3. Restart nginx: `docker compose restart nginx`

## Environment Variables

### Frontend (`apps/web/.env`)

| Variable                | Description               | Default                        |
| ----------------------- | ------------------------- | ------------------------------ |
| `VITE_API_URL`          | API base URL              | `http://localhost:4000/api/v1` |
| `VITE_VAPID_PUBLIC_KEY` | Web Push VAPID public key | —                              |

### Backend (`apps/api/.env`)

| Variable               | Description                           | Default                       |
| ---------------------- | ------------------------------------- | ----------------------------- |
| `NODE_ENV`             | Environment                           | `development`                 |
| `PORT`                 | API server port                       | `4000`                        |
| `DATABASE_URL`         | PostgreSQL connection string          | —                             |
| `DB_POOL_MAX`          | Max database pool connections         | `20`                          |
| `REDIS_URL`            | Redis connection string               | —                             |
| `SESSION_SECRET`       | Session signing secret (min 32 chars) | —                             |
| `COOKIE_DOMAIN`        | Cookie domain                         | `localhost`                   |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                | —                             |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret            | —                             |
| `GOOGLE_REDIRECT_URI`  | Google OAuth callback URL             | —                             |
| `GITHUB_CLIENT_ID`     | GitHub OAuth client ID                | —                             |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret            | —                             |
| `GITHUB_REDIRECT_URI`  | GitHub OAuth callback URL             | —                             |
| `RESEND_API_KEY`       | Resend email API key                  | —                             |
| `EMAIL_FROM`           | Sender email address                  | `Calley <noreply@calley.app>` |
| `VAPID_PRIVATE_KEY`    | Web Push VAPID private key            | —                             |
| `VAPID_PUBLIC_KEY`     | Web Push VAPID public key             | —                             |
| `VAPID_SUBJECT`        | VAPID subject (mailto: URL)           | —                             |
| `CORS_ORIGIN`          | Allowed CORS origin (frontend URL)    | `http://localhost:5173`       |
| `RATE_LIMIT_ENABLED`   | Enable rate limiting                  | `true`                        |
| `SENTRY_DSN`           | Sentry error tracking DSN             | —                             |
| `LOG_LEVEL`            | Pino log level                        | `info`                        |

## CI/CD

GitHub Actions workflows are configured for:

- **CI** (`.github/workflows/ci.yml`) — Runs on push to `main`/`staging` and all PRs. Steps: lint, type-check, unit tests, build, integration tests.
- **Preview Deploys** (`.github/workflows/deploy-preview.yml`) — Deploys frontend preview to Vercel on PR open/update.
- **Production Deploys** (`.github/workflows/deploy-production.yml`) — Deploys to Vercel (frontend) and Railway (API) on push to `main`.

### Required GitHub Actions Secrets

| Secret              | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `VERCEL_TOKEN`      | Vercel API token                                       |
| `VERCEL_ORG_ID`     | Vercel organization ID                                 |
| `VERCEL_PROJECT_ID` | Vercel project ID                                      |
| `RAILWAY_TOKEN`     | Railway API token                                      |
| `DATABASE_URL`      | Production database connection string (for migrations) |

## Project Structure

```
calley/
├── .github/workflows/      # CI/CD pipeline configs
├── .husky/                  # Git hooks (pre-commit)
├── .vscode/                 # VS Code recommended settings
├── apps/
│   ├── api/                 # Hono REST API
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── .env.example
│   └── web/                 # React SPA
│       ├── src/
│       ├── Dockerfile
│       └── .env.example
├── docker/
│   ├── docker-compose.yml       # Production compose
│   ├── docker-compose.dev.yml   # Dev compose (Postgres + Redis)
│   ├── nginx.conf               # Reverse proxy config
│   └── .env.example
├── packages/
│   └── shared/              # Shared Zod schemas + types
│       └── src/
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # pnpm workspace config
└── package.json             # Root scripts + dev dependencies
```

## License

All rights reserved.
