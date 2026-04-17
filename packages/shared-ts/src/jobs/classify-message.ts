import { z } from 'zod';

/**
 * Queue: classify.message
 *
 * Producer: apps/userbot — после записи IngestEvent.
 * Consumer: apps/classifier — дергает OpenRouter, пишет SignalDraft, публикует execute.signal.
 *
 * Идемпотентность: уникальность по ingestEventId (у IngestEvent уже есть dedupMessageKey).
 */
export const ClassifyMessagePayload = z.object({
  ingestEventId: z.string(),
  userId: z.string(),
  attempt: z.number().int().nonnegative().default(0),
});

export type ClassifyMessagePayload = z.infer<typeof ClassifyMessagePayload>;
