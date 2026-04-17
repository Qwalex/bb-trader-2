import { z } from 'zod';

/**
 * Queue: execute.signal
 *
 * Producer: apps/classifier — после записи SignalDraft.status = 'ready'.
 * Consumer: apps/trader — делает fanout по кабинетам пользователя: для каждого включённого
 *   кабинета создаёт CabinetSignal + Signal и ставит ордера на Bybit.
 *
 * Идемпотентность: уникальность по (signalDraftId) на уровне обработки — trader проверяет
 *   наличие CabinetSignal перед созданием (unique index cabinetId+signalDraftId).
 */
export const ExecuteSignalPayload = z.object({
  signalDraftId: z.string(),
  userId: z.string(),
  /** Если указан — fanout только в этот кабинет (используется для retry/manual re-execute). */
  cabinetId: z.string().optional(),
});

export type ExecuteSignalPayload = z.infer<typeof ExecuteSignalPayload>;
