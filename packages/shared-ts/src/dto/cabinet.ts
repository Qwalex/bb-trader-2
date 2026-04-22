import { z } from 'zod';
import { BYBIT_NETWORKS } from '../enums.js';

export const CabinetDto = z.object({
  id: z.string(),
  slug: z.string(),
  displayName: z.string(),
  network: z.enum(BYBIT_NETWORKS),
  enabled: z.boolean(),
  hasBybitKey: z.boolean(),
  bybitKeyVerifiedAt: z.string().nullable(),
  bybitKeyLastError: z.string().nullable(),
  hasCabinetBot: z.boolean(),
  cabinetBotVerifiedAt: z.string().nullable(),
  cabinetBotLastError: z.string().nullable(),
  createdAt: z.string(),
});
export type CabinetDto = z.infer<typeof CabinetDto>;

export const CreateCabinetDto = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'only lowercase letters, digits and dashes'),
  displayName: z.string().min(1).max(120),
  network: z.enum(BYBIT_NETWORKS).default('mainnet'),
});
export type CreateCabinetDto = z.infer<typeof CreateCabinetDto>;

export const UpdateCabinetDto = z.object({
  displayName: z.string().min(1).max(120).optional(),
  network: z.enum(BYBIT_NETWORKS).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateCabinetDto = z.infer<typeof UpdateCabinetDto>;

export const UpsertBybitKeyDto = z
  .object({
    apiKeyMainnet: z.string().trim().min(0).nullable().optional(),
    apiSecretMainnet: z.string().trim().min(0).nullable().optional(),
    apiKeyTestnet: z.string().trim().min(0).nullable().optional(),
    apiSecretTestnet: z.string().trim().min(0).nullable().optional(),
    testnet: z.boolean().optional(),
  })
  .refine(
    (v) =>
      Object.values(v).some((x) => x !== undefined),
    { message: 'nothing to update' },
  );
export type UpsertBybitKeyDto = z.infer<typeof UpsertBybitKeyDto>;
