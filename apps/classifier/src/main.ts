import { getPrisma, disconnectPrisma } from '@repo/shared-prisma';
import { getQueueClient, disconnectQueueClient } from '@repo/shared-queue';
import { DiagnosticsRunPayload, QUEUE_NAMES } from '@repo/shared-ts';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { OpenRouterClient } from './openrouter.js';
import { IngestWorker } from './ingest-worker.js';
import { handleDiagnosticsRun } from './diagnostics-worker.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  logger.info({ model: config.OPENROUTER_MODEL }, 'classifier.start');

  const prisma = getPrisma();
  const queue = await getQueueClient({
    connectionString: config.DATABASE_URL,
    application_name: 'bb-classifier',
  });

  // pg-boss v10 требует явного createQueue
  await queue.createQueue(QUEUE_NAMES.executeSignal);
  await queue.createQueue(QUEUE_NAMES.executeLifecycle);
  await queue.createQueue(QUEUE_NAMES.diagnosticsRun);

  const openrouter = new OpenRouterClient({
    apiKey: config.OPENROUTER_API_KEY,
    model: config.OPENROUTER_MODEL,
    timeoutMs: config.OPENROUTER_HTTP_TIMEOUT_MS,
    logger,
  });

  const worker = new IngestWorker({
    prisma,
    queue,
    openrouter,
    logger,
    pollIntervalMs: config.CLASSIFIER_POLL_INTERVAL_MS,
    batchSize: config.CLASSIFIER_BATCH_SIZE,
    fallbackModel: config.OPENROUTER_FALLBACK_MODEL,
  });

  const diagnosticsWorker = await queue.work({
    queue: QUEUE_NAMES.diagnosticsRun,
    schema: DiagnosticsRunPayload,
    pollingIntervalSeconds: 5,
    handlerTimeoutSeconds: 600,
    handler: async (payload) => {
      await handleDiagnosticsRun({ prisma, logger, openrouter }, payload);
    },
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'classifier.shutdown.begin');
    worker.stop();
    await queue.offWork(diagnosticsWorker);
    await disconnectQueueClient();
    await disconnectPrisma();
    logger.info('classifier.shutdown.done');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await worker.run();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('classifier fatal error', error);
  process.exit(1);
});
