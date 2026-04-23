/**
 * Вытаскивает торговые поля сигнала из сообщения через OpenRouter.
 *
 * MVP: минимальный промпт; полная версия с динамическим system prompt,
 * partial-signal нормализацией и fallback-моделью — портировать из
 * bb-trader/apps/api/src/modules/transcript/transcript.service.ts.
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { OpenRouterClient } from './openrouter.js';

const ExtractedSignal = z.object({
  pair: z
    .string()
    .min(1)
    .transform((s) => s.toUpperCase().replace(/USDT$/i, '') + 'USDT')
    .refine((s) => /^[A-Z0-9]{3,20}USDT$/.test(s), 'bad pair'),
  direction: z.enum(['BUY', 'SELL']),
  entries: z.array(z.number().finite().positive()).min(1).max(10),
  entryIsRange: z.boolean().default(false),
  stopLoss: z.number().finite().positive(),
  takeProfits: z.array(z.number().finite().positive()).min(1).max(10),
  leverage: z.number().int().positive().max(125),
});

export type ExtractedSignal = z.infer<typeof ExtractedSignal>;

export interface ExtractResult {
  signal: ExtractedSignal;
  signalHash: string;
  aiRequest: string;
  aiResponse: string;
  generationId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

const SYSTEM_PROMPT = `Ты — парсер торговых сигналов с криптовалютных Telegram-каналов.
Твоя задача — выделить параметры сделки из сообщения и вернуть ЧИСТЫЙ JSON (без комментариев, без markdown).
Обязательные поля:
  pair (строка, например BTC или BTCUSDT),
  direction ("BUY" или "SELL"; иногда называется LONG/SHORT),
  entries (массив чисел; если указана зона — [low, high] и entryIsRange=true),
  entryIsRange (boolean),
  stopLoss (число),
  takeProfits (массив чисел в порядке появления),
  leverage (целое число; если не указано — используй 10).
Если это не торговый сигнал — верни {"not_signal": true}.
Если некоторые поля не указаны, сделай разумную нормализацию:
- leverage по умолчанию 10
- direction LONG -> BUY, SHORT -> SELL
- pair без суффикса трактуется как ...USDT
Верни только JSON, без markdown.`;

export async function extractSignal(
  openrouter: OpenRouterClient,
  message: string,
  options: { fallbackModel?: string } = {},
): Promise<
  | { kind: 'signal'; data: ExtractResult }
  | {
      kind: 'not_signal';
      reason: string;
      generationId: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
    }
> {
  const primaryResult = await openrouter.chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message },
    ],
    { temperature: 0 },
  );
  const parsedPrimary = parseExtractResult(primaryResult, message);
  if (parsedPrimary.kind === 'signal' || !options.fallbackModel) {
    return parsedPrimary;
  }
  const fallbackResult = await openrouter.chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message },
    ],
    { temperature: 0, model: options.fallbackModel },
  );
  return parseExtractResult(fallbackResult, message);
}

function parseExtractResult(
  result: { content: string; generationId: string | null; inputTokens: number | null; outputTokens: number | null },
  message: string,
):
  | { kind: 'signal'; data: ExtractResult }
  | {
      kind: 'not_signal';
      reason: string;
      generationId: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
    } {
  const jsonText = extractJsonFromContent(result.content);
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(jsonText);
  } catch {
    return {
      kind: 'not_signal',
      reason: 'OpenRouter returned non-JSON content',
      generationId: result.generationId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  if (typeof parsedRaw === 'object' && parsedRaw !== null) {
    const obj = parsedRaw as Record<string, unknown>;
    if (obj.not_signal === true || obj.notSignal === true) {
      return {
        kind: 'not_signal',
        reason: 'LLM declared not a signal',
        generationId: result.generationId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    }
  }

  const validated = ExtractedSignal.safeParse(parsedRaw);
  if (!validated.success) {
    return {
      kind: 'not_signal',
      reason: `schema mismatch: ${validated.error.issues.map((i) => i.path.join('.')).join(',')}`,
      generationId: result.generationId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  return {
    kind: 'signal',
    data: {
      signal: validated.data,
      signalHash: hashSignal(validated.data),
      aiRequest: message,
      aiResponse: result.content,
      generationId: result.generationId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
  };
}

function extractJsonFromContent(content: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1);
  }
  return content.trim();
}

function hashSignal(s: ExtractedSignal): string {
  const canon = JSON.stringify({
    pair: s.pair,
    direction: s.direction,
    entries: s.entries,
    sl: s.stopLoss,
    tps: s.takeProfits,
  });
  return createHash('sha256').update(canon).digest('hex').slice(0, 40);
}
