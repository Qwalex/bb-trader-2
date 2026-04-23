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
  UseGuards,
} from '@nestjs/common';
import {
  CreateFilterExampleDto,
  CreateFilterPatternDto,
  GenerateFilterPatternDto,
  UpdateFilterExampleDto,
  UpdateFilterPatternDto,
} from '@repo/shared-ts';
import { AdminGuard, SessionGuard } from '../auth/session.guard.js';
import { FiltersService } from './filters.service.js';

@Controller('filters')
@UseGuards(SessionGuard, AdminGuard)
export class FiltersController {
  constructor(private readonly filters: FiltersService) {}

  @Get('groups')
  listGroups() {
    return this.filters.listGroups();
  }

  @Get('patterns')
  listPatterns(@Query('groupName') groupName?: string) {
    return this.filters.listPatterns(groupName);
  }

  @Post('patterns')
  createPattern(@Body() body: unknown) {
    const parsed = CreateFilterPatternDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.filters.createPattern(parsed.data);
  }

  @Patch('patterns/:id')
  async updatePattern(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateFilterPatternDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    try {
      await this.filters.updatePattern(id, parsed.data);
    } catch {
      throw new NotFoundException('pattern not found');
    }
    return { ok: true };
  }

  @Delete('patterns/:id')
  async removePattern(@Param('id') id: string) {
    try {
      await this.filters.removePattern(id);
    } catch {
      throw new NotFoundException('pattern not found');
    }
    return { ok: true };
  }

  @Post('patterns/generate')
  generatePattern(@Body() body: unknown) {
    const parsed = GenerateFilterPatternDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return {
      groupName: parsed.data.groupName,
      kind: parsed.data.kind,
      requiresQuote: parsed.data.requiresQuote,
      pattern: this.filters.generatePatternFromExample(parsed.data.example),
    };
  }

  @Get('examples')
  listExamples(@Query('groupName') groupName?: string) {
    return this.filters.listExamples(groupName);
  }

  @Post('examples')
  createExample(@Body() body: unknown) {
    const parsed = CreateFilterExampleDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.filters.createExample(parsed.data);
  }

  @Patch('examples/:id')
  async updateExample(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateFilterExampleDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    try {
      await this.filters.updateExample(id, parsed.data);
    } catch {
      throw new NotFoundException('example not found');
    }
    return { ok: true };
  }

  @Delete('examples/:id')
  async removeExample(@Param('id') id: string) {
    try {
      await this.filters.removeExample(id);
    } catch {
      throw new NotFoundException('example not found');
    }
    return { ok: true };
  }
}
