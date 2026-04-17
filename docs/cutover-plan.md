# Cutover: переход со старого `bb-trader` (single-tenant monolith) на новый мульти-тенантный сьют

Цель — остановить старый сервис, поднять новый, перенести минимально необходимые данные (секреты + открытые позиции) и проверить торговлю на одном живом signalе без простоя > 5 минут.

## 0. Предварительные условия (за 1-2 дня)

- [ ] Старый `bb-trader` в Railway работает, метрики сняты (RSS / events / ошибки — пригодятся как baseline).
- [ ] Новый проект на Railway создан, 5 сервисов задеплоены (см. `docs/railway-deployment.md`), `DATABASE_URL` указывает на **НОВЫЙ** Postgres-plugin. Новая БД пустая.
- [ ] `APP_ENCRYPTION_KEY` сгенерирован один раз и сохранён в password-manager. Повторно не ротируется.
- [ ] Telegram bot-токен у `@app/api` и `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` у `@app/web` совпадают, бот добавлен как admin в канал подтверждений (если используется). Login Widget домен = `https://<web>.up.railway.app`.
- [ ] У каждого пользователя собраны: Telegram user_id, список Bybit API-keys (mainnet+testnet по желанию), список Telegram-каналов для подписки.

## 1. Prepare (до остановки)

```bash
# Применить миграции в новую БД
DATABASE_URL=<new-db-url> pnpm --filter @repo/shared-prisma exec prisma migrate deploy

# Проверить, что API здоров (пока без трафика)
curl https://<api>.up.railway.app/auth/me  # ожидаем 401 (нет сессии)
```

- [ ] Зайти на `https://<web>.up.railway.app/login`, залогиниться первым админом. Убедиться что `me.role === 'admin'`.
- [ ] Создать главный `Cabinet` для себя (slug = `main`, network = `mainnet`), задать Bybit-ключи через UI `/cabinets/<id>`.
- [ ] Проверить, что ключ принят (`bybitKeyVerifiedAt` заполнилось спустя ~30s).

## 2. Freeze старой системы (~1 min downtime)

- [ ] В Railway (старый проект) поставить `numReplicas: 0` всем сервисам, КРОМЕ БД (оставляем БД на чтение, чтобы при форс-мажоре откатиться).
- [ ] Зафиксировать timestamp `T0`.
- [ ] Прочитать в старой БД все открытые позиции:

```sql
-- на старом Postgres
SELECT id, pair, direction, status, created_at, entry_price_avg, size_total, tg_channel_id
FROM signals
WHERE deleted_at IS NULL AND status IN ('OPEN', 'ORDERS_PLACED');
```

- [ ] Сохранить вывод в `migration-open-positions.json` (вручную) — понадобится для stitch-recovery.

## 3. Импорт исторических сигналов (опционально)

Если нужна история для метрик:

```sql
-- Экспортировать всё, что < T0:
COPY (SELECT * FROM signals WHERE deleted_at IS NULL) TO STDOUT CSV HEADER;
```

Импорт в новую БД — через отдельный one-shot скрипт: на каждую строку присвоить `userId` и `cabinetId` соответствующего пользователя, после чего `INSERT ... ON CONFLICT DO NOTHING`.

> ⚠️ Мы НЕ переносим старые `app_logs`, `openrouter_generation_cost`, `tg_userbot_mirror_message`. Начинаем телеметрию с нуля — это экономит место и минимизирует риск ошибок миграции.

## 4. Перенос Telethon-сессии

Telethon session string — это одна строка. Варианты:

**Вариант A — проще.** Разлогинить userbot у старого, залогиниться заново через новый UI (`/userbot` → QR). Единственное неудобство: Telegram может потребовать подтверждения на 24 часа для незнакомого устройства.

**Вариант B — портирование.** Достать `session_string` из старой БД (она в открытом виде), зашифровать новым `APP_ENCRYPTION_KEY` и вставить в новую:

```sql
-- pseudo:
INSERT INTO "UserbotSession" (id, "userId", phone, "sessionString", status, ...)
VALUES (gen_random_uuid(), '<new-user-id>', '+...', '<encrypted>', 'connected', ...);
```

Скрипт-помощник живёт в `scripts/migrate-userbot-session.ts` (TODO: написать одноразовый, не коммитим).

Рекомендуется **Вариант A** — меньше шансов задеть session_expiration внутри Telethon.

## 5. Старт нового сервиса

- [ ] Railway (новый): `numReplicas = 1` для `userbot / classifier / trader / api / web`. Дождаться healthy у каждого.
- [ ] В UI `/cabinets/<id>` → убедиться, что баланс прилетел (из `poll.cabinet_positions` cron).
- [ ] В UI `/userbot` → статус `connected`, список каналов подтянулся (подписки надо будет сделать заново, см. шаг 6).
- [ ] Открыть `/` → dashboard показывает корректные цифры (0 сигналов — это норма на старте).

## 6. Подписка на каналы в новом userbot

- [ ] В UI `/userbot` добавить каждый канал: `chatId` + `title`. Включить.
- [ ] В `UserbotCommand` улетит `reconnect` (обработается автоматически) → в `UserbotChannel.enabled = true` userbot подпишется на stream.
- [ ] Дождаться первого `IngestEvent` из каждого канала (должно прилететь в течение 1–10 минут).

## 7. Stitch-recovery открытых позиций

Для каждой открытой позиции из `migration-open-positions.json`:

- [ ] Найти по `pair` и `direction` среди новых `Signal` (или создать stub вручную, если не нашлось — через `pnpm db:studio`).
- [ ] Проставить `cabinetId = <main>`, `userId = <admin>`.
- [ ] Вручную вызвать `POST /internal/recover-signal/:id` (endpoint — **TODO: добавить в apps/api**, пока stub-ом). Он запустит `handlePollCabinetPositions` для этого кабинета, который подтянет реальный `filledQty/avgPrice` из Bybit и обновит `Signal.status`.

Если позиций мало (<5) — проще закрыть их вручную на Bybit перед cutover и начать с чистого листа.

## 8. Smoke test

- [ ] В Telegram: отправить в подписанный канал тестовое сообщение-сигнал (буквально 1 пара, мелкий размер).
- [ ] В `/` dashboard: сигнал появился в течение ~30 сек, статус перешёл `DRAFT` → `ORDERS_PLACED`.
- [ ] На Bybit: entry-order увиделся и исполнился.
- [ ] `poll.cabinet_positions` через минуту обновил `BalanceSnapshot`.

## 9. Старая система: teardown

- [ ] Старый `bb-trader` Railway-проект → `pause` (не удалять) на 7 дней: на случай rollback.
- [ ] Через 7 дней стабильной работы — удалить окончательно.
- [ ] Удалить старую Prisma-схему из головы: новая НЕ backward-compatible.

## Rollback (если на шаге 8 всё плохо)

1. Остановить новый `trader` (`numReplicas = 0`) — это отключает торговлю, но оставляет UI и userbot.
2. Включить старый `bb-trader` (`numReplicas = 1`) — он продолжит работать с со своей БД и Telethon-сессией (если не выкинули по Варианту A).
3. Разобраться, что сломалось, в спокойном режиме.

## Метрики успеха

| Метрика | Цель |
|---|---|
| Downtime | < 5 минут |
| Потерянные сигналы за cutover | 0 |
| RSS всех сервисов (sum) на 1 юзера | ≤ 1 GB |
| Latency Telegram → Bybit entry | не хуже старой системы (≤ 5 сек P95) |

---

> Owner: продовый канал в Telegram. При любой неясности — rollback в первую очередь, разбирательства потом.
