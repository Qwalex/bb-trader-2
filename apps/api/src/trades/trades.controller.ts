import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard, type RequestWithUser } from '../auth/session.guard.js';
import { TradesService } from './trades.service.js';

@Controller('trades')
@UseGuards(SessionGuard)
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  list(@Req() req: RequestWithUser, @Query('cabinetId') cabinetId?: string, @Query('limit') limit?: string) {
    const id = cabinetId ?? req.activeCabinetId ?? null;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.trades.list(req.authUserId!, id, parsedLimit);
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithUser, @Param('id') id: string, @Query('cabinetId') cabinetId?: string) {
    const active = cabinetId ?? req.activeCabinetId ?? null;
    if (!active) throw new BadRequestException('No active cabinet');
    return this.trades.softDelete(req.authUserId!, active, id);
  }
}
