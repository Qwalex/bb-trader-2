import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AddChannelDto,
  UserbotOpenrouterSpendQueryDto,
  UserbotRereadAllDto,
  UserbotRecentEventsQueryDto,
  UserbotScanTodayDto,
  UpdateChannelDto,
  USERBOT_COMMAND_TYPES,
} from '@repo/shared-ts';
import { SessionGuard, type RequestWithUser } from '../auth/session.guard.js';
import { UserbotService } from './userbot.service.js';

const EnqueueCommandBody = z.object({
  type: z.enum(USERBOT_COMMAND_TYPES),
  payload: z.record(z.string(), z.unknown()).optional(),
});

@Controller('userbot')
@UseGuards(SessionGuard)
export class UserbotController {
  constructor(private readonly userbot: UserbotService) {}

  @Get('session')
  getSession(@Req() req: RequestWithUser) {
    return this.userbot.getSession(req.authUserId!);
  }

  @Post('commands')
  async enqueue(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = EnqueueCommandBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    if (
      (parsed.data.type as string) === 'submit_2fa_password' &&
      typeof parsed.data.payload?.password !== 'string'
    ) {
      throw new BadRequestException('payload.password is required for submit_2fa_password');
    }
    return this.userbot.enqueueCommand(req.authUserId!, parsed.data.type, parsed.data.payload);
  }

  @Get('commands/:id')
  async getCommand(@Req() req: RequestWithUser, @Param('id') id: string) {
    const cmd = await this.userbot.getCommand(req.authUserId!, id);
    if (!cmd) throw new NotFoundException('command not found');
    return {
      ...cmd,
      createdAt: cmd.createdAt.toISOString(),
      finishedAt: cmd.finishedAt?.toISOString() ?? null,
    };
  }

  @Get('channels')
  listChannels(@Req() req: RequestWithUser) {
    return this.userbot.listChannels(req.authUserId!);
  }

  @Get('dashboard/summary')
  getDashboardSummary(@Req() req: RequestWithUser) {
    return this.userbot.getDashboardSummary(req.authUserId!);
  }

  @Get('dashboard/cabinets')
  listCabinetUsage(@Req() req: RequestWithUser) {
    return this.userbot.listCabinetUsage(req.authUserId!);
  }

  @Get('events/recent')
  listRecentEvents(@Req() req: RequestWithUser, @Query() query: unknown) {
    const parsed = UserbotRecentEventsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.userbot.listRecentEvents(req.authUserId!, parsed.data.limit);
  }

  @Get('trace/:ingestId')
  async getTrace(@Req() req: RequestWithUser, @Param('ingestId') ingestId: string) {
    const trace = await this.userbot.getTrace(req.authUserId!, ingestId);
    if (!trace) throw new NotFoundException('trace not found');
    return trace;
  }

  @Post('scan-today')
  scanToday(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = UserbotScanTodayDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.userbot.scanToday(req.authUserId!, parsed.data.limitPerChat);
  }

  @Post('reread-all')
  rereadAll(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = UserbotRereadAllDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.userbot.rereadAll(req.authUserId!, parsed.data.limit);
  }

  @Post('reread/:ingestId')
  async rereadOne(@Req() req: RequestWithUser, @Param('ingestId') ingestId: string) {
    try {
      return await this.userbot.reread(req.authUserId!, ingestId);
    } catch {
      throw new NotFoundException('ingest not found');
    }
  }

  @Get('openrouter/spend')
  getOpenrouterSpend(@Req() req: RequestWithUser, @Query() query: unknown) {
    const parsed = UserbotOpenrouterSpendQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.userbot.getOpenrouterSpend(req.authUserId!, parsed.data.days);
  }

  @Get('openrouter/balance')
  getOpenrouterBalance() {
    return this.userbot.getOpenrouterBalance();
  }

  @Post('channels')
  async addChannel(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = AddChannelDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.userbot.addChannel(req.authUserId!, parsed.data);
  }

  @Patch('channels/:id')
  async updateChannel(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateChannelDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    try {
      await this.userbot.updateChannel(req.authUserId!, id, parsed.data);
    } catch {
      throw new NotFoundException('channel not found');
    }
    return { ok: true };
  }

  @Delete('channels/:id')
  async removeChannel(@Req() req: RequestWithUser, @Param('id') id: string) {
    try {
      await this.userbot.removeChannel(req.authUserId!, id);
    } catch {
      throw new NotFoundException('channel not found');
    }
    return { ok: true };
  }
}
