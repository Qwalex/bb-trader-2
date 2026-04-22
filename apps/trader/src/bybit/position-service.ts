/**
 * Poll Bybit positions, update Signal/Order status, apply TP/SL step moves.
 * MVP: только BalanceSnapshot. Полная логика — порт из bb-trader.
 */

import type { PrismaClient } from '@repo/shared-prisma';
import type { RestClientV5 } from 'bybit-api';
import type { AppLogger } from '../logger.js';
import type { BybitClientRegistry } from './client-registry.js';

export class BybitPositionService {
  constructor(
    private readonly registry: BybitClientRegistry,
    private readonly prisma: PrismaClient,
    private readonly logger: AppLogger,
  ) {}

  async pollCabinet(cabinetId: string): Promise<void> {
    try {
      const client = await this.registry.getClient(cabinetId);
      const balance = await client.getWalletBalance({ accountType: 'UNIFIED' });
      assertBybitOk(balance, 'getWalletBalance');
      const totalEquity = Number(balance.result?.list?.[0]?.totalEquity ?? 0);
      if (Number.isFinite(totalEquity) && totalEquity > 0) {
        await this.prisma.balanceSnapshot.create({
          data: { cabinetId, totalUsd: totalEquity },
        });
      }

      await this.reconcileSignals(cabinetId, client);
      await this.markBybitVerified(cabinetId, null);
    } catch (error) {
      const message = errorMessage(error);
      await this.markBybitVerified(cabinetId, message);
      this.logger.error(
        { cabinetId, error: message },
        'trader.position.poll_failed',
      );
    }
  }

  private async reconcileSignals(cabinetId: string, client: RestClientV5): Promise<void> {
    const activeSignals = await this.prisma.signal.findMany({
      where: {
        cabinetId,
        deletedAt: null,
        status: { in: ['PENDING', 'OPEN', 'ORDERS_PLACED'] },
      },
      select: {
        id: true,
        pair: true,
        direction: true,
      },
      take: 200,
      orderBy: { createdAt: 'asc' },
    });
    for (const signal of activeSignals) {
      const [positions, activeOrders] = await Promise.all([
        client.getPositionInfo({ category: 'linear', symbol: signal.pair }),
        client.getActiveOrders({ category: 'linear', symbol: signal.pair }),
      ]);
      assertBybitOk(positions, 'getPositionInfo');
      assertBybitOk(activeOrders, 'getActiveOrders');
      const expectedSide = signal.direction === 'BUY' ? 'Buy' : 'Sell';
      const hasPosition = Boolean(
        positions.result?.list?.some((p) => p.side === expectedSide && Number(p.size ?? 0) > 0),
      );
      const exchangeOrders = activeOrders.result?.list ?? [];
      await this.syncOrderStatuses(signal.id, exchangeOrders);
      if (hasPosition) {
        await this.prisma.signal.update({
          where: { id: signal.id },
          data: { status: 'OPEN' },
        });
        continue;
      }
      const hasOpenOrders = exchangeOrders.some((o) => !o.reduceOnly);
      if (hasOpenOrders) {
        await this.prisma.signal.update({
          where: { id: signal.id },
          data: { status: 'ORDERS_PLACED' },
        });
        continue;
      }
      const closedPnl = await this.fetchClosedPnlForSignal(signal.id, client, signal.pair);
      const finalStatus =
        closedPnl == null
          ? 'CLOSED_MIXED'
          : closedPnl > 0
            ? 'CLOSED_WIN'
            : closedPnl < 0
              ? 'CLOSED_LOSS'
              : 'CLOSED_MIXED';
      await this.prisma.signal.update({
        where: { id: signal.id },
        data: {
          status: finalStatus,
          ...(closedPnl == null ? {} : { realizedPnl: closedPnl }),
          closedAt: new Date(),
        },
      });
    }
  }

  private async syncOrderStatuses(
    signalId: string,
    exchangeOrders: Array<{ orderId?: string | null; orderStatus?: string | null }>,
  ): Promise<void> {
    const byId = new Map<string, string>();
    for (const order of exchangeOrders) {
      if (order.orderId && order.orderStatus) {
        byId.set(order.orderId, order.orderStatus);
      }
    }
    const dbOrders = await this.prisma.order.findMany({
      where: { signalId, bybitOrderId: { not: null } },
      select: { id: true, bybitOrderId: true, status: true },
    });
    for (const dbOrder of dbOrders) {
      if (!dbOrder.bybitOrderId) continue;
      const next = byId.get(dbOrder.bybitOrderId);
      if (!next || next === dbOrder.status) continue;
      await this.prisma.order.update({
        where: { id: dbOrder.id },
        data: {
          status: next,
          filledAt: next === 'FILLED' ? new Date() : null,
        },
      });
    }
  }

  private async fetchClosedPnlForSignal(
    signalId: string,
    client: RestClientV5,
    symbol: string,
  ): Promise<number | null> {
    try {
      const orderIds = (
        await this.prisma.order.findMany({
          where: {
            signalId,
            bybitOrderId: { not: null },
          },
          select: { bybitOrderId: true },
        })
      )
        .map((o) => o.bybitOrderId)
        .filter((id): id is string => Boolean(id));
      if (orderIds.length === 0) return null;
      const now = Date.now();
      const res = await client.getClosedPnL({
        category: 'linear',
        symbol,
        startTime: now - 7 * 24 * 60 * 60 * 1000,
        endTime: now,
        limit: 50,
      });
      assertBybitOk(res, 'getClosedPnL');
      const rows = res.result?.list ?? [];
      if (!rows.length) return null;
      const filtered = rows.filter((row: { orderId?: string | null }) =>
        row.orderId ? orderIds.includes(row.orderId) : false,
      );
      if (!filtered.length) return null;
      return filtered.reduce((acc: number, row: { closedPnl?: string | number | null }) => {
        const pnl = Number(row.closedPnl ?? 0);
        return Number.isFinite(pnl) ? acc + pnl : acc;
      }, 0);
    } catch {
      return null;
    }
  }

  private async markBybitVerified(cabinetId: string, error: string | null): Promise<void> {
    if (error) {
      await this.prisma.cabinetBybitKey.updateMany({
        where: { cabinetId },
        data: {
          lastVerifiedAt: null,
          lastVerifyError: error.slice(0, 500),
        },
      });
      return;
    }
    await this.prisma.cabinetBybitKey.updateMany({
      where: { cabinetId },
      data: {
        lastVerifiedAt: new Date(),
        lastVerifyError: null,
      },
    });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function assertBybitOk(
  response: { retCode?: number | string; retMsg?: string } | null | undefined,
  operation: string,
): void {
  if (!response) {
    throw new Error(`Bybit ${operation} returned empty response`);
  }
  const codeNum = Number(response.retCode ?? 0);
  if (!Number.isFinite(codeNum) || codeNum !== 0) {
    throw new Error(
      `Bybit ${operation} failed: retCode=${String(response.retCode)} retMsg=${response.retMsg ?? ''}`.trim(),
    );
  }
}
