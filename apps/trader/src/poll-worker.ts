/**
 * Consumer cron-job `poll.cabinet_positions` — для каждого включённого кабинета
 * вызывает PositionService.pollCabinet.
 */

import type { PrismaClient } from '@repo/shared-prisma';
import type { AppLogger } from './logger.js';
import type { BybitPositionService } from './bybit/position-service.js';

export interface PollHandlerDeps {
  prisma: PrismaClient;
  position: BybitPositionService;
  logger: AppLogger;
}

export async function handlePollCabinetPositions(
  deps: PollHandlerDeps,
  payload: { cabinetId?: string },
): Promise<void> {
  const { prisma, position, logger } = deps;
  const cabinets = await prisma.cabinet.findMany({
    where: { enabled: true, ...(payload.cabinetId ? { id: payload.cabinetId } : {}) },
    select: { id: true },
  });

  for (const cabinet of cabinets) {
    try {
      await position.pollCabinet(cabinet.id);
    } catch (error) {
      logger.error(
        { cabinetId: cabinet.id, error: errorMessage(error) },
        'trader.poll.cabinet_failed',
      );
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
