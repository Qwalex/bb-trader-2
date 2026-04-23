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
import { decryptSecret } from '@repo/shared-ts';
import type { SignalDirection } from '@repo/shared-ts';
import type { AppLogger } from './logger.js';
import type { BybitOrderService } from './bybit/order-service.js';

export interface FanoutOptions {
  prisma: PrismaClient;
  orderService: BybitOrderService;
  logger: AppLogger;
  encryptionKey: string;
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
    if (draft.userId !== input.userId) {
      logger.warn(
        { signalDraftId: draft.id, draftUserId: draft.userId, payloadUserId: input.userId },
        'trader.fanout.user_mismatch_payload_ignored',
      );
    }
    const ownerUserId = draft.userId;

    const targetCabinetId = draft.targetCabinetId ?? input.onlyCabinetId;
    const cabinets = await prisma.cabinet.findMany({
      where: {
        ownerUserId,
        enabled: true,
        ...(targetCabinetId ? { id: targetCabinetId } : {}),
      },
      include: {
        settings: true,
        channelFilters: {
          where: { enabled: true },
          include: { userbotChannel: true },
        },
        bybitKey: true,
        telegramBot: true,
        publishGroups: {
          where: { enabled: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (cabinets.length === 0) {
      logger.info(
        { signalDraftId: draft.id, userId: ownerUserId },
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
        minLotBump: boolean | null;
      }> = cabinet.channelFilters;
      const channelFilter = filters.find((f) => f.userbotChannel.chatId === draft.sourceChatId);

      const hasExplicit = filters.some((f) => f.userbotChannel.chatId === draft.sourceChatId);
      if (draft.sourceType !== 'cabinet_bot' && hasExplicit && !channelFilter) {
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
      const dcaEnabled = parseBooleanSetting(settingsByKey.get('DCA_ENABLED'), true);
      const entryFillStrategy = (settingsByKey.get('ENTRY_FILL_STRATEGY') ?? 'limit').toLowerCase();
      const tpSlStepPolicy = settingsByKey.get('TP_SL_STEP_POLICY') ?? null;
      const globalDefaultLeverage = parseNumericNullable(settingsByKey.get('DEFAULT_LEVERAGE'));
      const globalMinLotBump = parseBooleanSetting(settingsByKey.get('BUMP_TO_MIN_EXCHANGE_LOT'), true);
      const minLotBump = channelFilter?.minLotBump ?? globalMinLotBump;
      const defaultOrderUsd = parseNumericSetting(
        settingsByKey.get('DEFAULT_ORDER_USD'),
        channelFilter?.defaultEntryUsd ?? null,
      );
      const leverage = pickLeverage(
        draft.leverage,
        settingsByKey.get('FORCED_LEVERAGE'),
        channelFilter?.forcedLeverage ?? null,
        channelFilter?.defaultLeverage ?? null,
        globalDefaultLeverage,
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
                userId: ownerUserId,
                pair: draft.pair,
                direction: draft.direction,
                entries: draft.entries,
                entryIsRange: draft.entryIsRange,
                stopLoss: draft.stopLoss,
                takeProfits: draft.takeProfits,
                leverage,
                orderUsd: defaultOrderUsd,
                source: draft.sourceType,
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
          dcaEnabled,
          entryFillStrategy,
          tpSlStepPolicy,
          minLotBump,
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

        await this.publishMirrorMessages({
          cabinetId: cabinet.id,
          userId: ownerUserId,
          draftId: draft.id,
          sourceChatId: draft.sourceChatId,
          sourceMessageId: draft.sourceMessageId,
          pair: draft.pair,
          direction: draft.direction,
          entries,
          stopLoss: draft.stopLoss,
          takeProfits,
          publishGroups: (cabinet.publishGroups as Array<{
            id: string;
            chatId: string;
            title: string;
            publishEveryN: number;
            signalCounter: number;
          }>),
          botTokenEncrypted: cabinet.telegramBot?.botTokenEncrypted ?? null,
        });

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
            userId: ownerUserId,
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
        status: executedCount > 0 ? 'fanned_out' : 'rejected',
        rejectReason: executedCount > 0
          ? null
          : cabinets.length === 0
            ? 'no_enabled_cabinets'
            : failedCount > 0 && skippedCount === 0
              ? `failed_all; failed=${failedCount}`
              : failedCount === 0 && skippedCount > 0
                ? `skipped_all; skipped=${skippedCount}`
                : `failed_and_skipped; failed=${failedCount}; skipped=${skippedCount}`,
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

  private async publishMirrorMessages(input: {
    cabinetId: string;
    userId: string;
    draftId: string;
    sourceChatId: string;
    sourceMessageId: string;
    pair: string;
    direction: string;
    entries: number[];
    stopLoss: number;
    takeProfits: number[];
    publishGroups: Array<{ id: string; chatId: string; title: string; publishEveryN: number; signalCounter: number }>;
    botTokenEncrypted: string | null;
  }): Promise<void> {
    const { prisma, logger } = this.opts;
    if (input.publishGroups.length === 0) return;
    if (!input.botTokenEncrypted) {
      for (const group of input.publishGroups) {
        await prisma.tgUserbotMirrorMessage.upsert({
          where: { publishGroupId_ingestId_kind: { publishGroupId: group.id, ingestId: input.draftId, kind: 'signal' } },
          create: {
            userId: input.userId,
            publishGroupId: group.id,
            ingestId: input.draftId,
            sourceChatId: input.sourceChatId,
            sourceMessageId: input.sourceMessageId,
            kind: 'signal',
            status: 'failed',
            targetChatId: group.chatId,
            error: 'cabinet bot is not configured',
          },
          update: {
            status: 'failed',
            error: 'cabinet bot is not configured',
          },
        });
      }
      return;
    }
    const token = decryptSecret({ encryptionKey: this.opts.encryptionKey }, input.botTokenEncrypted);
    for (const group of input.publishGroups) {
      const nextCounter = group.signalCounter + 1;
      if (nextCounter % group.publishEveryN !== 0) {
        await prisma.$transaction([
          prisma.cabinetPublishGroup.update({
            where: { id: group.id },
            data: { signalCounter: nextCounter },
          }),
          prisma.tgUserbotMirrorMessage.upsert({
            where: {
              publishGroupId_ingestId_kind: {
                publishGroupId: group.id,
                ingestId: input.draftId,
                kind: 'signal',
              },
            },
            create: {
              userId: input.userId,
              publishGroupId: group.id,
              ingestId: input.draftId,
              sourceChatId: input.sourceChatId,
              sourceMessageId: input.sourceMessageId,
              kind: 'signal',
              status: 'skipped_by_n',
              targetChatId: group.chatId,
              error: null,
            },
            update: {
              status: 'skipped_by_n',
              error: null,
            },
          }),
        ]);
        continue;
      }
      try {
        const text = formatMirrorText(input);
        const targetMessageId = await this.sendTelegramMessage(token, group.chatId, text);
        await prisma.$transaction([
          prisma.cabinetPublishGroup.update({
            where: { id: group.id },
            data: { signalCounter: nextCounter },
          }),
          prisma.tgUserbotMirrorMessage.upsert({
            where: {
              publishGroupId_ingestId_kind: {
                publishGroupId: group.id,
                ingestId: input.draftId,
                kind: 'signal',
              },
            },
            create: {
              userId: input.userId,
              publishGroupId: group.id,
              ingestId: input.draftId,
              sourceChatId: input.sourceChatId,
              sourceMessageId: input.sourceMessageId,
              kind: 'signal',
              status: 'posted',
              targetChatId: group.chatId,
              targetMessageId,
            },
            update: {
              status: 'posted',
              targetChatId: group.chatId,
              targetMessageId,
              error: null,
            },
          }),
        ]);
      } catch (error) {
        await prisma.$transaction([
          prisma.cabinetPublishGroup.update({
            where: { id: group.id },
            data: { signalCounter: nextCounter },
          }),
          prisma.tgUserbotMirrorMessage.upsert({
            where: {
              publishGroupId_ingestId_kind: {
                publishGroupId: group.id,
                ingestId: input.draftId,
                kind: 'signal',
              },
            },
            create: {
              userId: input.userId,
              publishGroupId: group.id,
              ingestId: input.draftId,
              sourceChatId: input.sourceChatId,
              sourceMessageId: input.sourceMessageId,
              kind: 'signal',
              status: 'failed',
              targetChatId: group.chatId,
              error: errorMessage(error).slice(0, 500),
            },
            update: {
              status: 'failed',
              error: errorMessage(error).slice(0, 500),
            },
          }),
        ]);
        logger.warn(
          { cabinetId: input.cabinetId, publishGroupId: group.id, error: errorMessage(error) },
          'trader.mirror.publish_failed',
        );
      }
    }
  }

  private async sendTelegramMessage(token: string, chatId: string, text: string): Promise<string | null> {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!response.ok || json.ok === false) {
      throw new Error(`Telegram sendMessage failed: ${json.description ?? response.statusText}`);
    }
    return typeof json.result?.message_id === 'number' ? String(json.result.message_id) : null;
  }
}

function formatMirrorText(input: {
  pair: string;
  direction: string;
  entries: number[];
  stopLoss: number;
  takeProfits: number[];
}): string {
  return [
    `Signal ${input.direction} ${input.pair}`,
    `Entries: ${input.entries.join(', ')}`,
    `SL: ${input.stopLoss}`,
    `TP: ${input.takeProfits.join(', ')}`,
  ].join('\n');
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
  globalDefault: number | null,
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
    toNum(globalDefault) ??
    toNum(signalLeverage) ??
    10
  );
}

function parseNumericNullable(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseBooleanSetting(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
