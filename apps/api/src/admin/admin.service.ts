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

  async listDiagnosticRuns(limit = 30) {
    const rows = await this.prisma.diagnosticRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        status: true,
        caseCount: true,
        summary: true,
        error: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getDiagnosticRunDetail(runId: string) {
    const run = await this.prisma.diagnosticRun.findUnique({
      where: { id: runId },
      include: {
        cases: {
          orderBy: { createdAt: 'asc' },
          take: 500,
        },
        modelResults: {
          orderBy: { createdAt: 'asc' },
          take: 2000,
        },
        stepResults: {
          orderBy: { createdAt: 'asc' },
          take: 4000,
        },
        logs: {
          orderBy: { createdAt: 'asc' },
          take: 2000,
        },
      },
    });
    if (!run) return null;
    return {
      id: run.id,
      status: run.status,
      caseCount: run.caseCount,
      summary: run.summary,
      error: run.error,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      cases: run.cases.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      modelResults: run.modelResults.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      stepResults: run.stepResults.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      logs: run.logs.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    };
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
