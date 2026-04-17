import { Module } from '@nestjs/common';
import { CabinetsController } from './cabinets.controller.js';
import { CabinetsService } from './cabinets.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [CabinetsController],
  providers: [CabinetsService],
})
export class CabinetsModule {}
