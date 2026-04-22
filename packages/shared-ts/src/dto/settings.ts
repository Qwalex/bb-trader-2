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

export const CabinetTelegramBotDto = z.object({
  cabinetId: z.string(),
  botUsername: z.string().nullable(),
  signalChatId: z.string().nullable(),
  logChatId: z.string().nullable(),
  enabled: z.boolean(),
  lastVerifiedAt: z.string().nullable(),
  lastVerifyError: z.string().nullable(),
  lastInboundAt: z.string().nullable(),
  lastOutboundAt: z.string().nullable(),
});
export type CabinetTelegramBotDto = z.infer<typeof CabinetTelegramBotDto>;

export const UpsertCabinetTelegramBotDto = z
  .object({
    botToken: z.string().trim().min(1).optional(),
    signalChatId: z.string().trim().min(1).nullable().optional(),
    logChatId: z.string().trim().min(1).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      Object.values(v).some((x) => x !== undefined),
    { message: 'nothing to update' },
  );
export type UpsertCabinetTelegramBotDto = z.infer<typeof UpsertCabinetTelegramBotDto>;

export const VerifyCabinetTelegramBotDto = z.object({
  verifySignalChatId: z.boolean().default(true),
  verifyLogChatId: z.boolean().default(true),
});
export type VerifyCabinetTelegramBotDto = z.infer<typeof VerifyCabinetTelegramBotDto>;
