# apps/classifier

Node worker. Берёт `IngestEvent` со статусом `pending_classify`, определяет тип сообщения
(signal / close / result / reentry / ignore), для сигналов — вытаскивает торговые поля через
OpenRouter, пишет `SignalDraft`, публикует job `execute.signal` для `apps/trader`.

## Pipeline

1. Поллинг `IngestEvent` (`FOR UPDATE SKIP LOCKED`, батч из 10) каждые 500ms.
2. Локальный regex-матчинг через `TgUserbotFilterPattern` (глобальная таблица) — быстро отсеиваем "не сигнал".
3. Если кандидат в сигнал — вызов OpenRouter с промптом (порт из `bb-trader/apps/api/src/modules/transcript/transcript.service.ts`).
4. Валидация результата (pair, direction, entries, sl, tp, leverage) через zod.
5. `UPSERT SignalDraft` (unique userId + signalHash — дедуп).
6. `execute.signal` в pg-boss (consumer — `apps/trader`).
7. Маркировка `IngestEvent.status = 'classified'` / `'ignored'` / `'failed'`.

## Портирование с `bb-trader`

Целевые исходники (readonly reference):
- `bb-trader/apps/api/src/modules/transcript/transcript.service.ts` — промпты, extractJson, retry-логика.
- `bb-trader/apps/api/src/modules/transcript/partial-signal.util.ts` — нормализация SL/TP.

В этой ветке — MVP-каркас; портирование полных промптов — отдельной задачей.

## Env

- `DATABASE_URL`
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`).
- `CLASSIFIER_POLL_INTERVAL_MS` (default 500).
- `CLASSIFIER_BATCH_SIZE` (default 10).
