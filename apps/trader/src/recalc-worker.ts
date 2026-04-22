import type { PrismaClient } from '@repo/shared-prisma';
import type { AppLogger } from './logger.js';
import type { BybitClientRegistry } from './bybit/client-registry.js';

interface RecalcDeps {
  prisma: PrismaClient;
  registry: BybitClientRegistry;
  logger: AppLogger;
}

interface RecalcPayload {
  jobId: string;
  cabinetId: string | null;
  dryRun: boolean;
  limit: number;
}

export async function handleRecalcClosedPnl(
  deps: RecalcDeps,
  payload: RecalcPayload,
): Promise<void> {
  const { prisma, registry, logger } = deps;
  await prisma.recalcClosedPnlJob.upsert({
    where: { id: payload.jobId },
    create: {
      id: payload.jobId,
      status: 'running',
      dryRun: payload.dryRun,
      limit: payload.limit,
      cabinetId: payload.cabinetId,
      startedAt: new Date(),
    },
    update: {
      status: 'running',
      startedAt: new Date(),
      error: null,
    },
  });

  const candidates = await prisma.signal.findMany({
    where: {
      deletedAt: null,
      status: { in: ['OPEN', 'ORDERS_PLACED', 'CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_MIXED'] },
      ...(payload.cabinetId ? { cabinetId: payload.cabinetId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: payload.limit,
    select: {
      id: true,
      cabinetId: true,
      pair: true,
    },
  });

  let updated = 0;
  let scanned = 0;
  for (const signal of candidates) {
    scanned += 1;
    try {
      const client = await registry.getClient(signal.cabinetId);
      const orderIds = (
        await prisma.order.findMany({
          where: { signalId: signal.id, bybitOrderId: { not: null } },
          select: { bybitOrderId: true },
        })
      )
        .map((o) => o.bybitOrderId)
        .filter((id): id is string => Boolean(id));
      if (orderIds.length === 0) continue;
      const now = Date.now();
      const closed = await client.getClosedPnL({
        category: 'linear',
        symbol: signal.pair,
        startTime: now - 14 * 24 * 60 * 60 * 1000,
        endTime: now,
        limit: 100,
      });
      const rows = closed.result?.list ?? [];
      if (!rows.length) continue;
      const filtered = rows.filter((row: { orderId?: string | null }) =>
        row.orderId ? orderIds.includes(row.orderId) : false,
      );
      if (!filtered.length) continue;
      const pnl = filtered.reduce((acc: number, row: { closedPnl?: string | number | null }) => {
        const val = Number(row.closedPnl ?? 0);
        return Number.isFinite(val) ? acc + val : acc;
      }, 0);
      if (!payload.dryRun) {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { realizedPnl: pnl },
        });
      }
      updated += 1;
    } catch (error) {
      logger.warn(
        { signalId: signal.id, error: error instanceof Error ? error.message : String(error) },
        'trader.recalc.signal_failed',
      );
    }
  }

  await prisma.recalcClosedPnlJob.update({
    where: { id: payload.jobId },
    data: {
      status: 'completed',
      finishedAt: new Date(),
      resultJson: JSON.stringify({ scanned, updated, dryRun: payload.dryRun }),
    },
  });
}
