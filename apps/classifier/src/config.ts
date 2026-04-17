import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),
  OPENROUTER_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  CLASSIFIER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  CLASSIFIER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
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
