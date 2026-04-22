import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WatchdogModule } from '../watchdog/watchdog.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AuthModule, WatchdogModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
