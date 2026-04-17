import { z } from 'zod';
import { USERBOT_COMMAND_TYPES } from '../enums.js';

/**
 * Queue: userbot.command
 *
 * Producer: apps/api — когда web просит QR-код/logout/подписку на канал.
 * Consumer: apps/userbot (Python) — слушает очередь через pg-boss (там же, в Postgres),
 *   исполняет действие, пишет результат в UserbotCommand.resultJson.
 */
export const UserbotCommandPayload = z.object({
  commandId: z.string(),
  userId: z.string(),
  type: z.enum(USERBOT_COMMAND_TYPES),
  /** Произвольный payload команды (например, { chatId, title } для add_channel). */
  payload: z.record(z.unknown()).optional(),
});

export type UserbotCommandPayload = z.infer<typeof UserbotCommandPayload>;
