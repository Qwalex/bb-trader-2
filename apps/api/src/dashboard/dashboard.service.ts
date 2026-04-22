import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import { PRISMA } from '../prisma.module.js';

@Injectable()
export class DashboardService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async summary(userId: string, cabinetId: string | null) {
    if (!cabinetId) {
      return { activeCabinetId: null, signalsCount: 0, openSignalsCount: 0, balance: null };
    }

    const owned = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, ownerUserId: userId },
      select: { id: true },
    });
    if (!owned) return { activeCabinetId: null, signalsCount: 0, openSignalsCount: 0, balance: null };

    const [total, open, latestBalance, closedStats] = await Promise.all([
      this.prisma.signal.count({ where: { cabinetId, deletedAt: null } }),
      this.prisma.signal.count({
        where: { cabinetId, deletedAt: null, status: { in: ['OPEN', 'ORDERS_PLACED'] } },
      }),
      this.prisma.balanceSnapshot.findFirst({
        where: { cabinetId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.signal.findMany({
        where: {
          cabinetId,
          deletedAt: null,
          status: { in: ['CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_MIXED'] },
        },
        select: { realizedPnl: true, status: true },
      }),
    ]);
    const pnlTotal = closedStats.reduce((acc, s) => acc + Number(s.realizedPnl ?? 0), 0);
    const wins = closedStats.filter((s) => s.status === 'CLOSED_WIN').length;
    const losses = closedStats.filter((s) => s.status === 'CLOSED_LOSS').length;
    const winrate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : null;

    return {
      activeCabinetId: cabinetId,
      signalsCount: total,
      openSignalsCount: open,
      closedSignalsCount: closedStats.length,
      winrate,
      pnlTotal,
      balance: latestBalance
        ? { totalUsd: latestBalance.totalUsd, at: latestBalance.createdAt.toISOString() }
        : null,
    };
  }

  async recentSignals(userId: string, cabinetId: string | null, limit = 50) {
    if (!cabinetId) return [];
    const signals = await this.prisma.signal.findMany({
      where: { cabinetId, userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        pair: true,
        direction: true,
        status: true,
        realizedPnl: true,
        createdAt: true,
        closedAt: true,
      },
    });
    return signals.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
    }));
  }

  async pnlSeries(userId: string, cabinetId: string | null, days = 30) {
    if (!cabinetId) return [];
    const from = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.signal.findMany({
      where: {
        cabinetId,
        userId,
        deletedAt: null,
        closedAt: { not: null, gte: from },
        status: { in: ['CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_MIXED'] },
      },
      select: { realizedPnl: true, closedAt: true },
      orderBy: { closedAt: 'asc' },
    });
    const byDay = new Map<string, number>();
    for (const row of rows) {
      if (!row.closedAt) continue;
      const day = row.closedAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + Number(row.realizedPnl ?? 0));
    }
    return [...byDay.entries()].map(([day, pnl]) => ({ day, pnl }));
  }

  async sourceStats(userId: string, cabinetId: string | null) {
    if (!cabinetId) return [];
    const rows = await this.prisma.signal.groupBy({
      by: ['sourceChatId'],
      where: { cabinetId, userId, deletedAt: null, sourceChatId: { not: null } },
      _count: { _all: true },
      _sum: { realizedPnl: true },
      orderBy: { _count: { sourceChatId: 'desc' } },
      take: 50,
    });
    return rows.map((row) => ({
      sourceChatId: row.sourceChatId,
      count: row._count._all,
      pnl: Number(row._sum.realizedPnl ?? 0),
    }));
  }
}
