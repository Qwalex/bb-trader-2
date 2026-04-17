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
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
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
