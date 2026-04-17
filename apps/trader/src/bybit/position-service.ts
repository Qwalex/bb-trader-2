/**
 * Poll Bybit positions, update Signal/Order status, apply TP/SL step moves.
 * MVP: только BalanceSnapshot. Полная логика — порт из bb-trader.
 */

import type { PrismaClient } from '@repo/shared-prisma';
import type { AppLogger } from '../logger.js';
import type { BybitClientRegistry } from './client-registry.js';

export class BybitPositionService {
  constructor(
    private readonly registry: BybitClientRegistry,
    private readonly prisma: PrismaClient,
    private readonly logger: AppLogger,
  ) {}

  async pollCabinet(cabinetId: string): Promise<void> {
    const client = await this.registry.getClient(cabinetId);
    try {
      const balance = await client.getWalletBalance({ accountType: 'UNIFIED' });
      const totalEquity = Number(balance.result?.list?.[0]?.totalEquity ?? 0);
      if (Number.isFinite(totalEquity) && totalEquity > 0) {
        await this.prisma.balanceSnapshot.create({
          data: { cabinetId, totalUsd: totalEquity },
        });
      }

      // MVP: не ходим за позициями, не применяем TP/SL-шаги.
      // TODO(port): портировать apply-tp-sl-step и reconcile из bb-trader.
    } catch (error) {
      this.logger.error(
        { cabinetId, error: errorMessage(error) },
        'trader.position.poll_failed',
      );
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
