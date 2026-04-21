import { Controller, Get } from '@nestjs/common';

/**
 * Публичный healthcheck. Должен оставаться без guards и без обращений к БД,
 * чтобы Railway-проба проходила даже если DB временно недоступна — это
 * проверяет только, что процесс Fastify живой и слушает порт.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { ok: true; service: 'api'; ts: string } {
    return { ok: true, service: 'api', ts: new Date().toISOString() };
  }
}
