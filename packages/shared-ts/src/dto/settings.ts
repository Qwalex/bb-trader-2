import { z } from 'zod';

export const CabinetSettingDto = z.object({
  key: z.string(),
  value: z.string(),
  updatedAt: z.string(),
});
export type CabinetSettingDto = z.infer<typeof CabinetSettingDto>;

export const UpdateSettingsDto = z.object({
  values: z.record(z.string(), z.string()),
});
export type UpdateSettingsDto = z.infer<typeof UpdateSettingsDto>;

export const CabinetChannelFilterDto = z.object({
  id: z.string(),
  cabinetId: z.string(),
  userbotChannelId: z.string(),
  chatId: z.string(),
  title: z.string(),
  enabled: z.boolean(),
  defaultLeverage: z.number().int().nullable(),
  forcedLeverage: z.number().int().nullable(),
  defaultEntryUsd: z.string().nullable(),
  minLotBump: z.boolean().nullable(),
});
export type CabinetChannelFilterDto = z.infer<typeof CabinetChannelFilterDto>;

export const UpdateCabinetChannelFilterDto = z.object({
  enabled: z.boolean().optional(),
  defaultLeverage: z.number().int().min(1).max(125).nullable().optional(),
  forcedLeverage: z.number().int().min(1).max(125).nullable().optional(),
  defaultEntryUsd: z.string().nullable().optional(),
  minLotBump: z.boolean().nullable().optional(),
});
export type UpdateCabinetChannelFilterDto = z.infer<typeof UpdateCabinetChannelFilterDto>;
