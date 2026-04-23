import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import { APP_CONFIG } from './config.module.js';
import type { AppConfig } from './config.js';
import { PRISMA } from './prisma.module.js';

@Injectable()
export class SettingsResolverService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async getGlobal(key: string, fallback: string | null = null): Promise<string | null> {
    const row = await this.prisma.globalSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    if (row?.value != null) return row.value;
    const envValue = (this.config as Record<string, unknown>)[key];
    if (typeof envValue === 'string' && envValue.length > 0) return envValue;
    return fallback;
  }

  async getGlobalNumber(key: string): Promise<number | null> {
    const value = await this.getGlobal(key, null);
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
