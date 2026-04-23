import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import type {
  CreateFilterExampleDto,
  CreateFilterPatternDto,
  FilterExampleDto,
  FilterPatternDto,
  UpdateFilterExampleDto,
  UpdateFilterPatternDto,
} from '@repo/shared-ts';
import { PRISMA } from '../prisma.module.js';

@Injectable()
export class FiltersService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async listGroups(): Promise<string[]> {
    const [patterns, examples] = await this.prisma.$transaction([
      this.prisma.tgUserbotFilterPattern.findMany({
        select: { groupName: true },
        distinct: ['groupName'],
      }),
      this.prisma.tgUserbotFilterExample.findMany({
        select: { groupName: true },
        distinct: ['groupName'],
      }),
    ]);
    return Array.from(
      new Set([...patterns.map((p) => p.groupName.trim()), ...examples.map((e) => e.groupName.trim())]),
    ).sort((a, b) => a.localeCompare(b));
  }

  async listPatterns(groupName?: string): Promise<FilterPatternDto[]> {
    const rows = await this.prisma.tgUserbotFilterPattern.findMany({
      where: groupName ? { groupName } : undefined,
      orderBy: [{ groupName: 'asc' }, { kind: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      groupName: r.groupName,
      kind: r.kind as FilterPatternDto['kind'],
      pattern: r.pattern,
      requiresQuote: r.requiresQuote,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async createPattern(dto: CreateFilterPatternDto): Promise<FilterPatternDto> {
    const row = await this.prisma.tgUserbotFilterPattern.create({
      data: dto,
    });
    return {
      id: row.id,
      groupName: row.groupName,
      kind: row.kind as FilterPatternDto['kind'],
      pattern: row.pattern,
      requiresQuote: row.requiresQuote,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updatePattern(id: string, dto: UpdateFilterPatternDto): Promise<void> {
    const existing = await this.prisma.tgUserbotFilterPattern.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('pattern not found');
    await this.prisma.tgUserbotFilterPattern.update({
      where: { id },
      data: dto,
    });
  }

  async removePattern(id: string): Promise<void> {
    const existing = await this.prisma.tgUserbotFilterPattern.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('pattern not found');
    await this.prisma.tgUserbotFilterPattern.delete({ where: { id } });
  }

  async listExamples(groupName?: string): Promise<FilterExampleDto[]> {
    const rows = await this.prisma.tgUserbotFilterExample.findMany({
      where: groupName ? { groupName } : undefined,
      orderBy: [{ groupName: 'asc' }, { kind: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      groupName: r.groupName,
      kind: r.kind as FilterExampleDto['kind'],
      example: r.example,
      requiresQuote: r.requiresQuote,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async createExample(dto: CreateFilterExampleDto): Promise<FilterExampleDto> {
    const row = await this.prisma.tgUserbotFilterExample.create({
      data: dto,
    });
    return {
      id: row.id,
      groupName: row.groupName,
      kind: row.kind as FilterExampleDto['kind'],
      example: row.example,
      requiresQuote: row.requiresQuote,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateExample(id: string, dto: UpdateFilterExampleDto): Promise<void> {
    const existing = await this.prisma.tgUserbotFilterExample.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('example not found');
    await this.prisma.tgUserbotFilterExample.update({
      where: { id },
      data: dto,
    });
  }

  async removeExample(id: string): Promise<void> {
    const existing = await this.prisma.tgUserbotFilterExample.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('example not found');
    await this.prisma.tgUserbotFilterExample.delete({ where: { id } });
  }

  generatePatternFromExample(example: string): string {
    const words = example
      .toLowerCase()
      .replace(/[^a-zа-я0-9 ]/giu, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3)
      .slice(0, 5);
    if (words.length === 0) return '.*';
    const escaped = words.map((w) => escapeRegex(w));
    return escaped.join('.*');
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
