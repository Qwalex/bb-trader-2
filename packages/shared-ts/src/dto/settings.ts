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

export const CabinetPublishGroupDto = z.object({
  id: z.string(),
  cabinetId: z.string(),
  title: z.string(),
  chatId: z.string(),
  enabled: z.boolean(),
  publishEveryN: z.number().int().positive(),
  signalCounter: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CabinetPublishGroupDto = z.infer<typeof CabinetPublishGroupDto>;

export const CreateCabinetPublishGroupDto = z.object({
  title: z.string().trim().min(1).max(200),
  chatId: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  publishEveryN: z.number().int().min(1).max(100).default(1),
});
export type CreateCabinetPublishGroupDto = z.infer<typeof CreateCabinetPublishGroupDto>;

export const UpdateCabinetPublishGroupDto = CreateCabinetPublishGroupDto.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'nothing to update' },
);
export type UpdateCabinetPublishGroupDto = z.infer<typeof UpdateCabinetPublishGroupDto>;

export const CabinetMirrorMessageDto = z.object({
  id: z.string(),
  publishGroupId: z.string(),
  ingestId: z.string(),
  sourceChatId: z.string(),
  sourceMessageId: z.string(),
  kind: z.string(),
  status: z.string(),
  targetChatId: z.string(),
  targetMessageId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type CabinetMirrorMessageDto = z.infer<typeof CabinetMirrorMessageDto>;
