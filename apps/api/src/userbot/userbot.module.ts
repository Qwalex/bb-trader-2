import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsResolverService } from '../settings-resolver.service.js';
import { UserbotController } from './userbot.controller.js';
import { UserbotService } from './userbot.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UserbotController],
  providers: [UserbotService, SettingsResolverService],
})
export class UserbotModule {}
