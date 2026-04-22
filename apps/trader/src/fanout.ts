/**
 * Fanout `execute.signal`: один SignalDraft -> N CabinetSignal -> N Signal -> N ордеров.
 *
 * Логика:
 *   1. Загружаем SignalDraft.
 *   2. Находим все enabled кабинеты пользователя, у которых CabinetChannelFilter для
 *      userbotChannel (по sourceChatId) разрешён (или нет отдельного фильтра — разрешено по дефолту).
 *   3. Для каждого кабинета:
 *        - Читаем CabinetSetting для этого кабинета (DEFAULT_ORDER_USD, FORCED_LEVERAGE).
 *        - Создаём CabinetSignal (unique: cabinetId+signalDraftId).
 *        - Создаём Signal с cabinetId/userId.
 *        - Вызываем OrderService.placeSignalOrders.
 *        - Обновляем CabinetSignal.status и Signal.
 *   4. Отмечаем SignalDraft.status = 'fanned_out'.
 */

import type { PrismaClient } from '@repo/shared-prisma';
import type { SignalDirection } from '@repo/shared-ts';
import type { AppLogger } from './logger.js';
import type { BybitOrderService } from './bybit/order-service.js';

export interface FanoutOptions {
  prisma: PrismaClient;
  orderService: BybitOrderService;
  logger: AppLogger;
}

export interface FanoutInput {
  signalDraftId: string;
  userId: string;
  /** Если задан — fanout только в этот кабинет. */
  onlyCabinetId?: string;
}

export class SignalFanoutService {
  constructor(private readonly opts: FanoutOptions) {}

