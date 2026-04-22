import { Inject, ServiceUnavailableException, Controller, Get } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import { PRISMA } from '../prisma.module.js';
import { WatchdogService } from '../watchdog/watchdog.service.js';

/**
 * Публичный healthcheck. Должен оставаться без guards и без обращений к БД,
 * чтобы Railway-проба проходила даже если DB временно недоступна — это
 * проверяет только, что процесс Fastify живой и слушает порт.
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly watchdog: WatchdogService,
  ) {}

  @Get()
  check(): { ok: true; service: 'api'; ts: string } {
    return { ok: true, service: 'api', ts: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const pipeline = await this.watchdog.getPipelineSummary();
      return { ok: true as const, service: 'api' as const, ts: new Date().toISOString(), pipeline };
    } catch (error) {
      throw new ServiceUnavailableException({
        ok: false,
        service: 'api',
        ts: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
