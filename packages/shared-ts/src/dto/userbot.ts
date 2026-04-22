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

export const UserbotDashboardSummaryDto = z.object({
  channelsTotal: z.number().int().nonnegative(),
  channelsEnabled: z.number().int().nonnegative(),
  cabinetsTotal: z.number().int().nonnegative(),
  cabinetsEnabled: z.number().int().nonnegative(),
  ingestToday: z.number().int().nonnegative(),
  classifiedToday: z.number().int().nonnegative(),
  signalsReadyToday: z.number().int().nonnegative(),
  signalsFannedOutToday: z.number().int().nonnegative(),
});
export type UserbotDashboardSummaryDto = z.infer<typeof UserbotDashboardSummaryDto>;

export const UserbotCabinetUsageDto = z.object({
  cabinetId: z.string(),
  cabinetSlug: z.string(),
  cabinetDisplayName: z.string(),
  cabinetEnabled: z.boolean(),
  activeFilters: z.number().int().nonnegative(),
  totalFilters: z.number().int().nonnegative(),
});
export type UserbotCabinetUsageDto = z.infer<typeof UserbotCabinetUsageDto>;

export const UserbotRecentEventDto = z.object({
  id: z.string(),
  chatId: z.string(),
  chatTitle: z.string().nullable(),
  messageId: z.string(),
  text: z.string().nullable(),
  status: z.string(),
  classification: z.string().nullable(),
  createdAt: z.string(),
  draftStatus: z.string().nullable(),
});
export type UserbotRecentEventDto = z.infer<typeof UserbotRecentEventDto>;

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

export const UserbotRecentEventsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export type UserbotRecentEventsQueryDto = z.infer<typeof UserbotRecentEventsQueryDto>;
