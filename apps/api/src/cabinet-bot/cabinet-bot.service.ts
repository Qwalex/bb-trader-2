import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import { decryptSecret } from '@repo/shared-ts';
import { APP_CONFIG } from '../config.module.js';
import type { AppConfig } from '../config.js';
import { PRISMA } from '../prisma.module.js';
import { telegramSendMessage } from '../telegram/telegram-api.js';

interface TelegramUpdate {
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    chat?: { id?: number | string };
    voice?: unknown;
    audio?: unknown;
    photo?: unknown;
    document?: unknown;
  };
}

@Injectable()
export class CabinetBotService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async handleWebhook(webhookSecret: string, payload: unknown): Promise<{ ok: true }> {
    const bot = await this.prisma.cabinetTelegramBot.findUnique({
      where: { webhookSecret },
      include: { cabinet: { select: { id: true, ownerUserId: true } } },
    });
    if (!bot || !bot.enabled) return { ok: true };
    await this.prisma.cabinetTelegramBot.update({
      where: { cabinetId: bot.cabinetId },
      data: { lastInboundAt: new Date() },
    });

    const update = payload as TelegramUpdate;
    const message = update.message;
    if (!message?.chat?.id || !message.message_id) return { ok: true };
    const chatId = String(message.chat.id);
    const text = (message.text ?? message.caption ?? '').trim();
    if (text.startsWith('/')) {
      await this.handleCommand(bot.cabinetId, chatId, text);
      return { ok: true };
    }
    if (bot.signalChatId && bot.signalChatId !== chatId) {
      return { ok: true };
    }

