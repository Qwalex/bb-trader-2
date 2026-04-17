import { z } from 'zod';

/**
 * Queue: poll.cabinet_positions
 *
 * Cron job (каждые 30s по умолчанию, настройка POLL_CABINET_POSITIONS_CRON).
 * Consumer: apps/trader — итерирует включённые кабинеты, тянет Bybit positions,
 *   обновляет Signal.status/Order.status, применяет TP/SL-шаги, пишет BalanceSnapshot.
 *
 * Payload пуст — обработчик сам ходит за cabinet-ами.
 */
export const PollCabinetPositionsPayload = z
  .object({
    /** Если указан — poll только выбранного кабинета (manual trigger). */
    cabinetId: z.string().optional(),
  })
  .default({});

export type PollCabinetPositionsPayload = z.infer<typeof PollCabinetPositionsPayload>;
