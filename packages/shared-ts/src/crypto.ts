import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * AES-256-GCM шифрование секретов at rest (Bybit apiSecret, Telethon sessionString).
 *
 * Ключ — `APP_ENCRYPTION_KEY` из env, одинаковый на всех сервисах (api, trader, userbot-py,
 * которому читать его через тот же env var). Поддерживаются форматы ключа: base64 (рекомендуется)
 * или любая строка — тогда делается SHA-256 для приведения к 32 байтам.
 *
 * Формат зашифрованной строки: `v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>`.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function resolveKey(rawKey: string): Buffer {
  if (!rawKey) {
    throw new Error('APP_ENCRYPTION_KEY is not set');
  }
  try {
    const decoded = Buffer.from(rawKey, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through
  }
  return createHash('sha256').update(rawKey, 'utf8').digest();
}

export interface EncryptionContext {
  readonly encryptionKey: string;
}

export function encryptSecret(ctx: EncryptionContext, plaintext: string): string {
  const key = resolveKey(ctx.encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(ctx: EncryptionContext, payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported or corrupted encrypted payload');
  }
  const [, ivB64, tagB64, cipherB64] = parts as [string, string, string, string];
  const key = resolveKey(ctx.encryptionKey);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export function isEncryptedPayload(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(`${VERSION}:`);
}
