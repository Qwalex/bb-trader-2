import { z } from 'zod';
import { CLASSIFICATIONS } from '../enums.js';

const FILTER_KINDS = CLASSIFICATIONS;

export const FilterPatternDto = z.object({
  id: z.string(),
  groupName: z.string(),
  kind: z.enum(FILTER_KINDS),
  pattern: z.string(),
  requiresQuote: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FilterPatternDto = z.infer<typeof FilterPatternDto>;

export const FilterExampleDto = z.object({
  id: z.string(),
  groupName: z.string(),
  kind: z.enum(FILTER_KINDS),
  example: z.string(),
  requiresQuote: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FilterExampleDto = z.infer<typeof FilterExampleDto>;

export const CreateFilterPatternDto = z.object({
  groupName: z.string().trim().min(1).max(120),
  kind: z.enum(FILTER_KINDS),
  pattern: z.string().trim().min(1).max(1000),
  requiresQuote: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export type CreateFilterPatternDto = z.infer<typeof CreateFilterPatternDto>;

export const UpdateFilterPatternDto = CreateFilterPatternDto.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'nothing to update' },
);
export type UpdateFilterPatternDto = z.infer<typeof UpdateFilterPatternDto>;

export const CreateFilterExampleDto = z.object({
  groupName: z.string().trim().min(1).max(120),
  kind: z.enum(FILTER_KINDS),
  example: z.string().trim().min(1).max(4000),
  requiresQuote: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export type CreateFilterExampleDto = z.infer<typeof CreateFilterExampleDto>;

export const UpdateFilterExampleDto = CreateFilterExampleDto.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'nothing to update' },
);
export type UpdateFilterExampleDto = z.infer<typeof UpdateFilterExampleDto>;

export const GenerateFilterPatternDto = z.object({
  groupName: z.string().trim().min(1).max(120),
  kind: z.enum(FILTER_KINDS),
  example: z.string().trim().min(1).max(4000),
  requiresQuote: z.boolean().default(false),
});
export type GenerateFilterPatternDto = z.infer<typeof GenerateFilterPatternDto>;
