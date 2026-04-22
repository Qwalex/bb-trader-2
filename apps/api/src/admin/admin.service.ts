import { Inject, Injectable } from '@nestjs/common';
import { getQueueClient } from '@repo/shared-queue';
import { DiagnosticsRunPayload, QUEUE_NAMES, RecalcClosedPnlPayload } from '@repo/shared-ts';
import type { PrismaClient } from '@repo/shared-prisma';
import { APP_CONFIG } from '../config.module.js';
import type { AppConfig } from '../config.js';
import { PRISMA } from '../prisma.module.js';
import { WatchdogService } from '../watchdog/watchdog.service.js';

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly watchdog: WatchdogService,
  ) {}

  async listGlobalSettings() {
    return this.prisma.globalSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async setGlobalSetting(key: string, value: string) {
    await this.prisma.globalSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    return { ok: true };
  }

  async listLogs(limit: number, level?: string, category?: string) {
    const rows = await this.prisma.appLog.findMany({
      where: {
        ...(level ? { level } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async pipelineSummary() {
    return this.watchdog.getPipelineSummary();
  }

  async runDiagnostics(triggeredByUserId: string | null, models: string[], caseIds?: string[]) {
    const run = await this.prisma.diagnosticRun.create({
      data: {
        triggeredByUserId,
        status: 'running',
        requestJson: JSON.stringify({ caseIds: caseIds ?? null }),
        modelsJson: JSON.stringify(models),
      },
    });
    const queue = await getQueueClient({
      connectionString: this.config.DATABASE_URL,
      application_name: 'bb-api',
    });
    await queue.send(
      QUEUE_NAMES.diagnosticsRun,
      DiagnosticsRunPayload,
      { runId: run.id, triggeredByUserId, models, caseIds },
      { singletonKey: `diag:${run.id}` },
    );
    return { runId: run.id };
  }

  async runRecalcClosedPnl(
    cabinetId: string | null,
    dryRun: boolean,
    limit: number,
  ): Promise<{ jobId: string }> {
    const jobId = `recalc_${Date.now()}`;
    await this.prisma.recalcClosedPnlJob.create({
      data: {
        id: jobId,
        status: 'queued',
        dryRun,
        limit,
        cabinetId,
      },
    });
    const queue = await getQueueClient({
      connectionString: this.config.DATABASE_URL,
      application_name: 'bb-api',
    });
    await queue.send(
      QUEUE_NAMES.recalcClosedPnl,
      RecalcClosedPnlPayload,
      { jobId, cabinetId, dryRun, limit },
      { singletonKey: `recalc:${jobId}` },
    );
    return { jobId };
  }
}
