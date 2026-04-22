import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminGuard, SessionGuard, type RequestWithUser } from '../auth/session.guard.js';
import { AdminService } from './admin.service.js';

const SetGlobalSettingBody = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const RunDiagnosticsBody = z.object({
  models: z.array(z.string().min(1)).min(1),
  caseIds: z.array(z.string().min(1)).optional(),
});

const RunRecalcBody = z.object({
  cabinetId: z.string().nullable().default(null),
  dryRun: z.boolean().default(true),
  limit: z.number().int().positive().max(10000).default(500),
});

@Controller('admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('global-settings')
  listGlobalSettings() {
    return this.admin.listGlobalSettings();
  }

  @Patch('global-settings')
  async setGlobalSetting(@Body() body: unknown) {
    const parsed = SetGlobalSettingBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.admin.setGlobalSetting(parsed.data.key, parsed.data.value);
  }

  @Get('logs')
  listLogs(
    @Query('limit') limit = '200',
    @Query('level') level?: string,
    @Query('category') category?: string,
  ) {
    const parsed = Number(limit);
    return this.admin.listLogs(Number.isFinite(parsed) ? parsed : 200, level, category);
  }

  @Post('diagnostics/run')
  async runDiagnostics(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = RunDiagnosticsBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.admin.runDiagnostics(req.authUserId ?? null, parsed.data.models, parsed.data.caseIds);
  }

  @Post('recalc-closed-pnl/run')
  async runRecalcClosedPnl(@Body() body: unknown) {
    const parsed = RunRecalcBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.admin.runRecalcClosedPnl(parsed.data.cabinetId, parsed.data.dryRun, parsed.data.limit);
  }
}
