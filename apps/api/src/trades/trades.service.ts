import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/shared-prisma';
import { PRISMA } from '../prisma.module.js';

@Injectable()
export class TradesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(userId: string, cabinetId: string | null, limit = 100) {
    if (!cabinetId) return [];
    return this.prisma.signal.findMany({
      where: { userId, cabinetId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      include: {
        orders: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async softDelete(userId: string, cabinetId: string | null, signalId: string) {
    if (!cabinetId) throw new Error('No active cabinet');
    await this.prisma.signal.updateMany({
      where: {
        id: signalId,
        userId,
        cabinetId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
