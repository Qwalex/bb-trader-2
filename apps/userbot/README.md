# apps/userbot

Python + Telethon. Один процесс мультиплексирует MTProto-сессии N пользователей.

## Ответственности

- Слушать включённые каналы каждого активного `UserbotSession` (`status = connected`).
- Писать входящие сообщения в `IngestEvent` (+ `dedupMessageKey` для идемпотентности).
- Публиковать job `classify.message` в pg-boss.
- Исполнять команды из очереди `userbot.command` (QR-login, logout, add_channel, remove_channel).
- Писать AppLog напрямую в Postgres (без промежуточного сервиса).

## НЕ ответственности

- Не парсит сигналы (это делает `apps/classifier`).
- Не ходит в Bybit.
- Не владеет user's Telegram bot-token'ом (тот — в `apps/api`).
- Не шлёт сообщения в Telegram от имени bot'а (это `apps/api`).

## Локальный запуск

```bash
cd apps/userbot
uv sync
uv run python -m bb_userbot.main
```

Обязательные env:
- `DATABASE_URL` — Postgres, где лежат User/UserbotSession/IngestEvent.
- `APP_ENCRYPTION_KEY` — для дешифрования `UserbotSession.sessionString`.
- `TELEGRAM_USERBOT_API_ID`, `TELEGRAM_USERBOT_API_HASH` — MTProto credentials (my.telegram.org).
