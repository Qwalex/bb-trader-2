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
    try {
      await this.setLeverage(client, input.pair, input.leverage);
      await this.placeEntry(client, input);
      await this.placeTpSl(client, input);
    } catch (error) {
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

  private async placeEntry(client: RestClientV5, input: PlaceSignalOrdersInput): Promise<void> {
    const side = input.direction === 'BUY' ? 'Buy' : 'Sell';
    const entry0 = input.entries[0];
    if (entry0 == null) throw new Error('no entry price in signal');
    const qty = computeQtyFromUsd(input.orderUsd, entry0, input.leverage);

    const response = await client.submitOrder({
      category: 'linear',
      symbol: input.pair,
      side,
      orderType: 'Limit',
      qty: qty.toString(),
      price: entry0.toString(),
      timeInForce: 'GTC',
      reduceOnly: false,
    });

    await this.prisma.order.create({
      data: {
        cabinetId: input.cabinetId,
        signalId: input.signalId,
        bybitOrderId: response.result?.orderId ?? null,
        orderKind: 'ENTRY',
        side,
        price: entry0,
        qty,
        status: 'NEW',
      },
    });
  }

  private async placeTpSl(
    _client: RestClientV5,
    _input: PlaceSignalOrdersInput,
  ): Promise<void> {
    // MVP: оставить TP/SL на apply после заполнения entry — добавить в poll-cycle.
    // Полный порт — bb-trader bybit.service.ts.
  }
}

function computeQtyFromUsd(orderUsd: number, price: number, leverage: number): number {
  // Упрощённо: qty = orderUsd * leverage / price. Округление под stepQty — в порте.
  const raw = (orderUsd * leverage) / price;
  return Math.max(0.001, Math.round(raw * 1e4) / 1e4);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
