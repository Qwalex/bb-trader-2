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
  fallbackModel?: string;
}

export class IngestWorker {
  private stopped = false;
  private lastCreditsSyncAt = 0;

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
    await this.resolvePendingOpenrouterCosts();
    await this.syncOpenrouterCredits();

    return claimed.length;
  }

  private async processOne(row: IngestRow): Promise<void> {
    const { prisma, logger, openrouter, queue } = this.opts;
    try {
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

      const classification = await classifyByPatterns(prisma, {
        userId: row.userId,
        chatId: row.chatId,
        text,
        hasReply,
      });

    // Explicit lifecycle/ignore match from local filters/examples.
      if (
        classification.classification != null &&
        classification.classification !== 'signal'
      ) {
        await this.handleLifecycleEvent(row, classification.classification);
        return;
      }

      try {
        const extracted = await extractSignal(openrouter, this.buildExtractorInput(text, row.rawJson), {
          fallbackModel: this.opts.fallbackModel,
        });
      const generationId =
        extracted.kind === 'signal' ? extracted.data.generationId : extracted.generationId;
      await this.recordOpenrouterCost({
        generationId,
        operation: 'signal_extract',
        ingestId: row.id,
        userId: row.userId,
        cabinetId: row.cabinetId,
        chatId: row.chatId,
        sourceType: row.sourceType,
      });
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
    } catch (error) {
      const message = errorMessage(error);
      logger.error({ ingestId: row.id, error: message }, 'classifier.process_one_failed');
      await prisma.ingestEvent.updateMany({
        where: { id: row.id, status: 'classifying' },
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

  private async recordOpenrouterCost(input: {
    generationId: string | null;
    operation: string;
    ingestId: string;
    userId: string;
    cabinetId: string | null;
    chatId: string;
    sourceType: string;
  }): Promise<void> {
    const { prisma, openrouter, logger } = this.opts;
    if (!input.generationId) return;
    try {
      const costUsd = await openrouter.fetchGenerationCostUsd(input.generationId);
      await prisma.openrouterGenerationCost.upsert({
        where: { generationId: input.generationId },
        create: {
          generationId: input.generationId,
          operation: input.operation,
          chatId: input.chatId,
          source: input.sourceType,
          ingestId: input.ingestId,
          userId: input.userId,
          cabinetId: input.cabinetId,
          costUsd,
          status: costUsd == null ? 'pending' : 'resolved',
          attempts: 1,
          lastError: costUsd == null ? 'cost_missing' : null,
        },
        update: {
          operation: input.operation,
          chatId: input.chatId,
          source: input.sourceType,
          ingestId: input.ingestId,
          userId: input.userId,
          cabinetId: input.cabinetId,
          costUsd,
          status: costUsd == null ? 'pending' : 'resolved',
          attempts: { increment: 1 },
          lastError: costUsd == null ? 'cost_missing' : null,
          nextRetryAt: costUsd == null ? new Date(Date.now() + 60_000) : null,
        },
      });
    } catch (error) {
      await prisma.openrouterGenerationCost.upsert({
        where: { generationId: input.generationId },
        create: {
          generationId: input.generationId,
          operation: input.operation,
          chatId: input.chatId,
          source: input.sourceType,
          ingestId: input.ingestId,
          userId: input.userId,
          cabinetId: input.cabinetId,
          status: 'pending',
          attempts: 1,
          lastError: errorMessage(error).slice(0, 1000),
          nextRetryAt: new Date(Date.now() + 60_000),
        },
        update: {
          operation: input.operation,
          chatId: input.chatId,
          source: input.sourceType,
          ingestId: input.ingestId,
          userId: input.userId,
          cabinetId: input.cabinetId,
          status: 'pending',
          attempts: { increment: 1 },
          lastError: errorMessage(error).slice(0, 1000),
          nextRetryAt: new Date(Date.now() + 60_000),
        },
      });
      logger.warn(
        { generationId: input.generationId, error: errorMessage(error) },
        'classifier.openrouter.cost_pending',
      );
    }
  }

  private async resolvePendingOpenrouterCosts(limit = 20): Promise<void> {
    const { prisma, openrouter, logger } = this.opts;
    const now = new Date();
    const rows = await prisma.openrouterGenerationCost.findMany({
      where: {
        status: 'pending',
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    for (const row of rows) {
      try {
        const costUsd = await openrouter.fetchGenerationCostUsd(row.generationId);
        await prisma.openrouterGenerationCost.update({
          where: { id: row.id },
          data: {
            costUsd,
            status: costUsd == null ? 'pending' : 'resolved',
            attempts: { increment: 1 },
            nextRetryAt: costUsd == null ? new Date(Date.now() + 60_000) : null,
            lastError: costUsd == null ? 'cost_missing' : null,
          },
        });
      } catch (error) {
        const attempts = row.attempts + 1;
        const nextRetryAt = new Date(Date.now() + Math.min(60 * 60_000, attempts * 30_000));
        await prisma.openrouterGenerationCost.update({
          where: { id: row.id },
          data: {
            status: attempts >= 15 ? 'failed' : 'pending',
            attempts,
            nextRetryAt: attempts >= 15 ? null : nextRetryAt,
            lastError: errorMessage(error).slice(0, 1000),
          },
        });
        logger.warn(
          { generationId: row.generationId, attempts, error: errorMessage(error) },
          'classifier.openrouter.cost_retry_failed',
        );
      }
    }
  }

  private async syncOpenrouterCredits(): Promise<void> {
    const { prisma, openrouter, logger } = this.opts;
    if (Date.now() - this.lastCreditsSyncAt < 5 * 60_000) return;
    this.lastCreditsSyncAt = Date.now();
    try {
      const credits = await openrouter.fetchCredits();
      await prisma.$transaction([
        prisma.globalSetting.upsert({
          where: { key: 'OPENROUTER_TOTAL_CREDITS' },
          create: { key: 'OPENROUTER_TOTAL_CREDITS', value: String(credits.totalCredits ?? '') },
          update: { value: String(credits.totalCredits ?? '') },
        }),
        prisma.globalSetting.upsert({
          where: { key: 'OPENROUTER_TOTAL_USAGE' },
          create: { key: 'OPENROUTER_TOTAL_USAGE', value: String(credits.totalUsage ?? '') },
          update: { value: String(credits.totalUsage ?? '') },
        }),
        prisma.globalSetting.upsert({
          where: { key: 'OPENROUTER_REMAINING_CREDITS' },
          create: {
            key: 'OPENROUTER_REMAINING_CREDITS',
            value: String(credits.remainingCredits ?? ''),
          },
          update: { value: String(credits.remainingCredits ?? '') },
        }),
        prisma.globalSetting.upsert({
          where: { key: 'OPENROUTER_CREDITS_SYNCED_AT' },
          create: { key: 'OPENROUTER_CREDITS_SYNCED_AT', value: new Date().toISOString() },
          update: { value: new Date().toISOString() },
        }),
      ]);
    } catch (error) {
      logger.warn({ error: errorMessage(error) }, 'classifier.openrouter.credits_sync_failed');
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
