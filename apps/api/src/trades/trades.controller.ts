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
  list(@Req() req: RequestWithUser, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.trades.list(req.authUserId!, req.activeCabinetId ?? null, parsedLimit);
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    const active = req.activeCabinetId ?? null;
    if (!active) throw new BadRequestException('No active cabinet');
    return this.trades.softDelete(req.authUserId!, active, id);
  }
}
