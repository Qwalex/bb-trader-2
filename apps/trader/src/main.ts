import { getPrisma, disconnectPrisma } from '@repo/shared-prisma';
import { getQueueClient, disconnectQueueClient } from '@repo/shared-queue';
import {
  ExecuteLifecyclePayload,
  ExecuteSignalPayload,
  PollCabinetPositionsPayload,
  RecalcClosedPnlPayload,
  QUEUE_NAMES,
} from '@repo/shared-ts';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { BybitClientRegistry } from './bybit/client-registry.js';
import { BybitOrderService } from './bybit/order-service.js';
import { BybitPositionService } from './bybit/position-service.js';
import { SignalFanoutService } from './fanout.js';
import { handlePollCabinetPositions } from './poll-worker.js';
import { handleRecalcClosedPnl } from './recalc-worker.js';
import { handleLifecycleEvent } from './lifecycle-worker.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  logger.info({ cron: config.POLL_CABINET_POSITIONS_CRON }, 'trader.start');

  const prisma = getPrisma();
  const queue = await getQueueClient({
    connectionString: config.DATABASE_URL,
    application_name: 'bb-trader',
  });

  await queue.createQueue(QUEUE_NAMES.executeSignal);
  await queue.createQueue(QUEUE_NAMES.executeLifecycle);
  await queue.createQueue(QUEUE_NAMES.pollCabinetPositions);
  await queue.createQueue(QUEUE_NAMES.recalcClosedPnl);

  const registry = new BybitClientRegistry({
    prisma,
    encryptionKey: config.APP_ENCRYPTION_KEY,
    logger,
  });
  const orderService = new BybitOrderService(registry, prisma, logger);
  const positionService = new BybitPositionService(registry, prisma, logger);
  const fanout = new SignalFanoutService({
    prisma,
    orderService,
    logger,
    encryptionKey: config.APP_ENCRYPTION_KEY,
  });

  const executeSignalWorker = await queue.work({
    queue: QUEUE_NAMES.executeSignal,
    schema: ExecuteSignalPayload,
    batchSize: config.TRADER_SIGNAL_CONCURRENCY,
    pollingIntervalSeconds: 2,
    handlerTimeoutSeconds: 240,
    handler: async (payload) => {
      await fanout.handle({
        signalDraftId: payload.signalDraftId,
        userId: payload.userId,
        onlyCabinetId: payload.cabinetId,
      });
    },
  });

  const executeLifecycleWorker = await queue.work({
    queue: QUEUE_NAMES.executeLifecycle,
    schema: ExecuteLifecyclePayload,
    pollingIntervalSeconds: 2,
    handlerTimeoutSeconds: 240,
    handler: async (payload) => {
      await handleLifecycleEvent(
        { prisma, registry, logger },
        {
          signalEventId: payload.signalEventId,
          signalId: payload.signalId,
          cabinetId: payload.cabinetId,
          eventType: payload.eventType,
        },
      );
    },
  });

  const pollWorker = await queue.work({
    queue: QUEUE_NAMES.pollCabinetPositions,
    schema: PollCabinetPositionsPayload,
    pollingIntervalSeconds: 5,
    handlerTimeoutSeconds: 120,
    handler: async (payload) => {
      await handlePollCabinetPositions(
        { prisma, position: positionService, logger },
        payload ?? {},
      );
    },
  });

  const recalcClosedPnlWorker = await queue.work({
    queue: QUEUE_NAMES.recalcClosedPnl,
    schema: RecalcClosedPnlPayload,
    pollingIntervalSeconds: 10,
    handlerTimeoutSeconds: 600,
    handler: async (payload) => {
      await handleRecalcClosedPnl(
        { prisma, registry, logger },
        {
          jobId: payload.jobId,
          cabinetId: payload.cabinetId ?? null,
          dryRun: payload.dryRun ?? true,
          limit: payload.limit ?? 500,
        },
      );
    },
  });

  await queue.unschedule(QUEUE_NAMES.pollCabinetPositions);
  await queue.schedule(QUEUE_NAMES.pollCabinetPositions, config.POLL_CABINET_POSITIONS_CRON);

  logger.info(
    {
      executeSignalWorker,
      executeLifecycleWorker,
      pollWorker,
      recalcClosedPnlWorker,
      clientCacheMax: registry.size(),
    },
    'trader.ready',
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'trader.shutdown.begin');
    await queue.offWork(executeSignalWorker);
    await queue.offWork(executeLifecycleWorker);
    await queue.offWork(pollWorker);
    await queue.offWork(recalcClosedPnlWorker);
    await disconnectQueueClient();
    await disconnectPrisma();
    logger.info('trader.shutdown.done');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await new Promise(() => {});
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('trader fatal error', error);
  process.exit(1);
});