    const mediaKind = detectMediaKind(message);
    const dedupMessageKey = `cabinet_bot:${bot.cabinetId}:${chatId}:${String(message.message_id)}`;
    try {
      await this.prisma.ingestEvent.create({
        data: {
          userId: bot.cabinet.ownerUserId,
          cabinetId: bot.cabinetId,
          sourceType: 'cabinet_bot',
          chatId,
          messageId: String(message.message_id),
          dedupMessageKey,
          text: text || null,
          rawJson: JSON.stringify({
            sourceType: 'cabinet_bot',
            mediaKind,
          }),
          status: 'pending_classify',
        },
      });
      await this.prisma.appLog.create({
        data: {
          userId: bot.cabinet.ownerUserId,
          cabinetId: bot.cabinetId,
          level: 'info',
          category: 'telegram',
          service: 'api',
          message: 'cabinet bot intake received',
          payload: JSON.stringify({ chatId, messageId: String(message.message_id), mediaKind }),
        },
      });
      await this.sendMessage(bot.botTokenEncrypted, chatId, 'Сигнал принят в обработку.');
    } catch (error) {
      const maybePrisma = error as { code?: string };
      if (maybePrisma.code === 'P2002') {
        await this.sendMessage(bot.botTokenEncrypted, chatId, 'Это сообщение уже обработано ранее.');
        return { ok: true };
      }
      await this.prisma.appLog.create({
        data: {
          userId: bot.cabinet.ownerUserId,
          cabinetId: bot.cabinetId,
          level: 'error',
          category: 'telegram',
          service: 'api',
          message: 'cabinet bot intake failed',
          payload: JSON.stringify({
            chatId,
            messageId: String(message.message_id),
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      });
      await this.sendMessage(
        bot.botTokenEncrypted,
        chatId,
        'Не удалось принять сигнал. Проверьте логи кабинета.',
      );
    }
    return { ok: true };
  }

  async flushCabinetLogDeliveries(limitPerBot = 20): Promise<{
    sent: number;
    failed: number;
    scanned: number;
  }> {
    const bots = await this.prisma.cabinetTelegramBot.findMany({
      where: { enabled: true, logChatId: { not: null } },
      select: {
        cabinetId: true,
        botTokenEncrypted: true,
        logChatId: true,
        lastLogSentAt: true,
      },
    });
    let sent = 0;
    let failed = 0;
    let scanned = 0;
    for (const bot of bots) {
      const logs = await this.prisma.appLog.findMany({
        where: {
          cabinetId: bot.cabinetId,
          createdAt: { gt: bot.lastLogSentAt ?? new Date(0) },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limitPerBot,
      });
      scanned += logs.length;
      for (const log of logs) {
        try {
          await this.sendMessage(
            bot.botTokenEncrypted,
            bot.logChatId!,
            formatLogMessage(log.level, log.category, log.message),
          );
          await this.prisma.cabinetBotLogDelivery.upsert({
            where: {
              cabinetId_appLogId: {
                cabinetId: bot.cabinetId,
                appLogId: log.id,
              },
            },
            create: {
              cabinetId: bot.cabinetId,
              appLogId: log.id,
              status: 'sent',
              sentAt: new Date(),
            },
            update: {
              status: 'sent',
              error: null,
              sentAt: new Date(),
            },
          });
          await this.prisma.cabinetTelegramBot.update({
            where: { cabinetId: bot.cabinetId },
            data: {
              lastLogSentAt: log.createdAt,
              lastOutboundAt: new Date(),
            },
          });
          sent += 1;
        } catch (error) {
          failed += 1;
          await this.prisma.cabinetBotLogDelivery.upsert({
            where: {
              cabinetId_appLogId: {
                cabinetId: bot.cabinetId,
                appLogId: log.id,
              },
            },
            create: {
              cabinetId: bot.cabinetId,
              appLogId: log.id,
              status: 'failed',
              error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
            },
            update: {
              status: 'failed',
              error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
            },
          });
          break;
        }
      }
    }
    return { sent, failed, scanned };
  }

  async healthSummary(): Promise<{
    configuredBots: number;
    enabledBots: number;
    verifiedBots: number;
    failedDeliveries: number;
  }> {
    const [configuredBots, enabledBots, verifiedBots, failedDeliveries] = await Promise.all([
      this.prisma.cabinetTelegramBot.count(),
      this.prisma.cabinetTelegramBot.count({ where: { enabled: true } }),
      this.prisma.cabinetTelegramBot.count({ where: { lastVerifiedAt: { not: null } } }),
      this.prisma.cabinetBotLogDelivery.count({ where: { status: 'failed' } }),
    ]);
    return { configuredBots, enabledBots, verifiedBots, failedDeliveries };
  }

  private async handleCommand(cabinetId: string, chatId: string, commandText: string): Promise<void> {
    const command = commandText.split(' ')[0]?.toLowerCase() ?? '';
    if (command === '/start' || command === '/help' || command === '/menu') {
      await this.sendBotMessageByCabinet(
        cabinetId,
        chatId,
        [
          'Команды кабинета:',
          '/summary — сводка по кабинету',
          '/balance — последний баланс',
          '/trades — последние сделки',
          '/events — последние события',
          '/logs — последние логи',
          '/diag — диагностика кабинета',
        ].join('\n'),
      );
      return;
    }
    if (command === '/summary') {
      const [balance, openCount, closedStats] = await Promise.all([
        this.prisma.balanceSnapshot.findFirst({
          where: { cabinetId },
          orderBy: { createdAt: 'desc' },
          select: { totalUsd: true, createdAt: true },
        }),
        this.prisma.signal.count({
          where: { cabinetId, deletedAt: null, status: { in: ['OPEN', 'ORDERS_PLACED', 'PENDING'] } },
        }),
        this.prisma.signal.aggregate({
          where: {
            cabinetId,
            deletedAt: null,
            status: { in: ['CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_MIXED'] },
          },
          _count: { _all: true },
          _sum: { realizedPnl: true },
        }),
      ]);
      await this.sendBotMessageByCabinet(
        cabinetId,
        chatId,
        [
          `Баланс: ${balance ? `${balance.totalUsd.toFixed(2)} USDT` : 'нет данных'}`,
          `Открытых сигналов: ${openCount}`,
          `Закрытых сигналов: ${closedStats._count._all}`,
          `PnL (sum): ${(closedStats._sum.realizedPnl ?? 0).toFixed(2)}`,
        ].join('\n'),
      );
      return;
    }
    if (command === '/balance') {
      const balance = await this.prisma.balanceSnapshot.findFirst({
        where: { cabinetId },
        orderBy: { createdAt: 'desc' },
      });
      await this.sendBotMessageByCabinet(
        cabinetId,
        chatId,
        balance
          ? `Последний баланс: ${balance.totalUsd.toFixed(2)} USDT (${balance.createdAt.toISOString()})`
          : 'Баланс пока недоступен.',
      );
      return;
    }
    if (command === '/trades' || command === '/events') {
      const signals = await this.prisma.signal.findMany({
        where: { cabinetId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { pair: true, status: true, realizedPnl: true, createdAt: true },
      });
      const title = command === '/events' ? 'Последние события/сделки' : 'Последние сделки';
      await this.sendBotMessageByCabinet(
        cabinetId,
        chatId,
        [
          title,
          ...signals.map(
            (s) => `• ${s.pair} ${s.status} pnl=${(s.realizedPnl ?? 0).toFixed(2)} (${s.createdAt.toISOString()})`,
          ),
        ].join('\n'),
      );
      return;
    }
    if (command === '/logs') {
      const logs = await this.prisma.appLog.findMany({
        where: { cabinetId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { level: true, category: true, message: true },
      });
      await this.sendBotMessageByCabinet(
        cabinetId,
        chatId,
        logs.length
          ? ['Последние логи:', ...logs.map((l) => `• [${l.level}/${l.category}] ${l.message}`)].join('\n')
          : 'Логи пока отсутствуют.',
      );
      return;
    }
    if (command === '/diag') {
      const [pendingIngest, runningCommands, bot] = await Promise.all([
        this.prisma.ingestEvent.count({
          where: { cabinetId, status: { in: ['pending_classify', 'classifying'] } },
        }),
        this.prisma.userbotCommand.count({
          where: { status: 'running' },
        }),
        this.prisma.cabinetTelegramBot.findUnique({
          where: { cabinetId },
          select: { lastVerifiedAt: true, lastVerifyError: true },
        }),
      ]);
      await this.sendBotMessageByCabinet(
        cabinetId,
        chatId,
        [
          `Cabinet bot verified: ${bot?.lastVerifiedAt ? 'yes' : 'no'}`,
          `Bot last error: ${bot?.lastVerifyError ?? 'none'}`,
          `Pending ingest (cabinet): ${pendingIngest}`,
          `Running userbot commands (global): ${runningCommands}`,
        ].join('\n'),
      );
      return;
    }
    await this.sendBotMessageByCabinet(cabinetId, chatId, 'Неизвестная команда. Используйте /help');
  }

  private async sendBotMessageByCabinet(cabinetId: string, chatId: string, text: string): Promise<void> {
    const bot = await this.prisma.cabinetTelegramBot.findUnique({
      where: { cabinetId },
      select: { botTokenEncrypted: true, cabinetId: true },
    });
    if (!bot) return;
    await this.sendMessage(bot.botTokenEncrypted, chatId, text);
    await this.prisma.cabinetTelegramBot.update({
      where: { cabinetId: bot.cabinetId },
      data: { lastOutboundAt: new Date() },
    });
  }

  private async sendMessage(encryptedToken: string, chatId: string, text: string): Promise<void> {
    const token = decryptSecret({ encryptionKey: this.config.APP_ENCRYPTION_KEY }, encryptedToken);
    await telegramSendMessage(token, chatId, text);
  }
}

function detectMediaKind(message: TelegramUpdate['message']): string | null {
  if (!message) return null;
  if (message.voice) return 'voice';
  if (message.audio) return 'audio';
  if (message.photo) return 'image';
  if (message.document) return 'document';
  return null;
}

function formatLogMessage(level: string, category: string, message: string): string {
  return `[${level}/${category}] ${message}`.slice(0, 4000);
}
