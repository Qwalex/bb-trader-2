import { z } from 'zod';

/**
 * Queue: execute.lifecycle
 *
 * Producer: apps/classifier — after creating SignalEvent for close/reentry/result.
 * Consumer: apps/trader — applies exchange-side lifecycle actions (close/reduce etc).
 */
export const ExecuteLifecyclePayload = z.object({
  signalEventId: z.string(),
  signalId: z.string(),
  cabinetId: z.string(),
  userId: z.string(),
  eventType: z.enum(['close', 'reentry', 'result']),
  sourceChatId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  replyToMessageId: z.string().nullable().optional(),
});

export type ExecuteLifecyclePayload = z.infer<typeof ExecuteLifecyclePayload>;
