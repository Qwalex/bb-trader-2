# apps/api

NestJS slim (Fastify) — REST backend для web и единственный процесс, который:

- Валидирует Telegram Login HMAC и создаёт `Session`.
- Управляет Cabinets + Bybit-ключами (шифрование секретов через `APP_ENCRYPTION_KEY`).
- Публикует команды в `UserbotCommand` для `apps/userbot` (QR-login, logout, add/remove channel).
- Читает dashboard-данные (Signals/Orders/BalanceSnapshot).
- (позже) Гоняет Telegraf bot для подтверждения сигналов в публичный чат.

## НЕ делает

- Не импортирует `bybit-api`, `telethon`, `@openrouter/sdk`. Все тяжёлые либы — в trader/userbot/classifier.
- Не исполняет ордера; только публикует события/команды.

## Endpoints (MVP)

```
POST   /auth/telegram-login
GET    /auth/me
POST   /auth/logout
GET    /cabinets
POST   /cabinets
PATCH  /cabinets/:id
DELETE /cabinets/:id
PUT    /cabinets/:id/bybit-key
GET    /cabinets/:id/settings
PUT    /cabinets/:id/settings
GET    /userbot/session
POST   /userbot/commands      body: { type, payload? }
GET    /userbot/channels
POST   /userbot/channels
PATCH  /userbot/channels/:id
DELETE /userbot/channels/:id
```

## Env

- `DATABASE_URL`, `APP_ENCRYPTION_KEY`
- `TELEGRAM_BOT_TOKEN` — для HMAC-проверки Login Widget
- `INITIAL_ADMIN_TELEGRAM_ID` — первый логин с этим id получит role=admin
- `SESSION_SECRET` — cookie signing
- `API_CORS_ORIGINS` — список через запятую
- `API_PORT` — default 3001
