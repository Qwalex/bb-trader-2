import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import { APP_CONFIG } from '../config.module.js';
import type { AppConfig } from '../config.js';
import { PRISMA } from '../prisma.module.js';
import { CabinetBotService } from '../cabinet-bot/cabinet-bot.service.js';

@Injectable()
export class WatchdogService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly cabinetBot: CabinetBotService,
  ) {}

  onModuleInit(): void {
    if (!this.config.WATCHDOG_ENABLED) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.WATCHDOG_INTERVAL_MS);
    // Kick once on startup.
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async getPipelineSummary() {
    const now = Date.now();
    const [ingestCounts, commandCounts, recalcCounts, stuckClassifying, stuckCommands, stuckRecalc, cabinetBot] =
      await Promise.all([
        this.prisma.ingestEvent.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.userbotCommand.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.recalcClosedPnlJob.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.ingestEvent.count({
          where: {
            status: 'classifying',
            createdAt: { lt: new Date(now - this.config.WATCHDOG_INGEST_STUCK_MS) },
          },
        }),
        this.prisma.userbotCommand.count({
          where: {
            status: 'running',
            startedAt: { not: null, lt: new Date(now - this.config.WATCHDOG_USERBOT_COMMAND_STUCK_MS) },
          },
        }),
        this.prisma.recalcClosedPnlJob.count({
          where: {
            status: 'running',
            startedAt: { not: null, lt: new Date(now - this.config.WATCHDOG_RECALC_STUCK_MS) },
          },
        }),
        this.cabinetBot.healthSummary(),
      ]);

    return {
      ingestCounts,
      commandCounts,
      recalcCounts,
      stuck: {
        ingestClassifying: stuckClassifying,
        userbotCommands: stuckCommands,
        recalcJobs: stuckRecalc,
      },
      cabinetBot,
      checkedAt: new Date().toISOString(),
    };
  }

  private async tick(): Promise<void> {
    try {
      const now = Date.now();
      const [reclaimedIngest, failedCommands, failedRecalc] = await Promise.all([
        this.prisma.ingestEvent.updateMany({
          where: {
            status: 'classifying',
            createdAt: { lt: new Date(now - this.config.WATCHDOG_INGEST_STUCK_MS) },
          },
          data: {
            status: 'pending_classify',
            classifyError: 'watchdog: reclaimed stuck classifying row',
          },
        }),
        this.prisma.userbotCommand.updateMany({
          where: {
            status: 'running',
            startedAt: { not: null, lt: new Date(now - this.config.WATCHDOG_USERBOT_COMMAND_STUCK_MS) },
          },
          data: {
            status: 'failed',
            error: 'watchdog: command timed out in running state',
            finishedAt: new Date(),
          },
        }),
        this.prisma.recalcClosedPnlJob.updateMany({
          where: {
            status: 'running',
            startedAt: { not: null, lt: new Date(now - this.config.WATCHDOG_RECALC_STUCK_MS) },
          },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            error: 'watchdog: recalc job timed out in running state',
          },
        }),
      ]);

      const delivered = await this.cabinetBot.flushCabinetLogDeliveries();

      const touched =
        reclaimedIngest.count + failedCommands.count + failedRecalc.count;
      if (touched > 0 || delivered.sent > 0 || delivered.failed > 0) {
        await this.prisma.appLog.create({
          data: {
            level: 'warn',
            category: 'system',
            service: 'api',
            message: 'watchdog pipeline maintenance tick',
            payload: JSON.stringify({
              reclaimedIngest: reclaimedIngest.count,
              failedUserbotCommands: failedCommands.count,
              failedRecalcJobs: failedRecalc.count,
              cabinetBotLogSent: delivered.sent,
              cabinetBotLogFailed: delivered.failed,
            }),
          },
        });
      }
    } catch {
      // Never crash API due to watchdog background task.
    }
  }
}
