# Railway deployment

Один git-репо, 5 сервисов на Railway.

## Сервисы

| Service | Root Directory | Dockerfile | Railway.json |
|---|---|---|---|
| `api`        | `apps/api`        | `docker/node-base.Dockerfile` | `apps/api/railway.json` |
| `classifier` | `apps/classifier` | `docker/node-base.Dockerfile` | `apps/classifier/railway.json` |
| `trader`     | `apps/trader`     | `docker/node-base.Dockerfile` | `apps/trader/railway.json` |
| `web`        | `apps/web`        | `docker/node-base.Dockerfile` | `apps/web/railway.json` |
| `userbot`    | `apps/userbot`    | `docker/userbot.Dockerfile`   | `apps/userbot/railway.json` |

Плюс managed Postgres (Railway `PostgreSQL`-плагин).

## Как это работает

1. В каждом сервисе в Railway UI выставлен **Root Directory = `.`** (не путь к
   приложению!). Мы пробрасываем весь репозиторий как build-context — иначе
   Dockerfile не сможет скопировать `packages/*` и `pnpm-lock.yaml`.
2. `Config-as-code` включён, Railway.json лежит в `apps/<name>/railway.json`.
   Из него Railway берёт `dockerfilePath` (ссылка внутри build-context’а) и
   `buildArgs` для `APP_NAME` / `APP_DIR`.
3. `watchPatterns` гарантирует, что изменения в чужом сервисе не перезапустят
   этот (например, правка `apps/web` не пересобирает `api`).
4. `docker/node-base.Dockerfile` — общий multi-stage билд для четырёх
   TypeScript-сервисов. На финальной стадии он делает
   `pnpm deploy --prod /app`, чтобы в рантайме оказались только runtime-deps
   нужного сервиса — это даёт минимальный RAM на старте.

## Секреты и ENV

Все переменные централизованы в `.env.example`. На Railway они задаются на
**уровне Project** (shared) и переопределяются per-service там, где нужно.

Обязательные shared:

- `DATABASE_URL` (Postgres plugin)
- `APP_ENCRYPTION_KEY` (32 байта base64; НЕ ротировать без миграции)
- `TELEGRAM_BOT_TOKEN`, `INITIAL_ADMIN_TELEGRAM_ID`
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
- `SESSION_SECRET` (только api/web)

Per-service:

- `api`: `API_PORT=3001` (Railway проставит `PORT` сам, код читает оба), `API_CORS_ORIGINS`.
- `web`: `API_INTERNAL_URL` (внутренний URL сервиса `api`), `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
- `userbot`: `TELEGRAM_USERBOT_API_ID`, `TELEGRAM_USERBOT_API_HASH`.
- `trader`: `POLL_CABINET_POSITIONS_CRON`.

## Миграции БД

Миграции применяем ВРУЧНУЮ или отдельной one-shot командой (чтобы не было race
между одновременно стартующими сервисами):

```bash
# локально, против prod БД, после merge в main:
pnpm --filter @repo/shared-prisma exec prisma migrate deploy
```

На Railway это можно повесить pre-deploy hook в сервисе `api` (через
`releaseCommand`), но тогда ошибки миграции не уронят остальные сервисы.

## Проверка памяти

После деплоя проверьте метрики Railway:

| Service | Ожидаемый RSS (idle) | Заметки |
|---|---|---|
| userbot (на 1 юзера) | ~80–100 MB | плюс ~40–60 MB на каждую следующую UserbotSession |
| classifier | ~120 MB | OpenRouter-клиент без SDK, pino-логгер |
| trader | ~150 MB | bybit-api + N пулов соединений |
| api | ~180–220 MB | NestJS + Fastify |
| web | ~220–260 MB | Next.js standalone |

Ориентир: сумма на 1 активного юзера — **~800–900 MB RSS** (против 2+ GB в
монолите `bb-trader`).