  async handle(input: FanoutInput): Promise<void> {
    const { prisma, logger } = this.opts;

    const draft = await prisma.signalDraft.findUnique({
      where: { id: input.signalDraftId },
      include: { ingestEvent: true },
    });
    if (!draft) {
      logger.warn({ signalDraftId: input.signalDraftId }, 'trader.fanout.draft_missing');
      return;
    }
    if (draft.status === 'fanned_out' && !input.onlyCabinetId) {
      logger.debug({ signalDraftId: draft.id }, 'trader.fanout.already_done');
      return;
    }

    const cabinets = await prisma.cabinet.findMany({
      where: {
        ownerUserId: input.userId,
        enabled: true,
        ...(input.onlyCabinetId ? { id: input.onlyCabinetId } : {}),
      },
      include: {
        settings: true,
        channelFilters: {
          where: { enabled: true },
          include: { userbotChannel: true },
        },
        bybitKey: true,
      },
    });

    if (cabinets.length === 0) {
      logger.info(
        { signalDraftId: draft.id, userId: input.userId },
        'trader.fanout.no_cabinets',
      );
    }

    let executedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    for (const cabinet of cabinets) {
      const filters: Array<{
        userbotChannel: { chatId: string };
        enabled: boolean;
        defaultLeverage: number | null;
        forcedLeverage: number | null;
        defaultEntryUsd: string | null;
      }> = cabinet.channelFilters;
      const channelFilter = filters.find((f) => f.userbotChannel.chatId === draft.sourceChatId);

      const hasExplicit = filters.some((f) => f.userbotChannel.chatId === draft.sourceChatId);
      if (hasExplicit && !channelFilter) {
        await this.recordSkip(cabinet.id, draft.id, 'channel_disabled_for_cabinet');
        skippedCount += 1;
        continue;
      }
      if (!cabinet.bybitKey) {
        await this.recordSkip(cabinet.id, draft.id, 'no_bybit_key');
        skippedCount += 1;
        continue;
      }

      const settingsByKey = new Map<string, string>(
        (cabinet.settings as Array<{ key: string; value: string }>).map((s) => [s.key, s.value]),
      );
      const defaultOrderUsd = parseNumericSetting(
        settingsByKey.get('DEFAULT_ORDER_USD'),
        channelFilter?.defaultEntryUsd ?? null,
      );
      const leverage = pickLeverage(
        draft.leverage,
        settingsByKey.get('FORCED_LEVERAGE'),
        channelFilter?.forcedLeverage ?? null,
        channelFilter?.defaultLeverage ?? null,
      );

      try {
        const entries = JSON.parse(draft.entries) as number[];
        const takeProfits = JSON.parse(draft.takeProfits) as number[];

        const existingCabinetSignal = await prisma.cabinetSignal.findUnique({
          where: {
            cabinetId_signalDraftId: { cabinetId: cabinet.id, signalDraftId: draft.id },
          },
          select: { id: true, signalId: true, status: true },
        });
        if (existingCabinetSignal?.status === 'executed') {
          logger.info(
            { signalDraftId: draft.id, cabinetId: cabinet.id },
            'trader.fanout.cabinet_already_executed',
          );
          executedCount += 1;
          continue;
        }

        const cabinetSignal = existingCabinetSignal
          ? await prisma.cabinetSignal.update({
              where: { id: existingCabinetSignal.id },
              data: { status: 'executing', error: null, startedAt: new Date(), finishedAt: null },
            })
          : await prisma.cabinetSignal.create({
              data: {
                cabinetId: cabinet.id,
                signalDraftId: draft.id,
                status: 'executing',
                startedAt: new Date(),
              },
            });

        const signal = existingCabinetSignal?.signalId
          ? await prisma.signal.findUniqueOrThrow({
              where: { id: existingCabinetSignal.signalId },
            })
          : await prisma.signal.create({
              data: {
                cabinetId: cabinet.id,
                userId: input.userId,
                pair: draft.pair,
                direction: draft.direction,
                entries: draft.entries,
                entryIsRange: draft.entryIsRange,
                stopLoss: draft.stopLoss,
                takeProfits: draft.takeProfits,
                leverage,
                orderUsd: defaultOrderUsd,
                source: 'userbot',
                sourceChatId: draft.sourceChatId,
                sourceMessageId: draft.sourceMessageId,
                rawMessage: draft.rawMessage,
                status: 'PENDING',
              },
            });

        if (!existingCabinetSignal?.signalId) {
          await prisma.cabinetSignal.update({
            where: { id: cabinetSignal.id },
            data: { signalId: signal.id },
          });
        }

        await this.opts.orderService.placeSignalOrders({
          signalId: signal.id,
          cabinetId: cabinet.id,
          pair: draft.pair,
          direction: draft.direction as SignalDirection,
          entries,
          stopLoss: draft.stopLoss,
          takeProfits,
          leverage,
          orderUsd: defaultOrderUsd,
        });

        await prisma.$transaction([
          prisma.signal.update({
            where: { id: signal.id },
            data: { status: 'ORDERS_PLACED' },
          }),
          prisma.cabinetSignal.update({
            where: { id: cabinetSignal.id },
            data: { status: 'executed', finishedAt: new Date() },
          }),
        ]);

        logger.info(
          { signalDraftId: draft.id, cabinetId: cabinet.id, signalId: signal.id },
          'trader.fanout.cabinet_executed',
        );
        executedCount += 1;
      } catch (error) {
        const msg = errorMessage(error);
        logger.error(
          { signalDraftId: draft.id, cabinetId: cabinet.id, error: msg },
          'trader.fanout.cabinet_failed',
        );
        await prisma.cabinetSignal.upsert({
          where: {
            cabinetId_signalDraftId: { cabinetId: cabinet.id, signalDraftId: draft.id },
          },
          create: {
            cabinetId: cabinet.id,
            signalDraftId: draft.id,
            status: 'failed',
            error: msg.slice(0, 2000),
            finishedAt: new Date(),
          },
          update: {
            status: 'failed',
            error: msg.slice(0, 2000),
            finishedAt: new Date(),
          },
        });
        const existingSignal = await prisma.signal.findFirst({
          where: {
            cabinetId: cabinet.id,
            userId: input.userId,
            sourceChatId: draft.sourceChatId,
            sourceMessageId: draft.sourceMessageId,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true },
        });
        if (existingSignal && existingSignal.status === 'PENDING') {
          await prisma.signal.update({
            where: { id: existingSignal.id },
            data: { status: 'FAILED', closedAt: new Date() },
          });
        }
        failedCount += 1;
      }
    }

    await prisma.signalDraft.update({
      where: { id: draft.id },
      data: {
        status: failedCount > 0 && executedCount === 0 ? 'rejected' : 'fanned_out',
        rejectReason:
          failedCount > 0 && executedCount === 0
            ? `fanout failed for all cabinets; failed=${failedCount}, skipped=${skippedCount}`
            : null,
      },
    });
  }

  private async recordSkip(
    cabinetId: string,
    signalDraftId: string,
    reason: string,
  ): Promise<void> {
    await this.opts.prisma.cabinetSignal.upsert({
      where: { cabinetId_signalDraftId: { cabinetId, signalDraftId } },
      create: {
        cabinetId,
        signalDraftId,
        status: 'skipped_by_filter',
        skipReason: reason,
        finishedAt: new Date(),
      },
      update: {
        status: 'skipped_by_filter',
        skipReason: reason,
        finishedAt: new Date(),
      },
    });
    this.opts.logger.info(
      { cabinetId, signalDraftId, reason },
      'trader.fanout.skipped',
    );
  }
}

function parseNumericSetting(value: string | undefined, fallback: string | null): number {
  const raw = value ?? fallback ?? '10';
  const cleaned = raw.replace('%', '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function pickLeverage(
  signalLeverage: number,
  globalForced: string | undefined,
  channelForced: number | null,
  channelDefault: number | null,
): number {
  const toNum = (v: string | number | null | undefined): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return (
    toNum(channelForced) ??
    toNum(globalForced) ??
    toNum(channelDefault) ??
    toNum(signalLeverage) ??
    10
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
