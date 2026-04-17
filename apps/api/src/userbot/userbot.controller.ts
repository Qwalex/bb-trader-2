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
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AddChannelDto,
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
