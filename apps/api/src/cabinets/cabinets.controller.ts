import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateCabinetDto,
  UpdateCabinetChannelFilterDto,
  UpdateCabinetDto,
  UpdateSettingsDto,
  UpsertBybitKeyDto,
} from '@repo/shared-ts';
import { SessionGuard, type RequestWithUser } from '../auth/session.guard.js';
import { CabinetsService } from './cabinets.service.js';

@Controller('cabinets')
@UseGuards(SessionGuard)
export class CabinetsController {
  constructor(private readonly cabinets: CabinetsService) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    return this.cabinets.listForUser(req.authUserId!);
  }

  @Post()
  async create(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = CreateCabinetDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    try {
      return await this.cabinets.create(req.authUserId!, parsed.data);
    } catch (error) {
      const maybePrismaError = error as { code?: string } | null;
      if (maybePrismaError?.code === 'P2002') {
        throw new ConflictException('Cabinet slug already exists');
      }
      throw error;
    }
  }

  @Patch(':id')
  async update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateCabinetDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.cabinets.update(req.authUserId!, id, parsed.data);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.cabinets.remove(req.authUserId!, id);
    return { ok: true };
  }

  @Put(':id/bybit-key')
  async upsertBybitKey(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = UpsertBybitKeyDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.cabinets.upsertBybitKey(req.authUserId!, id, parsed.data);
    return { ok: true };
  }

  @Get(':id/settings')
  getSettings(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.cabinets.getSettings(req.authUserId!, id);
  }

  @Put(':id/settings')
  async setSettings(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateSettingsDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.cabinets.setSettings(req.authUserId!, id, parsed.data.values);
    return { ok: true };
  }

  @Get(':id/channel-filters')
  listChannelFilters(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.cabinets.listChannelFilters(req.authUserId!, id);
  }

  @Patch(':id/channel-filters/:filterId')
  async updateChannelFilter(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('filterId') filterId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateCabinetChannelFilterDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.cabinets.updateChannelFilter(req.authUserId!, id, filterId, parsed.data);
    return { ok: true };
  }
}
