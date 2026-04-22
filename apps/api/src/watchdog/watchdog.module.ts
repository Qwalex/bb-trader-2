import { Module } from '@nestjs/common';
import { CabinetBotModule } from '../cabinet-bot/cabinet-bot.module.js';
import { ConfigModule } from '../config.module.js';
import { PrismaModule } from '../prisma.module.js';
import { WatchdogService } from './watchdog.service.js';

@Module({
  imports: [ConfigModule, PrismaModule, CabinetBotModule],
  providers: [WatchdogService],
  exports: [WatchdogService],
})
export class WatchdogModule {}
