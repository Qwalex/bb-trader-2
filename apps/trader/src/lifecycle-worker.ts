import type { PrismaClient } from '@repo/shared-prisma';
import type { RestClientV5 } from 'bybit-api';
import type { AppLogger } from './logger.js';
import type { BybitClientRegistry } from './bybit/client-registry.js';

interface LifecyclePayload {
  signalEventId: string;
  signalId: string;
  cabinetId: string;
  eventType: 'close' | 'reentry' | 'result';
}

interface LifecycleDeps {
  prisma: PrismaClient;
  registry: BybitClientRegistry;
  logger: AppLogger;
}

export async function handleLifecycleEvent(
  deps: LifecycleDeps,
  payload: LifecyclePayload,
): Promise<void> {
  const { prisma, registry, logger } = deps;
  const signal = await prisma.signal.findUnique({
    where: { id: payload.signalId },
    select: {
      id: true,
      cabinetId: true,
      pair: true,
      direction: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!signal || signal.deletedAt) return;
  if (signal.cabinetId !== payload.cabinetId) return;

  if (payload.eventType === 'close') {
    const client = await registry.getClient(payload.cabinetId);
    await closeSignalOnExchange(prisma, client, signal.id, signal.pair, signal.direction);
    await prisma.signal.update({
      where: { id: signal.id },
      data: {
        status: 'CLOSED_MIXED',
        closedAt: new Date(),
      },
    });
    logger.info(
      { signalId: signal.id, signalEventId: payload.signalEventId },
      'trader.lifecycle.close_applied',
    );
    return;
  }

  if (payload.eventType === 'result') {
    await prisma.signal.update({
      where: { id: signal.id },
      data: {
        status: signal.status === 'OPEN' || signal.status === 'ORDERS_PLACED' ? 'CLOSED_MIXED' : signal.status,
        ...(signal.status === 'OPEN' || signal.status === 'ORDERS_PLACED'
          ? { closedAt: new Date() }
          : {}),
      },
    });
    logger.info(
      { signalId: signal.id, signalEventId: payload.signalEventId },
      'trader.lifecycle.result_applied',
    );
    return;
  }

  logger.info(
    { signalId: signal.id, signalEventId: payload.signalEventId },
    'trader.lifecycle.reentry_received',
  );
}

async function closeSignalOnExchange(
  prisma: PrismaClient,
  client: RestClientV5,
  signalId: string,
  symbol: string,
  direction: string,
): Promise<void> {
  const openOrders = await prisma.order.findMany({
    where: {
      signalId,
      bybitOrderId: { not: null },
      status: { in: ['NEW', 'PARTIALLY_FILLED'] },
    },
    select: { id: true, bybitOrderId: true },
  });
  for (const order of openOrders) {
    if (!order.bybitOrderId) continue;
    try {
      await client.cancelOrder({
        category: 'linear',
        symbol,
        orderId: order.bybitOrderId,
      });
    } catch {
      // ignore best-effort cancellation.
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });
  }

  const expectedSide = direction === 'BUY' ? 'Buy' : 'Sell';
  const closeSide = direction === 'BUY' ? 'Sell' : 'Buy';
  const positions = await client.getPositionInfo({ category: 'linear', symbol });
  const activePosition = positions.result?.list?.find(
    (position) => position.side === expectedSide && Number(position.size ?? 0) > 0,
  );
  if (!activePosition) return;
  const size = Number(activePosition.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return;

  await client.submitOrder({
    category: 'linear',
    symbol,
    side: closeSide,
    orderType: 'Market',
    qty: String(size),
    reduceOnly: true,
  });
}
