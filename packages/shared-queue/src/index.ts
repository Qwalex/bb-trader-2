import PgBoss from 'pg-boss';
import type { ZodSchema } from 'zod';
import type { QueueName } from '@repo/shared-ts';

export { PgBoss };

/**
 * Типобезопасная обёртка над pg-boss v10.
 *
 * Контракты:
 *   * Каждая очередь описана zod-схемой payload в `@repo/shared-ts/jobs`.
 *   * Идемпотентность обеспечивается обработчиком (PK/unique в БД). Очередь гарантирует
 *     at-least-once delivery + поддерживает `singletonKey` для дедупа на уровне producer.
 *   * Worker получает массив job'ов (батч), мы обрабатываем последовательно в рамках батча;
 *     параллелизм — через увеличение `batchSize`.
 *   * handler-таймаут реализован через `Promise.race` (pg-boss сам не кидает по истечении).
 */

export interface QueueClientOptions {
  connectionString: string;
  /** Схема в БД, где pg-boss создаёт свои таблицы (default: `pgboss`). */
  schema?: string;
  monitorStateIntervalSeconds?: number;
  application_name?: string;
}

let instance: QueueClient | undefined;

export async function getQueueClient(options: QueueClientOptions): Promise<QueueClient> {
  if (instance) return instance;
  instance = new QueueClient(options);
  await instance.start();
  return instance;
}

export async function disconnectQueueClient(): Promise<void> {
  if (instance) {
    await instance.stop();
    instance = undefined;
  }
}

export interface SendOptions {
  singletonKey?: string;
  startAfterMs?: number;
  retryLimit?: number;
  retryDelaySeconds?: number;
  retryBackoff?: boolean;
  /** Сколько часов хранить completed/failed. Default: 24. */
  retentionHours?: number;
  /** Сколько секунд у handler'а есть до «зависания» и retry. Default: 120. */
  expireInSeconds?: number;
  priority?: number;
}

export interface WorkOptions<Payload> {
  queue: QueueName;
  schema: ZodSchema<Payload>;
  handler: (payload: Payload, job: PgBoss.Job<unknown>) => Promise<void>;
  pollingIntervalSeconds?: number;
  batchSize?: number;
  /** Soft-таймаут handler'а (default: 120s). */
  handlerTimeoutSeconds?: number;
}

export class QueueClient {
  private boss: PgBoss;
  private started = false;

  constructor(private readonly options: QueueClientOptions) {
    this.boss = new PgBoss({
      connectionString: options.connectionString,
      schema: options.schema ?? 'pgboss',
      monitorStateIntervalSeconds: options.monitorStateIntervalSeconds ?? 30,
      application_name: options.application_name ?? 'bb-shared-queue',
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.boss.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.boss.stop({ graceful: true });
    this.started = false;
  }

  getBoss(): PgBoss {
    return this.boss;
  }

  /**
   * Отправить job с типизированным payload. Вернёт jobId или null (singletonKey дедупнулся).
   */
  async send<P>(
    queue: QueueName,
    schema: ZodSchema<P>,
    payload: P,
    options: SendOptions = {},
  ): Promise<string | null> {
    const parsed = schema.parse(payload);
    const sendOptions: PgBoss.SendOptions = {
      retryLimit: options.retryLimit ?? 10,
      retryDelay: options.retryDelaySeconds ?? 30,
      retryBackoff: options.retryBackoff ?? true,
      retentionHours: options.retentionHours ?? 24,
      expireInSeconds: options.expireInSeconds ?? 120,
      priority: options.priority ?? 0,
    };
    if (options.singletonKey !== undefined) sendOptions.singletonKey = options.singletonKey;
    if (options.startAfterMs !== undefined) {
      sendOptions.startAfter = new Date(Date.now() + options.startAfterMs);
    }
    return this.boss.send(queue, parsed as object, sendOptions);
  }

  /**
   * Зарегистрировать cron-job.
   */
  async schedule(
    queue: QueueName,
    cron: string,
    data: Record<string, unknown> = {},
    options: { retryLimit?: number; retryDelaySeconds?: number; retryBackoff?: boolean } = {},
  ): Promise<void> {
    const scheduleOptions: PgBoss.ScheduleOptions = {
      retryLimit: options.retryLimit ?? 3,
      retryDelay: options.retryDelaySeconds ?? 10,
      retryBackoff: options.retryBackoff ?? true,
    };
    await this.boss.schedule(queue, cron, data, scheduleOptions);
  }

  async unschedule(queue: QueueName): Promise<void> {
    await this.boss.unschedule(queue);
  }

  /**
   * Создать очередь, если её ещё нет (pg-boss v10 требует явного `createQueue` перед работой).
   */
  async createQueue(queue: QueueName, policy: PgBoss.QueuePolicy = 'standard'): Promise<void> {
    await this.boss.createQueue(queue, { name: queue, policy });
  }

  /**
   * Подписка на очередь с zod-валидацией payload.
   */
  async work<P>(opts: WorkOptions<P>): Promise<string> {
    const {
      queue,
      schema,
      handler,
      pollingIntervalSeconds = 2,
      batchSize = 1,
      handlerTimeoutSeconds = 120,
    } = opts;

    const workOptions: PgBoss.WorkOptions = {
      pollingIntervalSeconds,
      batchSize,
    };

    return this.boss.work<unknown>(queue, workOptions, async (jobs) => {
      for (const job of jobs) {
        const payload = schema.parse(job.data);
        await Promise.race([
          handler(payload, job),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Job ${queue}#${job.id} timed out after ${handlerTimeoutSeconds}s`)),
              handlerTimeoutSeconds * 1000,
            ),
          ),
        ]);
      }
    });
  }

  async offWork(workerId: string): Promise<void> {
    await this.boss.offWork({ id: workerId });
  }
}
