import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TradesController } from './trades.controller.js';
import { TradesService } from './trades.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TradesController],
  providers: [TradesService],
})
export class TradesModule {}
