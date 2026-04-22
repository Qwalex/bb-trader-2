import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CabinetBotModule } from './cabinet-bot/cabinet-bot.module.js';
import { CabinetsModule } from './cabinets/cabinets.module.js';
import { ConfigModule } from './config.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma.module.js';
import { TradesModule } from './trades/trades.module.js';
import { UserbotModule } from './userbot/userbot.module.js';
import { WatchdogModule } from './watchdog/watchdog.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    CabinetBotModule,
    AdminModule,
    WatchdogModule,
    CabinetsModule,
    UserbotModule,
    DashboardModule,
    TradesModule,
  ],
})
export class AppModule {}
