import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AdminGuard, SessionGuard } from './session.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, AdminGuard],
  exports: [AuthService, SessionGuard, AdminGuard],
})
export class AuthModule {}
