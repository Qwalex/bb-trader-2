import { z } from 'zod';
import { USER_ROLES } from '../enums.js';

/**
 * Telegram Login Widget payload (https://core.telegram.org/widgets/login).
 * Проверка HMAC-SHA256 с использованием TELEGRAM_BOT_TOKEN — в api.
 */
export const TelegramLoginPayload = z.object({
  id: z.number().int(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
  auth_date: z.number().int(),
  hash: z.string(),
});
export type TelegramLoginPayload = z.infer<typeof TelegramLoginPayload>;

export const CurrentUserDto = z.object({
  id: z.string(),
  telegramUserId: z.string(),
  telegramUsername: z.string().nullable(),
  displayName: z.string().nullable(),
  photoUrl: z.string().nullable(),
  role: z.enum(USER_ROLES),
  enabled: z.boolean(),
  activeCabinetId: z.string().nullable(),
});
export type CurrentUserDto = z.infer<typeof CurrentUserDto>;
