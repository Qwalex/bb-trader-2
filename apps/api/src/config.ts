import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  INITIAL_ADMIN_TELEGRAM_ID: z.string().optional(),
  API_CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  API_PORT: z.coerce.number().int().positive().default(3001),
  /** Railway (и docker-compose) иногда кладут `PORT=""`; иначе z.coerce даёт 0 → падение env. */
  PORT: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  WATCHDOG_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  WATCHDOG_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  WATCHDOG_INGEST_STUCK_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  WATCHDOG_USERBOT_COMMAND_STUCK_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  WATCHDOG_RECALC_STUCK_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
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
