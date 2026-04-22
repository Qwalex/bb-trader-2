/**
 * Минимальное размещение ордеров на Bybit V5. MVP-каркас.
 *
 * Портировать полную логику из bb-trader/apps/api/src/modules/bybit/bybit.service.ts:
 *   - подбор qty под minOrderQty/stepQty (instrument-info кеш);
 *   - set-leverage;
 *   - DCA-разбивка по entries;
 *   - установка reduceOnly TP/SL через `/v5/order/create` с `triggerBy`;
 *   - обработка 10001/10006/110043 Bybit error-кодов с retry.
 */

import type { RestClientV5 } from 'bybit-api';
import type { PrismaClient } from '@repo/shared-prisma';
import type { SignalDirection } from '@repo/shared-ts';
import type { AppLogger } from '../logger.js';
import type { BybitClientRegistry } from './client-registry.js';

export interface PlaceSignalOrdersInput {
  signalId: string;
  cabinetId: string;
  pair: string;
  direction: SignalDirection;
  entries: number[];
  stopLoss: number;
  takeProfits: number[];
  leverage: number;
  orderUsd: number;
}

export class BybitOrderService {
  constructor(
    private readonly registry: BybitClientRegistry,
    private readonly prisma: PrismaClient,
    private readonly logger: AppLogger,
  ) {}

  async placeSignalOrders(input: PlaceSignalOrdersInput): Promise<void> {
    const client = await this.registry.getClient(input.cabinetId);
    const placedBybitOrderIds: string[] = [];
    try {
      await this.assertNoConflictingExposure(client, input);
      await this.setLeverage(client, input.pair, input.leverage);
      const entryOrderIds = await this.placeEntries(client, input);
      placedBybitOrderIds.push(...entryOrderIds);
      const tpOrderIds = await this.placeTpSl(client, input);
      placedBybitOrderIds.push(...tpOrderIds);
    } catch (error) {
      await this.rollbackOrders(client, input.signalId, input.pair, placedBybitOrderIds);
      this.logger.error(
        { signalId: input.signalId, error: errorMessage(error) },
        'trader.order.place_failed',
      );
      throw error;
    }
  }

  private async setLeverage(client: RestClientV5, symbol: string, leverage: number): Promise<void> {
    try {
      await client.setLeverage({
        category: 'linear',
        symbol,
        buyLeverage: String(leverage),
        sellLeverage: String(leverage),
      });
    } catch (error) {
      // Bybit вернёт 110043 если уже установлено — не считаем это ошибкой.
      const msg = errorMessage(error);
      if (!/110043/.test(msg)) throw error;
    }
  }

  private async assertNoConflictingExposure(
    client: RestClientV5,
    input: PlaceSignalOrdersInput,
  ): Promise<void> {
    const conflictInDb = await this.prisma.signal.count({
      where: {
        cabinetId: input.cabinetId,
        pair: input.pair,
        direction: input.direction,
        deletedAt: null,
        status: { in: ['PENDING', 'OPEN', 'ORDERS_PLACED'] },
      },
    });
    if (conflictInDb > 0) {
      throw new Error(`existing active signal for ${input.pair} ${input.direction}`);
    }
    const side = input.direction === 'BUY' ? 'Buy' : 'Sell';
    const positions = await client.getPositionInfo({ category: 'linear', symbol: input.pair });
    const activePos = positions.result?.list?.find((p) => Number(p.size ?? 0) > 0 && p.side === side);
    if (activePos) {
      throw new Error(`exchange already has active ${side} exposure for ${input.pair}`);
    }
  }

  private async placeEntries(client: RestClientV5, input: PlaceSignalOrdersInput): Promise<string[]> {
    const side = input.direction === 'BUY' ? 'Buy' : 'Sell';
    if (input.entries.length === 0) throw new Error('no entry prices in signal');
    const normalizedEntries = [...input.entries].sort((a, b) =>
      input.direction === 'BUY' ? b - a : a - b,
    );
    const entryChunks = splitOrderUsd(input.orderUsd, normalizedEntries.length);
    const placed: string[] = [];
    for (let i = 0; i < normalizedEntries.length; i += 1) {
      const entryPrice = normalizedEntries[i];
      if (entryPrice == null) continue;
      const orderUsd = entryChunks[i] ?? 0;
      const qty = computeQtyFromUsd(orderUsd, entryPrice, input.leverage);
      const response = await client.submitOrder({
        category: 'linear',
        symbol: input.pair,
        side,
        orderType: 'Limit',
        qty: qty.toString(),
        price: entryPrice.toString(),
        timeInForce: 'GTC',
        reduceOnly: false,
      });
      await this.prisma.order.create({
        data: {
          cabinetId: input.cabinetId,
          signalId: input.signalId,
          bybitOrderId: response.result?.orderId ?? null,
          orderKind: i === 0 ? 'ENTRY' : 'DCA',
          side,
          price: entryPrice,
          qty,
          status: 'NEW',
        },
      });
      if (response.result?.orderId) placed.push(response.result.orderId);
    }
    return placed;
  }

