# Railway deployment — пошаговый гайд

Один git-репозиторий, 5 сервисов + managed Postgres в одном Railway-проекте. Всё описано в `apps/<svc>/railway.json` (Config-as-code), но у первой настройки есть ~15 кликов в UI — их и описываем.

## Что получим в итоге

```
Railway project "bb-trader"
├── Postgres            ← managed plugin (автогенерит DATABASE_URL)
├── api                 ← NestJS REST, публичный домен
├── web                 ← Next.js UI, публичный домен
├── userbot             ← Python+Telethon, приватный
├── classifier          ← Node worker, приватный
└── trader              ← Node worker, приватный
```

Публичные — те, к которым ходит браузер. Приватные общаются только внутри Railway-сети и с Telegram/Bybit/OpenRouter.

## Обзор архитектуры деплоя

| Service    | Root Directory | Dockerfile                     | Railway.json                     |
|------------|----------------|--------------------------------|----------------------------------|
| `api`      | **`/`**        | `docker/node-base.Dockerfile`  | `apps/api/railway.json`          |
| `classifier` | **`/`**      | `docker/node-base.Dockerfile`  | `apps/classifier/railway.json`   |
| `trader`   | **`/`**        | `docker/node-base.Dockerfile`  | `apps/trader/railway.json`       |
| `web`      | **`/`**        | `docker/node-base.Dockerfile`  | `apps/web/railway.json`          |
| `userbot`  | **`/`**        | `docker/userbot.Dockerfile`    | `apps/userbot/railway.json`      |

**Важно:** Root Directory у ВСЕХ сервисов = `/` (корень репозитория). Dockerfile сам копирует только нужное. Иначе в контекст не попадут `packages/*`, `pnpm-lock.yaml`, `tsconfig.base.json` — и Node-сервисы не соберутся.

---

## Часть 0. Предварительно — локально

Убедись, что всё собирается и запускается локально:

```bash
# 1. Postgres
pnpm docker:dev:up

# 2. Secrets для .env
echo "DATABASE_URL=postgresql://bb:bb@localhost:5432/bb?schema=public" > .env
echo "APP_ENCRYPTION_KEY=$(openssl rand -base64 32)"       >> .env
echo "SESSION_SECRET=$(openssl rand -base64 48)"           >> .env

# 3. Миграции и генерация
pnpm install
pnpm db:migrate:deploy   # применит prisma/migrations/*
pnpm db:generate

# 4. Типы
pnpm -r typecheck
```

Сохрани `.env` в password-manager — на Railway понадобятся те же значения (особенно `APP_ENCRYPTION_KEY`, его нельзя генерить заново — расшифровка сохранённых секретов сломается).

---

## Часть 1. Создать Railway-проект

