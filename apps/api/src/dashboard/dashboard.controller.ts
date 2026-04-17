import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard, type RequestWithUser } from '../auth/session.guard.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@Req() req: RequestWithUser, @Query('cabinetId') cabinetId?: string) {
    const id = cabinetId ?? req.activeCabinetId ?? null;
    return this.dashboard.summary(req.authUserId!, id);
  }

  @Get('signals')
  signals(
    @Req() req: RequestWithUser,
    @Query('cabinetId') cabinetId?: string,
    @Query('limit') limit?: string,
  ) {
    const id = cabinetId ?? req.activeCabinetId ?? null;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.dashboard.recentSignals(req.authUserId!, id, parsedLimit);
  }
}
