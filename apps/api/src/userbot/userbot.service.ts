/**
 * Ничего не знает про MTProto/Telethon. Всё, что делает:
 *   - читает UserbotSession/UserbotChannel из БД,
 *   - добавляет строки в UserbotCommand.
 * Реальное исполнение — в apps/userbot (Python), который поллит UserbotCommand.
 */

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import type {
  AddChannelDto,
  UpdateChannelDto,
  UserbotCabinetUsageDto,
  UserbotChannelDto,
  UserbotDashboardSummaryDto,
  UserbotRecentEventDto,
  UserbotSessionDto,
} from '@repo/shared-ts';
import { encryptSecret } from '@repo/shared-ts';
import { APP_CONFIG } from '../config.module.js';
import type { AppConfig } from '../config.js';
import { PRISMA } from '../prisma.module.js';

@Injectable()
export class UserbotService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async getSession(userId: string): Promise<UserbotSessionDto> {
    const s = await this.prisma.userbotSession.findUnique({ where: { userId } });
    if (!s) {
      return {
        userId,
        phone: null,
        status: 'disconnected',
        lastSeenAt: null,
        lastError: null,
        hasSession: false,
      };
    }
    return {
      userId: s.userId,
      phone: s.phone,
      status: s.status as UserbotSessionDto['status'],
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
      lastError: s.lastError,
      hasSession: Boolean(s.sessionString),
    };
  }

  async enqueueCommand(
    userId: string,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<{ commandId: string }> {
    let safePayload = payload;
    if (type === 'submit_2fa_password') {
      const password = payload?.password;
      if (typeof password !== 'string' || password.trim().length === 0) {
        throw new BadRequestException('2FA password is required');
      }
      safePayload = {
        passwordEncrypted: encryptSecret(
          { encryptionKey: this.config.APP_ENCRYPTION_KEY },
          password.trim(),
        ),
      };
    }
    const command = await this.prisma.userbotCommand.create({
      data: {
        userId,
        type,
        payloadJson: safePayload ? JSON.stringify(safePayload) : null,
        status: 'queued',
      },
    });
    return { commandId: command.id };
  }

  async getCommand(userId: string, commandId: string) {
    return this.prisma.userbotCommand.findFirst({
      where: { id: commandId, userId },
      select: {
        id: true,
        type: true,
        status: true,
        resultJson: true,
        error: true,
        createdAt: true,
        finishedAt: true,
      },
    });
  }

  async listChannels(userId: string): Promise<UserbotChannelDto[]> {
    const channels = await this.prisma.userbotChannel.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return channels.map((c) => ({
      id: c.id,
      chatId: c.chatId,
      title: c.title,
      username: c.username,
      enabled: c.enabled,
      sourcePriority: c.sourcePriority,
    }));
  }

  async getDashboardSummary(userId: string): Promise<UserbotDashboardSummaryDto> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [channelsTotal, channelsEnabled, cabinetsTotal, cabinetsEnabled, ingestToday, classifiedToday] =
      await this.prisma.$transaction([
        this.prisma.userbotChannel.count({ where: { userId } }),
        this.prisma.userbotChannel.count({ where: { userId, enabled: true } }),
        this.prisma.cabinet.count({ where: { ownerUserId: userId } }),
        this.prisma.cabinet.count({ where: { ownerUserId: userId, enabled: true } }),
        this.prisma.ingestEvent.count({
          where: { userId, sourceType: 'userbot', createdAt: { gte: dayStart } },
        }),
        this.prisma.ingestEvent.count({
          where: { userId, sourceType: 'userbot', classification: { not: null }, createdAt: { gte: dayStart } },
        }),
      ]);

    const [signalsReadyToday, signalsFannedOutToday] = await this.prisma.$transaction([
      this.prisma.signalDraft.count({
        where: { userId, sourceType: 'userbot', status: 'ready', createdAt: { gte: dayStart } },
      }),
      this.prisma.signalDraft.count({
        where: { userId, sourceType: 'userbot', status: 'fanned_out', createdAt: { gte: dayStart } },
      }),
    ]);

    return {
      channelsTotal,
      channelsEnabled,
      cabinetsTotal,
      cabinetsEnabled,
      ingestToday,
      classifiedToday,
      signalsReadyToday,
      signalsFannedOutToday,
    };
  }

  async listCabinetUsage(userId: string): Promise<UserbotCabinetUsageDto[]> {
    const cabinets = await this.prisma.cabinet.findMany({
      where: { ownerUserId: userId },
      include: {
        channelFilters: {
          select: { enabled: true },
        },
      },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }],
    });
    return cabinets.map((cabinet) => ({
      cabinetId: cabinet.id,
      cabinetSlug: cabinet.slug,
      cabinetDisplayName: cabinet.displayName,
      cabinetEnabled: cabinet.enabled,
      activeFilters: cabinet.channelFilters.filter((row) => row.enabled).length,
      totalFilters: cabinet.channelFilters.length,
    }));
  }

  async listRecentEvents(userId: string, limit: number): Promise<UserbotRecentEventDto[]> {
    const events = await this.prisma.ingestEvent.findMany({
      where: { userId, sourceType: 'userbot' },
      select: {
        id: true,
        chatId: true,
        messageId: true,
        text: true,
        status: true,
        classification: true,
        createdAt: true,
        signalDrafts: {
          select: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const uniqueChatIds = Array.from(new Set(events.map((row) => row.chatId)));
    const channels = uniqueChatIds.length
      ? await this.prisma.userbotChannel.findMany({
          where: { userId, chatId: { in: uniqueChatIds } },
          select: { chatId: true, title: true },
        })
      : [];
    const titleByChatId = new Map(channels.map((channel) => [channel.chatId, channel.title]));

    return events.map((event) => ({
      id: event.id,
      chatId: event.chatId,
      chatTitle: titleByChatId.get(event.chatId) ?? null,
      messageId: event.messageId,
      text: event.text,
      status: event.status,
      classification: event.classification,
      createdAt: event.createdAt.toISOString(),
      draftStatus: event.signalDrafts[0]?.status ?? null,
    }));
  }

  async addChannel(userId: string, dto: AddChannelDto): Promise<UserbotChannelDto> {
    const channel = await this.prisma.userbotChannel.upsert({
      where: { userId_chatId: { userId, chatId: dto.chatId } },
      create: {
        userId,
        chatId: dto.chatId,
        title: dto.title,
        username: dto.username ?? null,
        enabled: false,
      },
      update: {
        title: dto.title,
        username: dto.username ?? null,
      },
    });
    return {
      id: channel.id,
      chatId: channel.chatId,
      title: channel.title,
      username: channel.username,
      enabled: channel.enabled,
      sourcePriority: channel.sourcePriority,
    };
  }

  async updateChannel(
    userId: string,
    channelId: string,
    dto: UpdateChannelDto,
  ): Promise<void> {
    const owned = await this.prisma.userbotChannel.findFirst({
      where: { id: channelId, userId },
    });
    if (!owned) throw new Error('Channel not found');
    await this.prisma.userbotChannel.update({
      where: { id: channelId },
      data: {
        enabled: dto.enabled,
        sourcePriority: dto.sourcePriority,
      },
    });
  }

  async removeChannel(userId: string, channelId: string): Promise<void> {
    const owned = await this.prisma.userbotChannel.findFirst({
      where: { id: channelId, userId },
    });
    if (!owned) throw new Error('Channel not found');
    await this.prisma.userbotChannel.delete({ where: { id: channelId } });
  }
}
