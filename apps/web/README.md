# @app/web — Next.js UI

Тонкий фронтенд для bb-trader-next. Держит только UI-логику: Telegram Login
Widget, список кабинетов, CRUD настроек/Bybit-ключей/userbot-каналов, страница
dashboard.

## Не делает
- прямых вызовов к Bybit / Telethon / OpenRouter;
- чтения БД — только REST к `@app/api`.

## Переменные окружения

| Var | Описание |
|---|---|
| `API_INTERNAL_URL` | URL на API (используется rewrite-прокси `/api/proxy/...`). |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | имя бота для виджета Telegram Login. |
| `NEXT_PUBLIC_BRAND_NAME` | отображаемое имя проекта (по умолчанию `bb-trader`). |

## Локально

```bash
pnpm install
pnpm -C apps/web dev
```

Открыть http://localhost:3000 — при отсутствии admin-юзера попросит
залогиниться через Telegram (ID должен совпадать с `INITIAL_ADMIN_TELEGRAM_ID`
в API).
