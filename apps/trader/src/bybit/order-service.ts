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
  dcaEnabled?: boolean;
  entryFillStrategy?: string;
  tpSlStepPolicy?: string | null;
  minLotBump?: boolean;
}

export class BybitOrderService {
  private readonly qtyRulesCache = new Map<string, { minQty: number; qtyStep: number }>();

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
      const res = await client.setLeverage({
        category: 'linear',
        symbol,
        buyLeverage: String(leverage),
        sellLeverage: String(leverage),
      });
      assertBybitOk(res, 'setLeverage');
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
    const targetEntries =
      input.dcaEnabled === false ? normalizedEntries.slice(0, 1) : normalizedEntries;
    const primaryOrderType = normalizeEntryFillStrategy(input.entryFillStrategy);
    const entryChunks =
      input.dcaEnabled === false ? [input.orderUsd] : splitOrderUsd(input.orderUsd, normalizedEntries.length);
    const placed: string[] = [];
    for (let i = 0; i < targetEntries.length; i += 1) {
      const entryPrice = targetEntries[i];
      if (entryPrice == null) continue;
      const orderUsd = entryChunks[i] ?? input.orderUsd;
      const rawQty = computeQtyFromUsd(orderUsd, entryPrice, input.leverage);
      const qty = await this.normalizeQty(client, input.pair, rawQty, input.minLotBump !== false);
      if (qty <= 0) {
        throw new Error(`qty normalized to zero for ${input.pair} at entry=${entryPrice}`);
      }
      const orderType = i === 0 ? primaryOrderType : 'Limit';
      const response = await this.submitOrderWithRetry(client, {
        category: 'linear',
        symbol: input.pair,
        side,
        orderType,
        qty: qty.toString(),
        ...(orderType === 'Limit' ? { price: entryPrice.toString(), timeInForce: 'GTC' } : {}),
        reduceOnly: false,
      });
      assertBybitOk(response, 'submitOrder(entry)');
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
    const qty = await this.normalizeQty(
      client,
      input.pair,
      computeQtyFromUsd(input.orderUsd, avgEntry, input.leverage),
      input.minLotBump !== false,
    );
    const tps = [...input.takeProfits].sort((a, b) => (input.direction === 'BUY' ? a - b : b - a));
    const effectiveTps = normalizeTpPolicy(input.tpSlStepPolicy, tps);
    const splitQty = splitQtyChunks(qty, Math.max(1, effectiveTps.length));
    const placed: string[] = [];
    for (let i = 0; i < effectiveTps.length; i += 1) {
      const tp = effectiveTps[i];
      if (tp == null || !Number.isFinite(tp) || tp <= 0) continue;
      const tpQty = splitQty[i] ?? 0;
      const normalizedTpQty = await this.normalizeQty(client, input.pair, tpQty, input.minLotBump !== false);
      if (normalizedTpQty <= 0) continue;
      const response = await this.submitOrderWithRetry(client, {
        category: 'linear',
        symbol: input.pair,
        side: closeSide,
        orderType: 'Limit',
        qty: normalizedTpQty.toString(),
        price: tp.toString(),
        timeInForce: 'GTC',
        reduceOnly: true,
      });
      assertBybitOk(response, 'submitOrder(tp)');
      await this.prisma.order.create({
        data: {
          cabinetId: input.cabinetId,
          signalId: input.signalId,
          bybitOrderId: response.result?.orderId ?? null,
          orderKind: 'TP',
          side: closeSide,
          price: tp,
          qty: normalizedTpQty,
          status: 'NEW',
        },
      });
      if (response.result?.orderId) placed.push(response.result.orderId);
    }
    // Also set protective stop on exchange.
    try {
      const stopRes = await client.setTradingStop({
        category: 'linear',
        symbol: input.pair,
        stopLoss: String(input.stopLoss),
        tpslMode: 'Partial',
        positionIdx: 0,
      });
      assertBybitOk(stopRes, 'setTradingStop');
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
        const response = await client.cancelOrder({
          category: 'linear',
          symbol,
          orderId,
        });
        assertBybitOk(response, 'cancelOrder(rollback)');
        await this.prisma.order.updateMany({
          where: {
            signalId,
            bybitOrderId: orderId,
          },
          data: { status: 'CANCELLED' },
        });
      } catch {
        await this.prisma.order.updateMany({
          where: {
            signalId,
            bybitOrderId: orderId,
          },
          data: { status: 'FAILED' },
        });
      }
    }
  }

  private async normalizeQty(
    client: RestClientV5,
    symbol: string,
    rawQty: number,
    bumpToMinLot: boolean,
  ): Promise<number> {
    if (!Number.isFinite(rawQty) || rawQty <= 0) return 0;
    const rules = await this.getQtyRules(client, symbol);
    const stepped = Math.floor(rawQty / rules.qtyStep) * rules.qtyStep;
    const normalized = bumpToMinLot ? Math.max(rules.minQty, stepped) : stepped;
    const rounded = Math.round(normalized * 1e8) / 1e8;
    return rounded >= rules.minQty ? rounded : 0;
  }

  private async getQtyRules(client: RestClientV5, symbol: string): Promise<{ minQty: number; qtyStep: number }> {
    const cached = this.qtyRulesCache.get(symbol);
    if (cached) return cached;
    const response = await client.getInstrumentsInfo({
      category: 'linear',
      symbol,
    });
    assertBybitOk(response, 'getInstrumentsInfo');
    const info = response.result?.list?.[0];
    const lot = info?.lotSizeFilter as
      | { minOrderQty?: string | number; qtyStep?: string | number }
      | undefined;
    const minQty = Number(lot?.minOrderQty ?? 0.001);
    const qtyStep = Number(lot?.qtyStep ?? 0.001);
    const rules = {
      minQty: Number.isFinite(minQty) && minQty > 0 ? minQty : 0.001,
      qtyStep: Number.isFinite(qtyStep) && qtyStep > 0 ? qtyStep : 0.001,
    };
    this.qtyRulesCache.set(symbol, rules);
    return rules;
  }

  private async submitOrderWithRetry(
    client: RestClientV5,
    payload: Parameters<RestClientV5['submitOrder']>[0],
  ) {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await client.submitOrder(payload);
        assertBybitOk(response, 'submitOrder');
        return response;
      } catch (error) {
        lastError = error;
        const message = errorMessage(error);
        const retriable = /10001|10006|110043/.test(message);
        if (!retriable || attempt === maxAttempts) throw error;
        await sleep(attempt * 250);
      }
    }
    throw lastError;
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

function normalizeEntryFillStrategy(raw: string | undefined): 'Limit' | 'Market' {
  if (!raw) return 'Limit';
  return raw.trim().toLowerCase() === 'market' ? 'Market' : 'Limit';
}

function normalizeTpPolicy(policy: string | null | undefined, tps: number[]): number[] {
  const normalized = policy?.trim().toLowerCase() ?? '';
  if (normalized === 'first_only' || normalized === 'single_tp') {
    return tps.length > 0 ? [tps[0] as number] : [];
  }
  return tps;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
