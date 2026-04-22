import { Module } from '@nestjs/common';
import { ConfigModule } from '../config.module.js';
import { PrismaModule } from '../prisma.module.js';
import { WatchdogService } from './watchdog.service.js';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [WatchdogService],
  exports: [WatchdogService],
})
export class WatchdogModule {}
