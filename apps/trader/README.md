# apps/trader

Node worker. Единственный сервис, который ходит в Bybit.

## Ответственности

1. **Consumer `execute.signal`** — получает `SignalDraftId`, делает fanout по включённым кабинетам пользователя (`Cabinet.enabled = true` + `CabinetChannelFilter.enabled`).
2. **Bybit-клиент per-cabinet** — ленивое создание, кешируется в памяти; apiSecret дешифруется через `APP_ENCRYPTION_KEY`.
3. **Ордер-плейсмент** — ENTRY/DCA/TP/SL ордера, сохранение в `Order` с `cabinetId`.
4. **Cron `poll.cabinet_positions`** — опрос позиций, обновление статусов `Signal`/`Order`, подтягивание TP/SL (`tpSlStep`), запись `BalanceSnapshot`.
5. **Closed-pnl recalc** — consumer `recalc.closed_pnl` (админская ручка).

## Декомпозиция (в процессе — MVP-каркас)

Исходник для портирования (readonly reference):
- `bb-trader/apps/api/src/modules/bybit/bybit.service.ts` (4949 строк) → расщепить на:
  - `src/bybit/order.service.ts`
  - `src/bybit/position.service.ts`
  - `src/bybit/pnl.service.ts`
  - `src/bybit/reconcile.service.ts`
  - `src/bybit/client-registry.ts` (кеш RestClientV5 по cabinetId)
- `bb-trader/apps/api/src/modules/orders/orders.service.ts` → `src/orders/`

MVP здесь содержит scaffolding и consumer'ы, без полной торговой логики. Полный порт — отдельной задачей.

## Env

- `DATABASE_URL`
- `APP_ENCRYPTION_KEY` (для дешифровки Bybit-ключей)
- `POLL_CABINET_POSITIONS_CRON` (default `*/30 * * * * *`)
- `TRADER_SIGNAL_CONCURRENCY` (default 2)
