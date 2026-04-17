import { z } from 'zod';

/**
 * Queue: recalc.closed_pnl
 *
 * Админский ретроспективный пересчёт realizedPnl по закрытым сигналам (через Bybit closed-pnl API).
 * Producer: apps/api (админ-ручка).
 * Consumer: apps/trader — сам хранит Bybit-клиентов, выгодно делать там.
 */
export const RecalcClosedPnlPayload = z.object({
  jobId: z.string(),
  /** Пересчитать только выбранный кабинет. Null = все включённые. */
  cabinetId: z.string().nullable().default(null),
  dryRun: z.boolean().default(true),
  limit: z.number().int().positive().max(10000).default(500),
});

export type RecalcClosedPnlPayload = z.infer<typeof RecalcClosedPnlPayload>;
