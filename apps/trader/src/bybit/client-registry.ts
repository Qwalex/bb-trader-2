/**
 * Кеш Bybit RestClientV5 по cabinetId. Инстанс создаётся лениво,
 * ключи дешифруются через APP_ENCRYPTION_KEY.
 *
 * Память: базовый RestClientV5 ~5–8 MB; кеш ограничен `maxClients`
 * (по умолчанию 64) с LRU-вытеснением.
 */

import { RestClientV5 } from 'bybit-api';
import type { PrismaClient } from '@repo/shared-prisma';
import { decryptSecret, isEncryptedPayload } from '@repo/shared-ts';
import type { AppLogger } from '../logger.js';

export interface ClientRegistryOptions {
  prisma: PrismaClient;
  encryptionKey: string;
  logger: AppLogger;
  maxClients?: number;
}

interface CachedClient {
  cabinetId: string;
  client: RestClientV5;
  testnet: boolean;
  addedAt: number;
}

export class BybitClientRegistry {
  private readonly cache = new Map<string, CachedClient>();
  private readonly maxClients: number;

  constructor(private readonly opts: ClientRegistryOptions) {
    this.maxClients = opts.maxClients ?? 64;
  }

  async getClient(cabinetId: string): Promise<RestClientV5> {
    const hit = this.cache.get(cabinetId);
    if (hit) return hit.client;

    const cabinet = await this.opts.prisma.cabinet.findUnique({
      where: { id: cabinetId },
      include: { bybitKey: true },
    });
    if (!cabinet || !cabinet.bybitKey) {
      throw new Error(`Cabinet ${cabinetId} has no Bybit keys configured`);
    }
    if (!cabinet.enabled) {
      throw new Error(`Cabinet ${cabinetId} is disabled`);
    }

    const useTestnet = cabinet.bybitKey.testnet || cabinet.network === 'testnet';
    const apiKey = useTestnet
      ? cabinet.bybitKey.apiKeyTestnet
      : cabinet.bybitKey.apiKeyMainnet;
    const rawSecret = useTestnet
      ? cabinet.bybitKey.apiSecretTestnet
      : cabinet.bybitKey.apiSecretMainnet;
    if (!apiKey || !rawSecret) {
      throw new Error(
        `Cabinet ${cabinetId} is missing ${useTestnet ? 'testnet' : 'mainnet'} API credentials`,
      );
    }

    const apiSecret = isEncryptedPayload(rawSecret)
      ? decryptSecret({ encryptionKey: this.opts.encryptionKey }, rawSecret)
      : rawSecret;

    const client = new RestClientV5({
      key: apiKey,
      secret: apiSecret,
      testnet: useTestnet,
      recv_window: 10_000,
    });

    this.cache.set(cabinetId, {
      cabinetId,
      client,
      testnet: useTestnet,
      addedAt: Date.now(),
    });
    this.evictIfNeeded();

    this.opts.logger.info({ cabinetId, testnet: useTestnet }, 'trader.bybit.client_created');
    return client;
  }

  invalidate(cabinetId: string): void {
    this.cache.delete(cabinetId);
  }

  size(): number {
    return this.cache.size;
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxClients) return;
    let oldestId: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [id, entry] of this.cache.entries()) {
      if (entry.addedAt < oldestAt) {
        oldestAt = entry.addedAt;
        oldestId = id;
      }
    }
    if (oldestId) {
      this.cache.delete(oldestId);
      this.opts.logger.debug({ evictedCabinetId: oldestId }, 'trader.bybit.client_evicted');
    }
  }
}
