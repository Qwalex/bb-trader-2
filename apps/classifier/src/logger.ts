import pino from 'pino';
import { sanitizeForLog } from '@repo/shared-ts';

export function createLogger(level: string) {
  const logger = pino({
    level,
    base: { service: 'classifier' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log(object) {
        return sanitizeForLog(object) as Record<string, unknown>;
      },
    },
  });
  return logger;
}

export type AppLogger = ReturnType<typeof createLogger>;
