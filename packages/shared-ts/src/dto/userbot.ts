import { z } from 'zod';
import { USERBOT_SESSION_STATUSES } from '../enums.js';

export const UserbotSessionDto = z.object({
  userId: z.string(),
  phone: z.string().nullable(),
  status: z.enum(USERBOT_SESSION_STATUSES),
  lastSeenAt: z.string().nullable(),
  lastError: z.string().nullable(),
  hasSession: z.boolean(),
});
export type UserbotSessionDto = z.infer<typeof UserbotSessionDto>;

export const UserbotChannelDto = z.object({
  id: z.string(),
  chatId: z.string(),
  title: z.string(),
  username: z.string().nullable(),
  enabled: z.boolean(),
  sourcePriority: z.number().int(),
});
export type UserbotChannelDto = z.infer<typeof UserbotChannelDto>;

export const AddChannelDto = z.object({
  chatId: z.string().min(1),
  title: z.string().min(1).max(200),
  username: z.string().nullable().optional(),
});
export type AddChannelDto = z.infer<typeof AddChannelDto>;

export const UpdateChannelDto = z.object({
  enabled: z.boolean().optional(),
  sourcePriority: z.number().int().min(0).max(100).optional(),
});
export type UpdateChannelDto = z.infer<typeof UpdateChannelDto>;
