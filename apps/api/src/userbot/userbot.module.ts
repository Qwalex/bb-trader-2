import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UserbotController } from './userbot.controller.js';
import { UserbotService } from './userbot.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UserbotController],
  providers: [UserbotService],
})
export class UserbotModule {}
