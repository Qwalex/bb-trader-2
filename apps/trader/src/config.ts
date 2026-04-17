import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().min(1),
  POLL_CABINET_POSITIONS_CRON: z.string().default('*/30 * * * * *'),
  TRADER_SIGNAL_CONCURRENCY: z.coerce.number().int().positive().default(2),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof Env>;

export function loadConfig(): AppConfig {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid env: ${issues}`);
  }
  return parsed.data;
}
