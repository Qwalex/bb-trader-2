/**
 * Ничего не знает про MTProto/Telethon. Всё, что делает:
 *   - читает UserbotSession/UserbotChannel из БД,
 *   - добавляет строки в UserbotCommand.
 * Реальное исполнение — в apps/userbot (Python), который поллит UserbotCommand.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import type {
  AddChannelDto,
  UpdateChannelDto,
  UserbotChannelDto,
  UserbotSessionDto,
} from '@repo/shared-ts';
import { PRISMA } from '../prisma.module.js';

@Injectable()
export class UserbotService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

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
    const command = await this.prisma.userbotCommand.create({
      data: {
        userId,
        type,
        payloadJson: payload ? JSON.stringify(payload) : null,
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
