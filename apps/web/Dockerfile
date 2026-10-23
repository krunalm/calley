FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS build
WORKDIR /app
# Same-origin deployments (the bundled docker-compose stack) serve the API
# behind nginx at /api/v1, so the client must call it relatively. Split
# deployments override this at build time: --build-arg VITE_API_URL=https://api.example.com/api/v1
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_VAPID_PUBLIC_KEY=""
ENV VITE_VAPID_PUBLIC_KEY=${VITE_VAPID_PUBLIC_KEY}
COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json package.json ./
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=web

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
