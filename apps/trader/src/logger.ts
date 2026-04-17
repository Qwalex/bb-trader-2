import pino from 'pino';
import { sanitizeForLog } from '@repo/shared-ts';

export function createLogger(level: string) {
  return pino({
    level,
    base: { service: 'trader' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log(object) {
        return sanitizeForLog(object) as Record<string, unknown>;
      },
    },
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
