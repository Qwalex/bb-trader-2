# =========================================================================
# docker/node-base.Dockerfile
#
# Общий Dockerfile для Node-сервисов в монорепе:
#   - ARG APP_NAME — имя в pnpm workspace (например, @app/api).
#   - ARG APP_DIR  — относительный путь (apps/api).
#
# Используется из корня репозитория как build-context. На Railway укажите
# `dockerfilePath = docker/node-base.Dockerfile` и подставьте ARG через
# `buildArgs` в railway.json каждого сервиса.
# =========================================================================
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
# Две строки — BuildKit иначе ругается UndefinedVar на $PNPM_HOME в той же ENV.
ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable

# -------- deps & build -----------------------------------------------------
FROM base AS builder
ARG APP_NAME
ARG APP_DIR
WORKDIR /repo

# Сначала manifests — чтобы pnpm install кешировался без изменений исходников.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared-prisma/package.json packages/shared-prisma/package.json
COPY packages/shared-queue/package.json packages/shared-queue/package.json
COPY packages/shared-ts/package.json packages/shared-ts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/classifier/package.json apps/classifier/package.json
COPY apps/trader/package.json apps/trader/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

# Теперь исходники.
COPY packages packages
COPY apps/api apps/api
COPY apps/classifier apps/classifier
COPY apps/trader apps/trader
COPY apps/web apps/web

# Генерируем Prisma Client (нужен всем Node-сервисам).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN pnpm --filter @repo/shared-prisma exec prisma generate

# Билдим целевой сервис и все его transitive deps в workspace.
# Удаляем tsconfig.tsbuildinfo из контекста: если файл попал в образ, tsc с incremental
# может не пересобрать dist при отсутствии выходных .js — ломается следующий пакет в графе.
RUN find /repo/packages /repo/apps -name 'tsconfig.tsbuildinfo' -delete 2>/dev/null || true \
 && pnpm --filter "${APP_NAME}..." build

# -------- runtime ----------------------------------------------------------
FROM base AS runner
ARG APP_NAME
ARG APP_DIR
ENV NODE_ENV=production

# Копируем deploy-слепок, чтобы в финальном образе не было dev-deps и
# лишних пакетов (экономия RAM и времени старта).
# Важно: `pnpm deploy` должен выполняться из корня workspace (`/repo`),
# иначе cwd остаётся пустым `/app` и pnpm печатает «No projects found in "/app"».
COPY --from=builder /repo /repo
WORKDIR /repo
RUN pnpm --filter "${APP_NAME}" --prod deploy /app \
 && rm -rf /repo

WORKDIR /app
# web: `pnpm start` → `node ./scripts/start-web.mjs` (standalone, см. apps/web/package.json).
# api/classifier/trader: `node dist/main.js`. Railway прокидывает PORT.
CMD ["pnpm", "start"]
