# Agent memory (bb-trade-transformation)

## Suite-wide facts

- **Репозиторий** — новый git-репо в корне workspace `c:\Users\qwazi\Projects\bb-trade-transformation\`. Папка `bb-trader/` **не часть этого репо**: это readonly reference старой версии; она в `.gitignore`, её не редактируем.
- **Стек:** pnpm workspaces + turbo; Node.js 22, TypeScript 5.7, Prisma 6 + PostgreSQL, Python 3.12 + uv (только в `apps/userbot`). Очереди — pg-boss (без Redis).
- **Пять сервисов:** `apps/userbot` (Python), `apps/classifier` (Node worker), `apps/trader` (Node worker), `apps/api` (NestJS slim), `apps/web` (Next.js). Общие пакеты: `packages/shared-prisma`, `packages/shared-ts`, `packages/shared-queue`.
- **Модель доступа:** `User` (вход через Telegram Login Widget) -> 1 `UserbotSession` -> N `Cabinet`. У каждого кабинета свои Bybit-ключи и настройки. Шаринг userbot-потока между кабинетами: сигнал приходит один раз, `trader` делает fanout по кабинетам пользователя.
- **Auth:** только Telegram Login. Bootstrap первого админа через env `INITIAL_ADMIN_TELEGRAM_ID`. Self-signup управляется `GlobalSetting.PUBLIC_SIGNUP_ENABLED` (default `false`).
- **Секреты at rest:** `CabinetBybitKey.apiSecret*` и `UserbotSession.sessionString` шифруются AES-GCM ключом из `APP_ENCRYPTION_KEY` — одинаковым для всех сервисов.

## Dev-команды

- `pnpm install` — установка.
- `pnpm docker:dev:up` — локальная Postgres 16 на `127.0.0.1:5432` (`bb/bb/bb`).
- `pnpm db:migrate` — миграции Prisma (dev).
- `pnpm db:studio` — Prisma Studio.
- `pnpm dev` — запуск всех сервисов.

## Правила агенту

Правила для Cursor-агента — в `.cursor/rules/*.mdc`. Ключевые (`alwaysApply`): `architecture`, `multi-user-cabinets`, `pipeline-queues`, `memory-discipline`, `secrets-and-logs`. File-specific: `python-userbot`, `prisma-schema`, `railway-deploy`.

## Что считается "done" в Prisma schema (быстрая проверка)

- Любая прикладная таблица имеет `userId` или `cabinetId` (или оба); глобальные словари — документированы комментарием.
- `onDelete: Cascade` если запись бессмысленна без родителя.
- На каждую FK есть `@@index([..., createdAt])`.
- Нет `enum` в schema.prisma — только `String` (значения перечислить в zod-схемах `packages/shared-ts`).

## Railway deployment

- 5 сервисов + Postgres-plugin в одном проекте; config-as-code через `apps/<svc>/railway.json`.
- Root Directory каждого сервиса на Railway = **`.`** (корень репо) — иначе Dockerfile не видит `packages/*` и `pnpm-lock.yaml`.
- Общий Dockerfile для Node-сервисов: `docker/node-base.Dockerfile` с ARG `APP_NAME`/`APP_DIR`.
- Python userbot: `docker/userbot.Dockerfile` (uv + Python 3.12).
- Миграции Prisma — **руками** (`pnpm --filter @repo/shared-prisma exec prisma migrate deploy`) после merge в main, чтобы не ловить race между стартующими сервисами.
- Пошаговый runbook: `docs/railway-deployment.md`.

## Сравнение с bb-trader (старая система)

- `bb-trader/apps/api/prisma/schema.prisma` — исходник, с которого портируем (без ref — новая БД пустая).
- `bb-trader/apps/api/src/modules/bybit/bybit.service.ts` (4949 строк) -> расщепить на `Order/Position/Pnl/Reconcile` в `apps/trader/src/bybit/`.
- `bb-trader/apps/api/src/modules/telegram-userbot/telegram-userbot.service.ts` (4736 строк) -> только MTProto-часть в `apps/userbot` (Python); фильтры/mirror — в `classifier`.
- `bb-trader/apps/api/src/modules/transcript/transcript.service.ts` (1672 строки) -> `apps/classifier/src/openrouter/`.
- `bb-trader/apps/api/src/modules/app-log/log-sanitize.ts` -> `packages/shared-ts/src/log-sanitize.ts`.
