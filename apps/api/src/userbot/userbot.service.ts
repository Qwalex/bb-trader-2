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
  UserbotTraceDto,
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
        sourceType: true,
        status: true,
        classification: true,
        classifyError: true,
        createdAt: true,
        signalDrafts: {
          select: { status: true, aiRequest: true, aiResponse: true },
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
      sourceType: event.sourceType,
      status: event.status,
      classification: event.classification,
      classifyError: event.classifyError,
      createdAt: event.createdAt.toISOString(),
      draftStatus: event.signalDrafts[0]?.status ?? null,
      aiRequest: event.signalDrafts[0]?.aiRequest ?? null,
      aiResponse: event.signalDrafts[0]?.aiResponse ?? null,
    }));
  }

  async getTrace(userId: string, ingestId: string): Promise<UserbotTraceDto | null> {
    const row = await this.prisma.ingestEvent.findFirst({
      where: { id: ingestId, userId, sourceType: 'userbot' },
      select: {
        id: true,
        chatId: true,
        messageId: true,
        status: true,
        classification: true,
        classifyError: true,
        createdAt: true,
        signalDrafts: {
          select: { aiRequest: true, aiResponse: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!row) return null;
    return {
      ingestId: row.id,
      chatId: row.chatId,
      messageId: row.messageId,
      classification: row.classification,
      status: row.status,
      classifyError: row.classifyError,
      aiRequest: row.signalDrafts[0]?.aiRequest ?? null,
      aiResponse: row.signalDrafts[0]?.aiResponse ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async reread(userId: string, ingestId: string): Promise<{ ok: true }> {
    const row = await this.prisma.ingestEvent.findFirst({
      where: { id: ingestId, userId, sourceType: 'userbot' },
      select: { id: true },
    });
    if (!row) throw new Error('ingest not found');
    await this.prisma.$transaction([
      this.prisma.signalDraft.deleteMany({ where: { ingestEventId: ingestId } }),
      this.prisma.ingestEvent.update({
        where: { id: ingestId },
        data: {
          status: 'pending_classify',
          classification: null,
          classifyError: null,
          classifiedAt: null,
        },
      }),
    ]);
    return { ok: true };
  }

  async rereadAll(userId: string, limit: number): Promise<{
    total: number;
    processed: number;
  }> {
    const rows = await this.prisma.ingestEvent.findMany({
      where: {
        userId,
        sourceType: 'userbot',
        status: { in: ['classified', 'ignored', 'failed'] },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    if (rows.length === 0) return { total: 0, processed: 0 };
    const ids = rows.map((r) => r.id);
    await this.prisma.$transaction([
      this.prisma.signalDraft.deleteMany({ where: { ingestEventId: { in: ids } } }),
      this.prisma.ingestEvent.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'pending_classify',
          classification: null,
          classifyError: null,
          classifiedAt: null,
        },
      }),
    ]);
    return { total: rows.length, processed: rows.length };
  }

  async scanToday(userId: string, limitPerChat: number): Promise<{
    total: number;
    processed: number;
  }> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = await this.prisma.ingestEvent.findMany({
      where: {
        userId,
        sourceType: 'userbot',
        createdAt: { gte: dayStart },
        status: { in: ['classified', 'ignored', 'failed'] },
      },
      select: { id: true, chatId: true },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const perChatCounter = new Map<string, number>();
    const selected: string[] = [];
    for (const row of rows) {
      const current = perChatCounter.get(row.chatId) ?? 0;
      if (current >= limitPerChat) continue;
      perChatCounter.set(row.chatId, current + 1);
      selected.push(row.id);
    }
    if (selected.length === 0) return { total: rows.length, processed: 0 };
    await this.prisma.$transaction([
      this.prisma.signalDraft.deleteMany({ where: { ingestEventId: { in: selected } } }),
      this.prisma.ingestEvent.updateMany({
        where: { id: { in: selected } },
        data: {
          status: 'pending_classify',
          classification: null,
          classifyError: null,
          classifiedAt: null,
        },
      }),
    ]);
    return { total: rows.length, processed: selected.length };
  }

  async getOpenrouterSpend(userId: string, days: number): Promise<{
    days: number;
    totalUsd: number;
    generations: number;
    bySource: Array<{ chatId: string | null; title: string | null; source: string | null; usd: number; generations: number }>;
    timeline: Array<{ date: string; usd: number; generations: number }>;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.openrouterGenerationCost.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        status: 'resolved',
      },
      select: {
        chatId: true,
        source: true,
        costUsd: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const chatIds = Array.from(new Set(rows.map((r) => r.chatId).filter((v): v is string => Boolean(v))));
    const channels = chatIds.length
      ? await this.prisma.userbotChannel.findMany({
          where: { userId, chatId: { in: chatIds } },
          select: { chatId: true, title: true },
        })
      : [];
    const titleByChatId = new Map(channels.map((c) => [c.chatId, c.title]));

    const bySourceMap = new Map<string, { chatId: string | null; source: string | null; usd: number; generations: number }>();
    const timelineMap = new Map<string, { usd: number; generations: number }>();
    let totalUsd = 0;
    for (const row of rows) {
      const usd = row.costUsd ?? 0;
      totalUsd += usd;
      const sourceKey = `${row.chatId ?? 'none'}:${row.source ?? 'none'}`;
      const sourceAgg = bySourceMap.get(sourceKey) ?? {
        chatId: row.chatId,
        source: row.source,
        usd: 0,
        generations: 0,
      };
      sourceAgg.usd += usd;
      sourceAgg.generations += 1;
      bySourceMap.set(sourceKey, sourceAgg);

      const day = row.createdAt.toISOString().slice(0, 10);
      const dayAgg = timelineMap.get(day) ?? { usd: 0, generations: 0 };
      dayAgg.usd += usd;
      dayAgg.generations += 1;
      timelineMap.set(day, dayAgg);
    }
    return {
      days,
      totalUsd,
      generations: rows.length,
      bySource: Array.from(bySourceMap.values())
        .map((row) => ({
          ...row,
          title: row.chatId ? titleByChatId.get(row.chatId) ?? null : null,
        }))
        .sort((a, b) => b.usd - a.usd),
      timeline: Array.from(timelineMap.entries())
        .map(([date, agg]) => ({ date, usd: agg.usd, generations: agg.generations }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async getOpenrouterBalance(): Promise<{
    totalCredits: number | null;
    totalUsage: number | null;
    remainingCredits: number | null;
    raw: unknown;
  }> {
    const setting = await this.prisma.globalSetting.findUnique({
      where: { key: 'OPENROUTER_API_KEY' },
      select: { value: true },
    });
    const apiKey = setting?.value || this.config.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('OpenRouter API key is not set (OPENROUTER_API_KEY)');
    }
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new BadRequestException(`OpenRouter credits failed with ${response.status}`);
    }
    const json = (await response.json()) as {
      data?: {
        total_credits?: number | string;
        total_usage?: number | string;
      };
      total_credits?: number | string;
      total_usage?: number | string;
    };
    const totalCreditsRaw = json.data?.total_credits ?? json.total_credits ?? null;
    const totalUsageRaw = json.data?.total_usage ?? json.total_usage ?? null;
    const totalCredits = totalCreditsRaw == null ? null : Number(totalCreditsRaw);
    const totalUsage = totalUsageRaw == null ? null : Number(totalUsageRaw);
    const safeCredits = Number.isFinite(totalCredits) ? totalCredits : null;
    const safeUsage = Number.isFinite(totalUsage) ? totalUsage : null;
    return {
      totalCredits: safeCredits,
      totalUsage: safeUsage,
      remainingCredits:
        safeCredits != null && safeUsage != null ? Math.max(safeCredits - safeUsage, 0) : null,
      raw: json,
    };
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
