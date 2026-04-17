import { z } from 'zod';

/**
 * Queue: diagnostics.run
 *
 * Админский прогон OpenRouter-моделей на наборе кейсов (снапшот с bb-trader).
 * Producer: apps/api. Consumer: apps/classifier — у него уже есть клиент OpenRouter.
 */
export const DiagnosticsRunPayload = z.object({
  runId: z.string(),
  triggeredByUserId: z.string().nullable().default(null),
  models: z.array(z.string()).min(1),
  caseIds: z.array(z.string()).optional(),
});

export type DiagnosticsRunPayload = z.infer<typeof DiagnosticsRunPayload>;
