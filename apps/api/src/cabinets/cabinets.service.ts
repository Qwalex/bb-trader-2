import { randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import { getQueueClient } from '@repo/shared-queue';
import {
  type CabinetMirrorMessageDto,
  type CabinetPublishGroupDto,
  type CabinetChannelFilterDto,
  type CabinetTelegramBotDto,
  type CreateCabinetPublishGroupDto,
  PollCabinetPositionsPayload,
  QUEUE_NAMES,
  type UpsertCabinetTelegramBotDto,
  type UpdateCabinetChannelFilterDto,
  type UpdateCabinetPublishGroupDto,
  type VerifyCabinetTelegramBotDto,
  encryptSecret,
  decryptSecret,
  type CabinetDto,
  type CreateCabinetDto,
  type UpdateCabinetDto,
  type UpsertBybitKeyDto,
} from '@repo/shared-ts';
import { APP_CONFIG } from '../config.module.js';
import type { AppConfig } from '../config.js';
import { PRISMA } from '../prisma.module.js';
import { telegramApiCall } from '../telegram/telegram-api.js';

@Injectable()
export class CabinetsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listForUser(userId: string): Promise<CabinetDto[]> {
    const cabinets = await this.prisma.cabinet.findMany({
      where: { ownerUserId: userId },
      include: { bybitKey: true, telegramBot: true },
      orderBy: { createdAt: 'asc' },
    });
    return cabinets.map((c) => ({
      id: c.id,
      slug: c.slug,
      displayName: c.displayName,
      network: c.network as 'mainnet' | 'testnet',
      enabled: c.enabled,
      hasBybitKey:
        !!c.bybitKey &&
        Boolean(c.bybitKey.apiKeyMainnet || c.bybitKey.apiKeyTestnet),
      bybitKeyVerifiedAt: c.bybitKey?.lastVerifiedAt?.toISOString() ?? null,
      bybitKeyLastError: c.bybitKey?.lastVerifyError ?? null,
      hasCabinetBot: Boolean(c.telegramBot),
      cabinetBotVerifiedAt: c.telegramBot?.lastVerifiedAt?.toISOString() ?? null,
      cabinetBotLastError: c.telegramBot?.lastVerifyError ?? null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async create(userId: string, dto: CreateCabinetDto): Promise<CabinetDto> {
    const cabinet = await this.prisma.cabinet.create({
      data: {
        ownerUserId: userId,
        slug: dto.slug,
        displayName: dto.displayName,
        network: dto.network,
      },
    });
    return {
      id: cabinet.id,
      slug: cabinet.slug,
      displayName: cabinet.displayName,
      network: cabinet.network as 'mainnet' | 'testnet',
      enabled: cabinet.enabled,
      hasBybitKey: false,
      bybitKeyVerifiedAt: null,
      bybitKeyLastError: null,
      hasCabinetBot: false,
      cabinetBotVerifiedAt: null,
      cabinetBotLastError: null,
      createdAt: cabinet.createdAt.toISOString(),
    };
  }

  async update(userId: string, cabinetId: string, dto: UpdateCabinetDto): Promise<void> {
    const owned = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, ownerUserId: userId },
    });
    if (!owned) throw new NotFoundException('Cabinet not found');
    await this.prisma.cabinet.update({
      where: { id: cabinetId },
      data: {
        displayName: dto.displayName,
        network: dto.network,
        enabled: dto.enabled,
      },
    });
  }

  async remove(userId: string, cabinetId: string): Promise<void> {
    const owned = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, ownerUserId: userId },
    });
    if (!owned) throw new NotFoundException('Cabinet not found');
    await this.prisma.cabinet.delete({ where: { id: cabinetId } });
  }

  async upsertBybitKey(
    userId: string,
    cabinetId: string,
    dto: UpsertBybitKeyDto,
  ): Promise<void> {
    const owned = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, ownerUserId: userId },
    });
    if (!owned) throw new NotFoundException('Cabinet not found');

    const enc = (raw: string | null | undefined): string | undefined => {
      if (raw == null) return undefined;
      if (raw === '') return '';
      return encryptSecret({ encryptionKey: this.config.APP_ENCRYPTION_KEY }, raw);
    };

    await this.prisma.cabinetBybitKey.upsert({
      where: { cabinetId },
      create: {
        cabinetId,
        apiKeyMainnet: dto.apiKeyMainnet ?? undefined,
        apiSecretMainnet: enc(dto.apiSecretMainnet ?? null),
        apiKeyTestnet: dto.apiKeyTestnet ?? undefined,
        apiSecretTestnet: enc(dto.apiSecretTestnet ?? null),
        testnet: dto.testnet ?? false,
      },
      update: {
        apiKeyMainnet: dto.apiKeyMainnet ?? undefined,
        apiSecretMainnet: enc(dto.apiSecretMainnet ?? null),
        apiKeyTestnet: dto.apiKeyTestnet ?? undefined,
        apiSecretTestnet: enc(dto.apiSecretTestnet ?? null),
        testnet: dto.testnet,
        lastVerifiedAt: null,
        lastVerifyError: null,
      },
    });

    // Trigger immediate verification in trader; do not wait for cron tick.
    const queue = await getQueueClient({
      connectionString: this.config.DATABASE_URL,
      application_name: 'bb-api',
    });
    await queue.send(
      QUEUE_NAMES.pollCabinetPositions,
      PollCabinetPositionsPayload,
      { cabinetId },
      {
        singletonKey: `poll-cabinet:${cabinetId}`,
        retryLimit: 5,
        retryDelaySeconds: 10,
      },
    );
  }

  async getSettings(userId: string, cabinetId: string) {
    await this.assertOwned(userId, cabinetId);
    const settings = await this.prisma.cabinetSetting.findMany({
      where: { cabinetId },
      orderBy: { key: 'asc' },
    });
    return settings.map((s) => ({ key: s.key, value: s.value, updatedAt: s.updatedAt.toISOString() }));
  }

  async setSettings(
    userId: string,
    cabinetId: string,
    values: Record<string, string>,
  ): Promise<void> {
    await this.assertOwned(userId, cabinetId);
    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        this.prisma.cabinetSetting.upsert({
          where: { cabinetId_key: { cabinetId, key } },
          create: { cabinetId, key, value },
          update: { value },
        }),
      ),
    );
  }

  async listChannelFilters(
    userId: string,
    cabinetId: string,
  ): Promise<CabinetChannelFilterDto[]> {
    await this.assertOwned(userId, cabinetId);
    const rows = await this.prisma.cabinetChannelFilter.findMany({
      where: { cabinetId },
      include: { userbotChannel: true },
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      cabinetId: row.cabinetId,
      userbotChannelId: row.userbotChannelId,
      chatId: row.userbotChannel.chatId,
      title: row.userbotChannel.title,
      enabled: row.enabled,
      defaultLeverage: row.defaultLeverage,
      forcedLeverage: row.forcedLeverage,
      defaultEntryUsd: row.defaultEntryUsd,
      minLotBump: row.minLotBump,
    }));
  }

  async updateChannelFilter(
    userId: string,
    cabinetId: string,
    filterId: string,
    dto: UpdateCabinetChannelFilterDto,
  ): Promise<void> {
    await this.assertOwned(userId, cabinetId);
    const existing = await this.prisma.cabinetChannelFilter.findFirst({
      where: { id: filterId, cabinetId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Channel filter not found');
    await this.prisma.cabinetChannelFilter.update({
      where: { id: filterId },
      data: {
        enabled: dto.enabled,
        defaultLeverage: dto.defaultLeverage,
        forcedLeverage: dto.forcedLeverage,
        defaultEntryUsd: dto.defaultEntryUsd,
        minLotBump: dto.minLotBump,
      },
    });
  }

  async getCabinetTelegramBot(userId: string, cabinetId: string): Promise<CabinetTelegramBotDto | null> {
    await this.assertOwned(userId, cabinetId);
    const bot = await this.prisma.cabinetTelegramBot.findUnique({
      where: { cabinetId },
    });
    if (!bot) return null;
    return {
      cabinetId: bot.cabinetId,
      botUsername: bot.botUsername,
      signalChatId: bot.signalChatId,
      logChatId: bot.logChatId,
      enabled: bot.enabled,
      lastVerifiedAt: bot.lastVerifiedAt?.toISOString() ?? null,
      lastVerifyError: bot.lastVerifyError,
      lastInboundAt: bot.lastInboundAt?.toISOString() ?? null,
      lastOutboundAt: bot.lastOutboundAt?.toISOString() ?? null,
    };
  }

  async upsertCabinetTelegramBot(
    userId: string,
    cabinetId: string,
    dto: UpsertCabinetTelegramBotDto,
  ): Promise<void> {
    await this.assertOwned(userId, cabinetId);
    const existing = await this.prisma.cabinetTelegramBot.findUnique({
      where: { cabinetId },
    });
    if (!existing && !dto.botToken) {
      throw new BadRequestException('botToken is required for first setup');
    }
    const encryptedToken = dto.botToken
      ? encryptSecret({ encryptionKey: this.config.APP_ENCRYPTION_KEY }, dto.botToken)
      : existing?.botTokenEncrypted;
    if (!encryptedToken) throw new BadRequestException('botToken is missing');
    await this.prisma.cabinetTelegramBot.upsert({
      where: { cabinetId },
      create: {
        cabinetId,
        botTokenEncrypted: encryptedToken,
        signalChatId: dto.signalChatId ?? null,
        logChatId: dto.logChatId ?? null,
        enabled: dto.enabled ?? true,
        webhookSecret: randomBytes(24).toString('hex'),
      },
      update: {
        botTokenEncrypted: encryptedToken,
        signalChatId: dto.signalChatId ?? undefined,
        logChatId: dto.logChatId ?? undefined,
        enabled: dto.enabled ?? undefined,
        lastVerifiedAt: null,
        lastVerifyError: null,
      },
    });
  }

  async verifyCabinetTelegramBot(
    userId: string,
    cabinetId: string,
    dto: VerifyCabinetTelegramBotDto,
  ): Promise<{ ok: true; botUsername: string | null }> {
    await this.assertOwned(userId, cabinetId);
    const bot = await this.prisma.cabinetTelegramBot.findUnique({
      where: { cabinetId },
    });
    if (!bot) throw new NotFoundException('Cabinet bot is not configured');
    let botUsername: string | null = bot.botUsername;
    try {
      const token = decryptSecret({ encryptionKey: this.config.APP_ENCRYPTION_KEY }, bot.botTokenEncrypted);
      const me = await this.telegramApi<{ result?: { username?: string | null } }>(token, 'getMe', {});
      botUsername = me.result?.username ?? null;
      if (dto.verifySignalChatId && bot.signalChatId) {
        await this.telegramApi(token, 'getChat', { chat_id: bot.signalChatId });
      }
      if (dto.verifyLogChatId && bot.logChatId) {
        await this.telegramApi(token, 'getChat', { chat_id: bot.logChatId });
      }
      if (this.config.CABINET_BOT_WEBHOOK_BASE_URL) {
        const base = this.config.CABINET_BOT_WEBHOOK_BASE_URL.replace(/\/+$/, '');
        await this.telegramApi(token, 'setWebhook', {
          url: `${base}/cabinet-bot/webhook/${bot.webhookSecret}`,
        });
      }
      await this.prisma.cabinetTelegramBot.update({
        where: { cabinetId },
        data: {
          botUsername,
          lastVerifiedAt: new Date(),
          lastVerifyError: null,
        },
      });
      return { ok: true, botUsername };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.cabinetTelegramBot.update({
        where: { cabinetId },
        data: {
          lastVerifiedAt: null,
          lastVerifyError: message.slice(0, 500),
        },
      });
      throw new BadRequestException(message);
    }
  }

  async listPublishGroups(userId: string, cabinetId: string): Promise<CabinetPublishGroupDto[]> {
    await this.assertOwned(userId, cabinetId);
    const rows = await this.prisma.cabinetPublishGroup.findMany({
      where: { cabinetId },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      cabinetId: row.cabinetId,
      title: row.title,
      chatId: row.chatId,
      enabled: row.enabled,
      publishEveryN: row.publishEveryN,
      signalCounter: row.signalCounter,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createPublishGroup(
    userId: string,
    cabinetId: string,
    dto: CreateCabinetPublishGroupDto,
  ): Promise<CabinetPublishGroupDto> {
    await this.assertOwned(userId, cabinetId);
    const row = await this.prisma.cabinetPublishGroup.create({
      data: {
        cabinetId,
        title: dto.title,
        chatId: dto.chatId,
        enabled: dto.enabled,
        publishEveryN: dto.publishEveryN,
      },
    });
    return {
      id: row.id,
      cabinetId: row.cabinetId,
      title: row.title,
      chatId: row.chatId,
      enabled: row.enabled,
      publishEveryN: row.publishEveryN,
      signalCounter: row.signalCounter,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updatePublishGroup(
    userId: string,
    cabinetId: string,
    publishGroupId: string,
    dto: UpdateCabinetPublishGroupDto,
  ): Promise<void> {
    await this.assertOwned(userId, cabinetId);
    const existing = await this.prisma.cabinetPublishGroup.findFirst({
      where: { id: publishGroupId, cabinetId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Publish group not found');
    await this.prisma.cabinetPublishGroup.update({
      where: { id: publishGroupId },
      data: dto,
    });
  }

  async deletePublishGroup(userId: string, cabinetId: string, publishGroupId: string): Promise<void> {
    await this.assertOwned(userId, cabinetId);
    const existing = await this.prisma.cabinetPublishGroup.findFirst({
      where: { id: publishGroupId, cabinetId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Publish group not found');
    await this.prisma.cabinetPublishGroup.delete({
      where: { id: publishGroupId },
    });
  }

  async listMirrorMessages(
    userId: string,
    cabinetId: string,
    limit = 100,
  ): Promise<CabinetMirrorMessageDto[]> {
    await this.assertOwned(userId, cabinetId);
    const rows = await this.prisma.tgUserbotMirrorMessage.findMany({
      where: { userId, publishGroup: { cabinetId } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 300),
    });
    return rows.map((row) => ({
      id: row.id,
      publishGroupId: row.publishGroupId,
      ingestId: row.ingestId,
      sourceChatId: row.sourceChatId,
      sourceMessageId: row.sourceMessageId,
      kind: row.kind,
      status: row.status,
      targetChatId: row.targetChatId,
      targetMessageId: row.targetMessageId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async assertOwned(userId: string, cabinetId: string): Promise<void> {
    const owned = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, ownerUserId: userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Cabinet not found');
  }

  private async telegramApi<T>(
    token: string,
    method: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    return telegramApiCall<T>(token, method, payload);
  }
}
