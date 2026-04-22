import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module.js';
import { WatchdogModule } from '../watchdog/watchdog.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [PrismaModule, WatchdogModule],
  controllers: [HealthController],
})
export class HealthModule {}