  private async placeTpSl(client: RestClientV5, input: PlaceSignalOrdersInput): Promise<string[]> {
    const closeSide = input.direction === 'BUY' ? 'Sell' : 'Buy';
    const avgEntry = input.entries.reduce((acc, p) => acc + p, 0) / input.entries.length;
    const qty = computeQtyFromUsd(input.orderUsd, avgEntry, input.leverage);
    const tps = [...input.takeProfits].sort((a, b) => (input.direction === 'BUY' ? a - b : b - a));
    const splitQty = splitQtyChunks(qty, Math.max(1, tps.length));
    const placed: string[] = [];
    for (let i = 0; i < tps.length; i += 1) {
      const tp = tps[i];
      if (tp == null || !Number.isFinite(tp) || tp <= 0) continue;
      const tpQty = splitQty[i] ?? 0;
      const response = await client.submitOrder({
        category: 'linear',
        symbol: input.pair,
        side: closeSide,
        orderType: 'Limit',
        qty: tpQty.toString(),
        price: tp.toString(),
        timeInForce: 'GTC',
        reduceOnly: true,
      });
      await this.prisma.order.create({
        data: {
          cabinetId: input.cabinetId,
          signalId: input.signalId,
          bybitOrderId: response.result?.orderId ?? null,
          orderKind: 'TP',
          side: closeSide,
          price: tp,
          qty: tpQty,
          status: 'NEW',
        },
      });
      if (response.result?.orderId) placed.push(response.result.orderId);
    }
    // Also set protective stop on exchange.
    try {
      await client.setTradingStop({
        category: 'linear',
        symbol: input.pair,
        stopLoss: String(input.stopLoss),
        tpslMode: 'Partial',
        positionIdx: 0,
      });
      await this.prisma.order.create({
        data: {
          cabinetId: input.cabinetId,
          signalId: input.signalId,
          bybitOrderId: null,
          orderKind: 'SL',
          side: closeSide,
          price: input.stopLoss,
          qty,
          status: 'NEW',
        },
      });
    } catch (error) {
      const msg = errorMessage(error);
      if (!/110043|34040/.test(msg)) {
        throw error;
      }
    }
    return placed;
  }

  private async rollbackOrders(
    client: RestClientV5,
    signalId: string,
    symbol: string,
    bybitOrderIds: string[],
  ): Promise<void> {
    for (const orderId of bybitOrderIds) {
      try {
        await client.cancelOrder({
          category: 'linear',
          symbol,
          orderId,
        });
      } catch {
        // Best effort rollback.
      }
    }
    await this.prisma.order.updateMany({
      where: {
        signalId,
        bybitOrderId: { in: bybitOrderIds },
      },
      data: { status: 'CANCELLED' },
    });
  }
}

function computeQtyFromUsd(orderUsd: number, price: number, leverage: number): number {
  // Упрощённо: qty = orderUsd * leverage / price. Округление под stepQty — в порте.
  const raw = (orderUsd * leverage) / price;
  return Math.max(0.001, Math.round(raw * 1e4) / 1e4);
}

function splitOrderUsd(totalUsd: number, chunks: number): number[] {
  if (chunks <= 1) return [totalUsd];
  const perChunk = totalUsd / chunks;
  return Array.from({ length: chunks }, () => perChunk);
}

function splitQtyChunks(totalQty: number, chunks: number): number[] {
  if (chunks <= 1) return [totalQty];
  const chunk = Math.max(0.001, totalQty / chunks);
  const out = Array.from({ length: chunks }, () => chunk);
  // Adjust rounding drift on last chunk.
  const used = out.slice(0, -1).reduce((a, b) => a + b, 0);
  out[out.length - 1] = Math.max(0.001, totalQty - used);
  return out;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
