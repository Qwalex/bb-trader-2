import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CabinetsModule } from './cabinets/cabinets.module.js';
import { ConfigModule } from './config.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { PrismaModule } from './prisma.module.js';
import { UserbotModule } from './userbot/userbot.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    CabinetsModule,
    UserbotModule,
    DashboardModule,
  ],
})
export class AppModule {}