1. [railway.com](https://railway.com) → **New Project** → **Empty Project**. Название: `bb-trader`.
2. В проекте → **+ New** → **Database** → **PostgreSQL**. Дождаться, пока плагин поднимется (зелёный статус).
3. Открыть сервис `Postgres` → вкладка **Variables** → убедиться, что есть `DATABASE_URL` (плагин сам её генерит).
4. (Опционально, но рекомендую) в `Postgres` → **Settings** → включить **Serverless** = OFF. Иначе БД засыпает и первые запросы после простоя отдают timeout.

---

## Часть 2. Shared-переменные проекта

Переменные на уровне **Project** (шарятся всеми сервисами), а не per-service. Railway → проект → **Variables** (вкладка на уровне проекта, не сервиса).

| Key | Value | Комментарий |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ссылка-референс на плагин |
| `APP_ENCRYPTION_KEY` | тот же, что локально | 32 байта в base64 |
| `SESSION_SECRET` | тот же, что локально | >=48 символов |
| `TELEGRAM_BOT_TOKEN` | из @BotFather | для HMAC-проверки Login-виджета |
| `INITIAL_ADMIN_TELEGRAM_ID` | твой Telegram user id | первый вход = admin |
| `OPENROUTER_API_KEY` | из openrouter.ai | |
| `OPENROUTER_MODEL` | напр. `anthropic/claude-3.5-sonnet` | |
| `NODE_ENV` | `production` | |
| `LOG_LEVEL` | `info` | |

Синтаксис `${{Postgres.DATABASE_URL}}` — это Railway-референс: при перегенерации пароля у БД все сервисы получат новое значение автоматически.

---

## Часть 3. Создать 5 сервисов

Для каждого сервиса повторяем одно и то же:

1. В проекте → **+ New** → **GitHub Repo** → выбрать `bb-trade-transformation`.
2. Название сервиса задать ровно как в таблице (`api` / `classifier` / `trader` / `web` / `userbot`) — от этого зависит внутренний DNS (см. ниже).
3. Открыть созданный сервис → **Settings**:
   - **Source Repo**: ветка `main` (или твоя dev-ветка).
   - **Root Directory**: оставить `/` (или поле пустым).
   - **Config-as-code**: указать `apps/<name>/railway.json`.
     _Пример для api: `apps/api/railway.json`. Railway сразу подтянет оттуда Dockerfile, buildArgs, watchPatterns._
   - **Builder**: выставится в `DOCKERFILE` автоматически из railway.json.
4. **Deploy** — запустится первый билд. Он упадёт, пока нет per-service env (см. часть 4) — это нормально.

### Per-service настройки сети

Сразу на вкладке **Settings → Networking**:

| Service | Public Networking | Private Networking |
|---|---|---|
| `api`        | **Generate Domain** (появится `api-production-xxxx.up.railway.app`) | on |
| `web`        | **Generate Domain** | on |
| `trader`     | off | on |
| `classifier` | off | on |
| `userbot`    | off | on |

Internal DNS: каждый сервис доступен внутри проекта по `http://<service-name>.railway.internal:<PORT>`. Например, web достучится до api по `http://api.railway.internal:3001`.

---

## Часть 4. Per-service переменные

Открываем **каждый** сервис → **Variables** → **Raw Editor** и вставляем свой блок. Shared-переменные уже унаследованы, добавляем только специфичные.

> **Важно про `APP_NAME` / `APP_DIR`.** Все 4 Node-сервиса собираются из одного общего `docker/node-base.Dockerfile`. Чтобы он понял, что именно билдить, он читает `ARG APP_NAME` / `ARG APP_DIR`. Railway **игнорирует `buildArgs` в `railway.json`** — единственный способ их задать — через Service Variables. Railway автоматически пробрасывает переменные сервиса в build stage, если в Dockerfile есть соответствующий `ARG` (у нас есть).

### `api`

```env
APP_NAME=@app/api
APP_DIR=apps/api
PORT=3001
API_CORS_ORIGINS=https://<твой-web-домен>.up.railway.app
```

- `PORT=3001` — Railway по умолчанию подставляет случайный `PORT`, мы фиксируем его, чтобы (а) healthcheck бил в тот же порт, что код действительно слушает, (б) в web-сервисе можно было прописать предсказуемый `API_INTERNAL_URL`. Код api уважает `PORT` (приоритет) и `API_PORT` (фолбэк на 3001).
- После того как `web` получит публичный домен — впиши его в `API_CORS_ORIGINS` и передеплой api, иначе браузер получит CORS-ошибку.

### `web`

```env
APP_NAME=@app/web
APP_DIR=apps/web
PORT=3000
API_INTERNAL_URL=http://api.railway.internal:3001
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=<имя_твоего_бота_без_@>
NEXT_PUBLIC_BRAND_NAME=bb-trader
```

- `PORT=3000` — аналогично api, фиксируем явно. `next start` сам читает `$PORT` и слушает на нём.
- `API_INTERNAL_URL` — для server-side fetch из Next.js к api. Порт должен совпадать с `PORT` сервиса api. Клиент в браузер этот URL никогда не увидит.

### `userbot`

```env
TELEGRAM_USERBOT_API_ID=33823949
TELEGRAM_USERBOT_API_HASH=58e7df7b71dc7b7be2173eb132d59056
USERBOT_POLL_INTERVAL_MS=2000
```

API id/hash получаются **один раз** на [my.telegram.org](https://my.telegram.org) → API Development tools. Это НЕ бот-токен, это МТProto-креды для юзер-сессии.

`userbot` собирается отдельным `docker/userbot.Dockerfile` и не требует `APP_NAME`/`APP_DIR`.

### `classifier`

```env
APP_NAME=@app/classifier
APP_DIR=apps/classifier
CLASSIFIER_POLL_INTERVAL_MS=1000
CLASSIFIER_BATCH_SIZE=10
```

### `trader`

```env
APP_NAME=@app/trader
APP_DIR=apps/trader
POLL_CABINET_POSITIONS_CRON=*/30 * * * * *
TRADER_SIGNAL_CONCURRENCY=2
```

---

## Часть 5. Настроить Telegram Login Widget

Login-виджет работает только с доменом, заранее зарегистрированным у бота:

1. В Telegram открыть `@BotFather` → `/mybots` → выбрать своего бота → **Bot Settings** → **Domain**.
2. Ввести домен web-сервиса: `<web-xxx>.up.railway.app` (без `https://`).
3. Если поменяешь домен потом — обнови здесь, иначе виджет молча не покажется.

---

## Часть 6. Применить миграции БД

Первый раз — вручную против Railway-Postgres, не автоматически на Railway (чтобы не ловить race между стартующими сервисами):

```bash
# Railway Postgres → Variables → скопировать DATABASE_URL (с реальным паролем).
# Временно подменить локальный .env на prod-версию:
cp .env .env.backup
echo "DATABASE_URL=postgresql://postgres:...@containers-us-west-NN.railway.app:NNNN/railway" > .env
# (остальные ключи для миграций не нужны)

pnpm db:migrate:deploy

# Вернуть локальный .env:
mv .env.backup .env
```

Альтернативно, если не хочется трогать `.env`, можно запустить `prisma` напрямую с инлайновой переменной:

```bash
DATABASE_URL="postgresql://..." \
  pnpm --filter @repo/shared-prisma exec prisma migrate deploy
```

Проверить:

```bash
pnpm --filter @repo/shared-prisma exec prisma studio
# откроется http://localhost:5555 — видны пустые таблицы User, Cabinet, и т.д.
```

---

## Часть 7. Первый деплой и проверка

1. Railway → каждый сервис → **Deployments** → дождаться зелёного **Active** у всех пяти.
2. Порядок запуска не важен — сервисы независимы. Если какой-то failed — открой **Logs**, скорее всего не хватает env-переменной.
3. Сразу после `Active` проверить сервисы в таком порядке:

**`api`** — ожидается 401 (нет сессии) на `/auth/me`:

```bash
curl -i https://<api-domain>.up.railway.app/auth/me
# HTTP/2 401
```

**`web`** — открыть `https://<web-domain>.up.railway.app/login`:
- Должен отрендериться Telegram Login-виджет.
- Если виджет не появился → домен не зарегистрирован в BotFather (часть 5).

**Login flow:**
- Нажать кнопку "Log in with Telegram", подтвердить.
- Браузер редиректит на `/`, показывается Dashboard с ролью **admin** (благодаря `INITIAL_ADMIN_TELEGRAM_ID`).

**`userbot`** — пока нет сессии, логи должны показать:

```
{"level":"info","service":"userbot","msg":"no active sessions, idle"}
```

**`trader`** — в логах первый cron-tick:

```
{"level":"info","service":"trader","msg":"poll.cabinet_positions: no enabled cabinets"}
```

**`classifier`** — в логах:

```
{"level":"info","service":"classifier","msg":"ingest poll: 0 events"}
```

---

## Часть 8. Создать первый кабинет и проверить торговую петлю

В UI (`/cabinets`):

1. **+ Новый кабинет** → slug `test`, network `testnet` (сначала на testnet!). Создать.
2. Открыть кабинет → ввести Bybit **testnet** API key/secret.
3. В `trader` логах через ~30 сек: `cabinet verify ok cabinetId=...`. Если `verify failed` — ключи с неправильной сетью или без нужных прав (Spot+Derivatives read/trade).
4. Dashboard → выбрать этот кабинет в селекторе → появится блок с балансом (может быть 0, если testnet-кошелёк пустой — пополни через [testnet.bybit.com](https://testnet.bybit.com)).

**Userbot login:**

1. `/userbot` → **Залогиниться (QR)**.
2. Через ~2 сек появится QR-картинка.
3. Telegram на телефоне → **Settings → Devices → Link Desktop Device** → сканируй.
4. Статус меняется на `connected`, приходит первый `ping` event.

**Подписка на канал:**

1. `/userbot` → **+ Добавить канал** → `chatId` (получается через [@userinfobot](https://t.me/userinfobot) или через web-версию ТГ — URL вида `t.me/c/1234567890/...` = chatId `-1001234567890`).
2. Включить канал. В логах `userbot`: `subscribed chatId=...`.
3. Отправить в этом канале тестовое сообщение — в `classifier` логах должен появиться `IngestEvent processed`.

---

## Часть 9. Пост-деплой чек-лист

- [ ] На каждом сервисе **Metrics → Memory** показывает RSS в пределах таблицы (см. ниже).
- [ ] В `api` нет стектрейсов без контекста (искать `"level":50`).
- [ ] На вкладке **Networking** у `api`/`web` включён **HTTPS redirect**.
- [ ] Cкопирован доступ к Postgres-бэкапам (Railway → Postgres → **Backups** → снапшоты раз в сутки по умолчанию у Pro).
- [ ] В `web` → Variables → `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` совпадает с реальным username бота.
- [ ] У бота в BotFather зарегистрирован домен web-сервиса.

### Ожидаемое потребление памяти

| Service | RSS idle | RSS под нагрузкой | Заметки |
|---|---|---|---|
| `userbot` (1 юзер) | ~80–100 MB | +40–60 MB на каждого доп. юзера | Telethon + cryptg |
| `classifier` | ~120 MB | +30 MB под LLM-запросом | без ai-sdk, fetch напрямую в OpenRouter |
| `trader` | ~150 MB | +20 MB на активный кабинет | bybit-api + Prisma |
| `api` | ~180–220 MB | до 300 MB | NestJS + Fastify |
| `web` | ~220–260 MB | ~300 MB | Next.js standalone |

**Суммарно на 1 юзера ≈ 800–900 MB RSS**, против 2+ GB старого монолита. Railway Hobby-план ($5/мес, 512 MB/сервис, **не хватит** на api/web) — нужно либо Developer ($10/мес, 8 GB на сервис), либо Pro.

---

## Постоянный ритм разработки

После первого деплоя жизнь простая:

1. `git push origin main` (или PR → merge).
2. Railway триггерит билд только тех сервисов, чьи `watchPatterns` совпали с изменёнными файлами:
   - правка в `apps/trader/**` → пересборка только `trader`.
   - правка в `packages/**` → пересборка **всех Node-сервисов** (они делят `shared-*`).
   - правка в `apps/userbot/**` → пересборка только `userbot`.
3. Если правил Prisma-schema — ПЕРЕД мержем в main:

   ```bash
   pnpm db:migrate   # создать новую миграцию локально
   git add packages/shared-prisma/prisma/migrations
   git commit -m "db: <что-поменял>"
   ```

   После мержа — **до** того, как сервисы перезапустятся:

   ```bash
   DATABASE_URL=<prod> pnpm --filter @repo/shared-prisma exec prisma migrate deploy
   ```

   Иначе новый код попадёт в runtime раньше миграции и уронит сервис.

---

## Частые грабли

**«Dockerfile not found»** → в railway.json указан несуществующий `dockerfilePath`. Проверь, что в Git есть `docker/node-base.Dockerfile`, и что Railway смотрит на правильную ветку.

**«Cannot find module '@repo/shared-prisma'» в рантайме** → забыл `pnpm --filter @repo/shared-prisma exec prisma generate` внутри Dockerfile (у нас это делается, но если меняли — проверь).

**`api` стартует, но возвращает 500 на `/auth/telegram-login`** → не совпадает `TELEGRAM_BOT_TOKEN` с тем, что в BotFather для текущего домена.

**CORS ошибка в браузере** → `API_CORS_ORIGINS` у api не содержит домен `web`. Переменная — comma-separated список, `https://` обязателен.

**`userbot` крутит QR-логин в бесконечности** → не пришли `TELEGRAM_USERBOT_API_ID/HASH` или пришли с бот-API (это разные сущности!). Проверить на my.telegram.org.

**Railway пересобирает весь мир на каждый коммит** → `watchPatterns` не подхватился. Проверь, что `apps/<svc>/railway.json` в git и что поле **Config-as-code Path** в Railway UI → Settings указывает на этот файл.

**`trader` пишет `cabinet verify failed: invalid api key`** → ключи Bybit созданы под другой Network (mainnet-ключом нельзя ходить в testnet API). Создай ключ на нужной странице и перепривяжи.

**Билд падает с `flag '--mount=type=cache,...' is missing the cacheKey prefix from its id`** → кто-то добавил в Dockerfile `RUN --mount=type=cache,id=...`. Railway принимает cache mounts только в формате `id=s/<service-id>-<target>,target=<target>` и **не разрешает** ARG/ENV в id ([docs](https://docs.railway.com/guides/dockerfiles#cache-mounts)). У нас один общий `docker/node-base.Dockerfile` на 4 сервиса, поэтому hardcoded `service-id` туда не вписать. Решение: не использовать `--mount=type=cache` — обычный Docker layer cache уже покрывает кейс «lockfile не менялся». Если реально упираешься в билд-время — делай per-service Dockerfile с hardcoded id, а не общий.

**Билд падает с `pnpm: Unsupported package selector: {...}` на строке `pnpm --filter "${APP_NAME}..." build`** → `APP_NAME` не пробросилась в билд, `${APP_NAME}` = пустая строка, и pnpm получает фильтр `...` без имени пакета. Причина: Railway **игнорирует `buildArgs` в `railway.json`** ([docs](https://docs.railway.com/builds/dockerfiles#using-variables-at-build-time)). Пробрасывать билд-переменные надо через обычные Service Variables в UI — Railway сам подставит их в `ARG`, объявленные в Dockerfile. Решение: в **Variables** каждого Node-сервиса должны быть заданы `APP_NAME` (например `@app/api`) и `APP_DIR` (`apps/api`). Смотри раздел «Per-service переменные» выше.

**Healthcheck failed у `api` / `web`, публичный домен отдаёт `Application failed to respond`** → сервис слушает не тот порт, куда Railway шлёт запросы. Railway автоматически инжектит `PORT` (случайный) и ждёт, что приложение привяжется именно к нему. Решение: в Variables сервиса явно задать `PORT=3001` для api и `PORT=3000` для web. Код api уже уважает `PORT` с приоритетом над `API_PORT`, Next.js (`next start`) уважает `$PORT` по умолчанию. Если после этого healthcheck всё ещё падает — проверь, что в логах api видно `api.ready { port: 3001 }` и что `API_CORS_ORIGINS` содержит домен web.

**Билд `userbot` падает с `runc run failed: container process is already dead` на строке `COPY apps/userbot/...`** → Railway заворачивает «файла нет в build context» в общий runc-error. Проверь `git check-ignore -v apps/userbot/pyproject.toml apps/userbot/uv.lock` — если хоть один из них игнорируется, Railway его не получит. В репе специально **убрали** `.python-version` из `.gitignore`; если кто-то вернёт — Dockerfile всё равно не должен его требовать (`FROM python:3.12-slim` уже фиксирует версию). Решение: закоммить недостающие файлы и убедись, что они в git.

**`userbot` крашится в рантайме с `ModuleNotFoundError: No module named 'structlog'` (или любая другая зависимость)** → `uv sync` ставит зависимости в venv `/app/.venv`, а команда запуска вызывает **системный** `python` без пакетов. В Dockerfile обязательно должен быть `ENV PATH="/app/.venv/bin:$PATH"` **после** `uv sync`, иначе `python -m bb_userbot.main` возьмёт не тот интерпретатор. Альтернатива — запускать через `uv run python -m bb_userbot.main` (медленнее старт, но тоже работает).

---

## Откат

У Railway встроенный rollback: **Deployments** → старый green deploy → **Redeploy**. Поднимется тот же образ с теми же env, которые были тогда. Данные в Postgres при этом НЕ откатываются — для этого нужно восстановить из бэкапа (Postgres plugin → Backups → Restore).

Для БД-миграций одноразового отката в Prisma нет; если зарелизил миграцию и она сломала прод — пиши **forward-fix migration**, а не ручной `DROP COLUMN`.

---

## Что дальше

- Автоматизация миграций: вместо ручного `migrate deploy` можно добавить **Release Command** в сервис `api` (Settings → Deploy → Pre-Deploy Command): `pnpm --filter @repo/shared-prisma exec prisma migrate deploy`. Тогда миграции применятся перед стартом api, а остальные сервисы потом.
- Preview-окружения: Railway умеет деплоить каждый PR в отдельный env — под это понадобятся отдельные `APP_ENCRYPTION_KEY` и отдельная БД (копия через `pg_dump`).
- Observability: Railway ограниченно показывает логи; если нужно больше — подключи Logtail / Better Stack (обе поддерживают syslog-форвард из Railway out-of-the-box).

Когда будешь переходить с текущего `bb-trader` — см. `docs/cutover-plan.md`.
