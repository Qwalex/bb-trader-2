/**
 * Подчистка логов перед записью в AppLog / console.
 *
 * Правила (см. `.cursor/rules/secrets-and-logs.mdc`):
 *   * apiKey / apiSecret / session_string / sessionString / hash (Telegram login) / Authorization
 *     — ВСЕГДА маскируются до `***`.
 *   * Глубокая рекурсия в object/array с защитой от циклов.
 *   * Никогда не кидает исключений.
 */

const SECRET_KEY_PATTERNS = [
  /apiKey/i,
  /apiSecret/i,
  /api_secret/i,
  /api_key/i,
  /sessionString/i,
  /session_string/i,
  /bot_token/i,
  /botToken/i,
  /password/i,
  /authorization/i,
  /cookie/i,
  /set-cookie/i,
  /\bhash\b/i,
  /telegramHash/i,
  /webhook_secret/i,
  /encryption_key/i,
  /encryptionKey/i,
];

const MAX_STRING_LENGTH = 10_000;
const MASK = '***';

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((re) => re.test(key));
}

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…(truncated ${value.length - MAX_STRING_LENGTH}b)`;
}

export function sanitizeForLog<T>(input: T, depth = 0, seen: WeakSet<object> = new WeakSet()): T {
  if (depth > 12) return '[depth-limit]' as unknown as T;
  if (input === null || input === undefined) return input;
  const type = typeof input;
  if (type === 'string') return truncate(input as unknown as string) as unknown as T;
  if (type === 'number' || type === 'boolean' || type === 'bigint') return input;
  if (type === 'function') {
    const fn = input as unknown as { name?: string };
    return `[Function: ${fn.name || 'anonymous'}]` as unknown as T;
  }

  if (input instanceof Date) return input.toISOString() as unknown as T;
  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack ? truncate(input.stack) : undefined,
    } as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((x) => sanitizeForLog(x, depth + 1, seen)) as unknown as T;
  }

  if (type === 'object') {
    if (seen.has(input as object)) return '[Circular]' as unknown as T;
    seen.add(input as object);
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        result[k] = MASK;
        continue;
      }
      result[k] = sanitizeForLog(v, depth + 1, seen);
    }
    return result as unknown as T;
  }

  return input;
}

export function sanitizeJsonString(json: string): string {
  try {
    return JSON.stringify(sanitizeForLog(JSON.parse(json)));
  } catch {
    return truncate(json);
  }
}
