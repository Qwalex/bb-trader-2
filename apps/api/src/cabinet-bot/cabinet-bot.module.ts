import { Module } from '@nestjs/common';
import { ConfigModule } from '../config.module.js';
import { PrismaModule } from '../prisma.module.js';
import { CabinetBotController } from './cabinet-bot.controller.js';
import { CabinetBotService } from './cabinet-bot.service.js';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [CabinetBotController],
  providers: [CabinetBotService],
  exports: [CabinetBotService],
})
export class CabinetBotModule {}
