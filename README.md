# bb-trade-transformation

Мульти-сервисная торговая система с мульти-пользовательской моделью и per-user кабинетами. Развёртывание — Railway, 5 сервисов из одного монорепо.

## Архитектура (коротко)

```
userbot (Python)  ->  classify.message  ->  classifier (Node)  ->  execute.signal  ->  trader (Node)
                             pg-boss                                    pg-boss
                                                 PostgreSQL
                                    web (Next.js) <-> api (NestJS slim)
```

Модель доступа: `User` (Telegram login) -> 1 `UserbotSession` -> N `Cabinet` (у каждого свои Bybit-ключи и настройки). Подробности в плане `bb-trader_multi-service_rewrite`.

Старая версия системы лежит рядом в `bb-trader/` — это **readonly reference**, не часть нового репозитория.

## Требования

- Node.js **22+**
- pnpm **9+** (`npm i -g pnpm`)
- Python **3.12+** + [uv](https://docs.astral.sh/uv/) (для `apps/userbot`)
- Docker Desktop (локальная Postgres)

## Локальный запуск

```bash
# 1. Зависимости
pnpm install

# 2. Переменные окружения
cp .env.example .env
# отредактируй .env (минимум: APP_ENCRYPTION_KEY, позже Telegram/OpenRouter)

# 3. Postgres
pnpm docker:dev:up

# 4. Миграции Prisma
pnpm db:migrate

# 5. Dev-запуск всех сервисов через turbo
pnpm dev
```

## Структура

- `apps/userbot` — Python + Telethon: MTProto-приём, QR-login, ingest.
- `apps/classifier` — Node worker: OpenRouter-парсинг сигналов.
- `apps/trader` — Node worker: исполнение сигналов на Bybit per-cabinet.
- `apps/api` — NestJS slim: REST для web + Telegraf confirmation bot.
- `apps/web` — Next.js: UI, Telegram Login, кабинеты.
- `packages/shared-prisma` — Prisma schema + клиент.
- `packages/shared-ts` — DTO, zod-схемы очередей, типы.
- `packages/shared-queue` — обёртка pg-boss.

## Полезные команды

| Команда | Что делает |
|---|---|
| `pnpm dev` | Параллельный dev-запуск всех сервисов |
| `pnpm build` | Продакшн-сборка всех сервисов (через turbo) |
| `pnpm lint` | ESLint во всех пакетах |
| `pnpm db:migrate` | `prisma migrate dev` в shared-prisma |
| `pnpm db:studio` | Prisma Studio |
| `pnpm docker:dev:up` | Поднять локальную Postgres |
| `pnpm docker:dev:down` | Выключить локальную Postgres |

## Дальнейшая работа

См. план `bb-trader_multi-service_rewrite` (в Cursor: `@plan`). Правила для агента — в `.cursor/rules/`. Документация старой системы — `bb-trader/AGENTS.md` и `bb-trader/README.md` (readonly).
