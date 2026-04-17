/**
 * Проверка подписи Telegram Login Widget.
 * Спецификация: https://core.telegram.org/widgets/login#checking-authorization
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { TelegramLoginPayload } from '@repo/shared-ts';

export interface VerifyOptions {
  botToken: string;
  /** Максимальный возраст авторизации в секундах. Default: 86400 (24h). */
  maxAgeSeconds?: number;
}

export function verifyTelegramLogin(
  payload: TelegramLoginPayload,
  options: VerifyOptions,
): { valid: true } | { valid: false; reason: string } {
  const maxAge = options.maxAgeSeconds ?? 86_400;
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - payload.auth_date > maxAge) {
    return { valid: false, reason: 'auth_date is too old' };
  }

  const { hash, ...rest } = payload;
  const dataCheckString = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secret = createHash('sha256').update(options.botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const actual = Buffer.from(hash, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (actual.length !== expectedBuf.length) {
    return { valid: false, reason: 'hash length mismatch' };
  }
  if (!timingSafeEqual(actual, expectedBuf)) {
    return { valid: false, reason: 'hash mismatch' };
  }

  return { valid: true };
}
