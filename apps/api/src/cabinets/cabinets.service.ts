import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import { getQueueClient } from '@repo/shared-queue';
import {
  type CabinetChannelFilterDto,
  PollCabinetPositionsPayload,
  QUEUE_NAMES,
  type UpdateCabinetChannelFilterDto,
  encryptSecret,
  type CabinetDto,
  type CreateCabinetDto,
  type UpdateCabinetDto,
  type UpsertBybitKeyDto,
} from '@repo/shared-ts';
import { APP_CONFIG } from '../config.module.js';
import type { AppConfig } from '../config.js';
import { PRISMA } from '../prisma.module.js';

@Injectable()
export class CabinetsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listForUser(userId: string): Promise<CabinetDto[]> {
    const cabinets = await this.prisma.cabinet.findMany({
      where: { ownerUserId: userId },
      include: { bybitKey: true },
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

  private async assertOwned(userId: string, cabinetId: string): Promise<void> {
    const owned = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, ownerUserId: userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Cabinet not found');
  }
}
