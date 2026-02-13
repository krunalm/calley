FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
COPY package.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=api

FROM base AS runtime
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
USER hono
EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/index.js"]
