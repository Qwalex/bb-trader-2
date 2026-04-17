/**
 * Основной цикл: select IngestEvent WHERE status='pending_classify' FOR UPDATE SKIP LOCKED,
 * классифицируем, для сигналов извлекаем поля через OpenRouter, пишем SignalDraft,
 * публикуем execute.signal в pg-boss.
 */

import type { PrismaClient } from '@repo/shared-prisma';
import { ExecuteSignalPayload, QUEUE_NAMES } from '@repo/shared-ts';
import type { QueueClient } from '@repo/shared-queue';
import type { AppLogger } from './logger.js';
import { classifyByPatterns } from './classify.js';
import { extractSignal } from './signal-extract.js';
import type { OpenRouterClient } from './openrouter.js';

interface IngestRow {
  id: string;
  userId: string;
  chatId: string;
  messageId: string;
  text: string | null;
  replyToText: string | null;
}

export interface IngestWorkerOptions {
  prisma: PrismaClient;
  queue: QueueClient;
  openrouter: OpenRouterClient;
  logger: AppLogger;
  pollIntervalMs: number;
  batchSize: number;
}

export class IngestWorker {
  private stopped = false;

  constructor(private readonly opts: IngestWorkerOptions) {}

  async run(): Promise<void> {
    const { logger, pollIntervalMs, batchSize } = this.opts;
    logger.info({ pollIntervalMs, batchSize }, 'classifier.worker.start');
    while (!this.stopped) {
      try {
        const processed = await this.processBatch();
        if (processed === 0) {
          await sleep(pollIntervalMs);
        }
      } catch (error) {
        logger.error({ error: errorMessage(error) }, 'classifier.worker.loop_error');
        await sleep(pollIntervalMs * 4);
      }
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private async processBatch(): Promise<number> {
    const { prisma, batchSize } = this.opts;

    const claimed = await prisma.$queryRaw<IngestRow[]>`
      UPDATE "IngestEvent"
      SET status = 'classifying'
      WHERE id IN (
        SELECT id FROM "IngestEvent"
        WHERE status = 'pending_classify'
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      RETURNING id, "userId", "chatId", "messageId", "text", "replyToText"
    `;

    for (const row of claimed) {
      await this.processOne(row);
    }

    return claimed.length;
  }

  private async processOne(row: IngestRow): Promise<void> {
    const { prisma, logger, openrouter, queue } = this.opts;
    const text = row.text ?? '';
    const hasReply = Boolean(row.replyToText);

    const classification = await classifyByPatterns(prisma, { text, hasReply });

    if (classification.classification !== 'signal') {
      await prisma.ingestEvent.update({
        where: { id: row.id },
        data: {
          status: 'ignored',
          classification: classification.classification,
          classifiedAt: new Date(),
        },
      });
      logger.debug(
        { ingestId: row.id, kind: classification.classification },
        'classifier.ignored',
      );
      return;
    }

    try {
      const extracted = await extractSignal(openrouter, text);
      if (extracted.kind === 'not_signal') {
        await prisma.ingestEvent.update({
          where: { id: row.id },
          data: {
            status: 'ignored',
            classification: 'ignore',
            classifiedAt: new Date(),
            classifyError: extracted.reason,
          },
        });
        logger.info({ ingestId: row.id, reason: extracted.reason }, 'classifier.not_signal');
        return;
      }

      const { signal, signalHash, aiRequest, aiResponse } = extracted.data;

      const draft = await prisma.signalDraft.upsert({
        where: {
          userId_signalHash: { userId: row.userId, signalHash },
        },
        create: {
          userId: row.userId,
          ingestEventId: row.id,
          sourceChatId: row.chatId,
          sourceMessageId: row.messageId,
          direction: signal.direction,
          pair: signal.pair,
          entries: JSON.stringify(signal.entries),
          entryIsRange: signal.entryIsRange,
          stopLoss: signal.stopLoss,
          takeProfits: JSON.stringify(signal.takeProfits),
          leverage: signal.leverage,
          signalHash,
          rawMessage: text,
          aiRequest,
          aiResponse,
          status: 'ready',
        },
        update: {
          // если уже был такой же сигнал — отмечаем ingest как "classified", ничего не пере-публикуем
          updatedAt: new Date(),
        },
      });

      await prisma.ingestEvent.update({
        where: { id: row.id },
        data: {
          status: 'classified',
          classification: 'signal',
          classifiedAt: new Date(),
        },
      });

      if (draft.status === 'ready') {
        await queue.send(QUEUE_NAMES.executeSignal, ExecuteSignalPayload, {
          signalDraftId: draft.id,
          userId: row.userId,
        });
      }

      logger.info(
        { ingestId: row.id, signalDraftId: draft.id, signalHash },
        'classifier.signal_ready',
      );
    } catch (error) {
      const message = errorMessage(error);
      logger.error(
        { ingestId: row.id, error: message },
        'classifier.extract_failed',
      );
      await prisma.ingestEvent.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          classifyError: message.slice(0, 2000),
          classifiedAt: new Date(),
        },
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
