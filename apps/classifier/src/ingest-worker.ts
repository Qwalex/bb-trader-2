/**
 * Основной цикл: select IngestEvent WHERE status='pending_classify' FOR UPDATE SKIP LOCKED,
 * классифицируем, для сигналов извлекаем поля через OpenRouter, пишем SignalDraft,
 * публикуем execute.signal в pg-boss.
 */

import type { PrismaClient } from '@repo/shared-prisma';
import { ExecuteLifecyclePayload, ExecuteSignalPayload, QUEUE_NAMES } from '@repo/shared-ts';
import type { QueueClient } from '@repo/shared-queue';
import type { AppLogger } from './logger.js';
import { classifyByPatterns } from './classify.js';
import { extractSignal } from './signal-extract.js';
import type { OpenRouterClient } from './openrouter.js';

interface IngestRow {
  id: string;
  userId: string;
  cabinetId: string | null;
  sourceType: string;
  chatId: string;
  messageId: string;
  text: string | null;
  replyToText: string | null;
  replyToMessageId: string | null;
  rawJson: string | null;
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
               , "replyToMessageId", "rawJson", "cabinetId", "sourceType"
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
    const mediaKind = extractMediaKind(row.rawJson);

    if (!text.trim() && mediaKind) {
      await prisma.ingestEvent.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          classification: 'ignore',
          classifyError: `unsupported_media_without_text:${mediaKind}`,
          classifiedAt: new Date(),
        },
      });
      await prisma.appLog.create({
        data: {
          userId: row.userId,
          cabinetId: row.cabinetId,
          level: 'warn',
          category: 'classifier',
          service: 'classifier',
          message: 'ingest skipped: media without text',
          payload: JSON.stringify({
            ingestId: row.id,
            mediaKind,
            chatId: row.chatId,
            messageId: row.messageId,
          }),
        },
      });
      return;
    }

    const classification = await classifyByPatterns(prisma, { text, hasReply });

    if (classification.classification !== 'signal') {
      await this.handleLifecycleEvent(row, classification.classification);
      return;
    }

    try {
      const extracted = await extractSignal(openrouter, this.buildExtractorInput(text, row.rawJson));
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

      const { signal, signalHash: rawSignalHash, aiRequest, aiResponse } = extracted.data;
      const signalHash =
        row.sourceType === 'cabinet_bot' && row.cabinetId
          ? `cabinet:${row.cabinetId}:${rawSignalHash}`
          : rawSignalHash;

      const draft = await prisma.signalDraft.upsert({
        where: {
          userId_signalHash: { userId: row.userId, signalHash },
        },
        create: {
          userId: row.userId,
          ingestEventId: row.id,
          sourceType: row.sourceType,
          targetCabinetId: row.cabinetId,
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
          cabinetId: row.cabinetId ?? undefined,
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

  private async handleLifecycleEvent(
    row: IngestRow,
    classification: 'close' | 'result' | 'reentry' | 'ignore',
  ): Promise<void> {
    const { prisma, logger, queue } = this.opts;
    await prisma.ingestEvent.update({
      where: { id: row.id },
      data: {
        status: classification === 'ignore' ? 'ignored' : 'classified',
        classification,
        classifiedAt: new Date(),
      },
    });
    if (classification === 'ignore') {
      logger.debug({ ingestId: row.id, kind: classification }, 'classifier.ignored');
      return;
    }

    const candidateSignals = await prisma.signal.findMany({
      where: row.replyToMessageId
        ? {
            userId: row.userId,
            ...(row.sourceType === 'cabinet_bot' && row.cabinetId ? { cabinetId: row.cabinetId } : {}),
            sourceChatId: row.chatId,
            sourceMessageId: row.replyToMessageId,
            deletedAt: null,
            status: { in: ['OPEN', 'ORDERS_PLACED', 'PENDING'] },
          }
        : {
            userId: row.userId,
            ...(row.sourceType === 'cabinet_bot' && row.cabinetId ? { cabinetId: row.cabinetId } : {}),
            sourceChatId: row.chatId,
            deletedAt: null,
            status: { in: ['OPEN', 'ORDERS_PLACED'] },
          },
      select: { id: true, cabinetId: true, sourceMessageId: true },
      orderBy: { createdAt: 'desc' },
      take: row.replyToMessageId ? 20 : 50,
    });

    if (candidateSignals.length === 0) {
      logger.info(
        {
          ingestId: row.id,
          kind: classification,
          chatId: row.chatId,
          replyToMessageId: row.replyToMessageId,
        },
        'classifier.lifecycle.no_matching_signal',
      );
      return;
    }

    for (const signal of candidateSignals) {
      const event = await prisma.signalEvent.create({
        data: {
          cabinetId: signal.cabinetId,
          signalId: signal.id,
          type: classification,
          payload: JSON.stringify({
            ingestId: row.id,
            text: row.text,
            replyToText: row.replyToText,
            sourceMessageId: row.messageId,
            replyToMessageId: row.replyToMessageId,
          }),
        },
      });
      await queue.send(
        QUEUE_NAMES.executeLifecycle,
        ExecuteLifecyclePayload,
        {
          signalEventId: event.id,
          signalId: signal.id,
          cabinetId: signal.cabinetId,
          userId: row.userId,
          eventType: classification,
          sourceChatId: row.chatId,
          sourceMessageId: row.messageId,
          replyToMessageId: row.replyToMessageId,
        },
        {
          singletonKey: `lifecycle:${event.id}`,
          retryLimit: 5,
          retryDelaySeconds: 10,
        },
      );
    }
    logger.info(
      { ingestId: row.id, matchedSignals: candidateSignals.length, kind: classification },
      'classifier.lifecycle_event',
    );
  }

  private buildExtractorInput(text: string, rawJson: string | null): string {
    if (!rawJson) return text;
    try {
      const raw = JSON.parse(rawJson) as { mediaKind?: string | null };
      if (!raw.mediaKind) return text;
      return `${text}\n\n[message_metadata mediaKind=${raw.mediaKind}]`;
    } catch {
      return text;
    }
  }
}

function extractMediaKind(rawJson: string | null): string | null {
  if (!rawJson) return null;
  try {
    const raw = JSON.parse(rawJson) as { mediaKind?: string | null };
    return raw.mediaKind ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
