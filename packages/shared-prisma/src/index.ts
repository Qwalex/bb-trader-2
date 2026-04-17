import { PrismaClient } from './generated/client/index.js';

export { Prisma } from './generated/client/index.js';
export type { PrismaClient } from './generated/client/index.js';

declare const prismaForTypes: PrismaClient;

export type User = Awaited<ReturnType<(typeof prismaForTypes)['user']['create']>>;
export type Session = Awaited<ReturnType<(typeof prismaForTypes)['session']['create']>>;
export type Cabinet = Awaited<ReturnType<(typeof prismaForTypes)['cabinet']['create']>>;
export type CabinetBybitKey = Awaited<
  ReturnType<(typeof prismaForTypes)['cabinetBybitKey']['create']>
>;
export type CabinetSetting = Awaited<
  ReturnType<(typeof prismaForTypes)['cabinetSetting']['create']>
>;
export type CabinetChannelFilter = Awaited<
  ReturnType<(typeof prismaForTypes)['cabinetChannelFilter']['create']>
>;
export type CabinetSignal = Awaited<
  ReturnType<(typeof prismaForTypes)['cabinetSignal']['create']>
>;
export type UserbotSession = Awaited<
  ReturnType<(typeof prismaForTypes)['userbotSession']['create']>
>;
export type UserbotChannel = Awaited<
  ReturnType<(typeof prismaForTypes)['userbotChannel']['create']>
>;
export type UserbotCommand = Awaited<
  ReturnType<(typeof prismaForTypes)['userbotCommand']['create']>
>;
export type IngestEvent = Awaited<ReturnType<(typeof prismaForTypes)['ingestEvent']['create']>>;
export type SignalDraft = Awaited<ReturnType<(typeof prismaForTypes)['signalDraft']['create']>>;
export type Signal = Awaited<ReturnType<(typeof prismaForTypes)['signal']['create']>>;
export type Order = Awaited<ReturnType<(typeof prismaForTypes)['order']['create']>>;
export type SignalEvent = Awaited<ReturnType<(typeof prismaForTypes)['signalEvent']['create']>>;
export type BalanceSnapshot = Awaited<
  ReturnType<(typeof prismaForTypes)['balanceSnapshot']['create']>
>;
export type AppLog = Awaited<ReturnType<(typeof prismaForTypes)['appLog']['create']>>;
export type GlobalSetting = Awaited<
  ReturnType<(typeof prismaForTypes)['globalSetting']['create']>
>;

type PrismaLogLevel = 'info' | 'query' | 'warn' | 'error';

/**
 * Singleton Prisma client.
 *
 * Каждый сервис (userbot-py не в счёт — он напрямую в Postgres) должен импортировать
 * клиент ТОЛЬКО через `getPrisma()`, чтобы не плодить пулы соединений.
 *
 * Рекомендуемый лимит на сервис: 5 connections (trader — 10), настраивается
 * через `?connection_limit=` в `DATABASE_URL`.
 */
declare global {
  // eslint-disable-next-line no-var
  var __repoPrisma: PrismaClient | undefined;
}

export interface GetPrismaOptions {
  /** Явный override log-уровня (по умолчанию берётся из NODE_ENV). */
  log?: PrismaLogLevel[];
}

export function getPrisma(options: GetPrismaOptions = {}): PrismaClient {
  if (globalThis.__repoPrisma) {
    return globalThis.__repoPrisma;
  }

  const client = new PrismaClient({
    log: options.log ?? (process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error']),
  });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__repoPrisma = client;
  }

  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (globalThis.__repoPrisma) {
    await globalThis.__repoPrisma.$disconnect();
    globalThis.__repoPrisma = undefined;
  }
}
