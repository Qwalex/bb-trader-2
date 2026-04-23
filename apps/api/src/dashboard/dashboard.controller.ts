import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard, type RequestWithUser } from '../auth/session.guard.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@Req() req: RequestWithUser) {
    return this.dashboard.summary(req.authUserId!, req.activeCabinetId ?? null);
  }

  @Get('signals')
  signals(
    @Req() req: RequestWithUser,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.dashboard.recentSignals(req.authUserId!, req.activeCabinetId ?? null, parsedLimit);
  }

  @Get('pnl-series')
  pnlSeries(
    @Req() req: RequestWithUser,
    @Query('days') days?: string,
  ) {
    const parsedDays = days ? Number.parseInt(days, 10) : undefined;
    return this.dashboard.pnlSeries(req.authUserId!, req.activeCabinetId ?? null, parsedDays);
  }

  @Get('source-stats')
  sourceStats(@Req() req: RequestWithUser) {
    return this.dashboard.sourceStats(req.authUserId!, req.activeCabinetId ?? null);
  }
}
