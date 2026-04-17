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

    const [total, open, latestBalance] = await Promise.all([
      this.prisma.signal.count({ where: { cabinetId, deletedAt: null } }),
      this.prisma.signal.count({
        where: { cabinetId, deletedAt: null, status: { in: ['OPEN', 'ORDERS_PLACED'] } },
      }),
      this.prisma.balanceSnapshot.findFirst({
        where: { cabinetId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      activeCabinetId: cabinetId,
      signalsCount: total,
      openSignalsCount: open,
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
}
