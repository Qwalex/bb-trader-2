/**
 * OpenRouter клиент: только вызов chat/completions, никакого SDK (экономия памяти).
 *
 * Промпт-инжиниринг остаётся отдельно в classify.ts / signal-extract.ts. Здесь —
 * просто HTTP-вызов с таймаутом и минимальным retry на 5xx/429.
 */

import type { AppLogger } from './logger.js';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  logger: AppLogger;
}

export interface OpenRouterResult {
  content: string;
  generationId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export class OpenRouterClient {
  constructor(private readonly opts: OpenRouterOptions) {}

  async chat(
    messages: OpenRouterMessage[],
    overrides: { model?: string; temperature?: number } = {},
  ): Promise<OpenRouterResult> {
    const model = overrides.model ?? this.opts.model;
    const body = {
      model,
      messages,
      temperature: overrides.temperature ?? 0,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
          'HTTP-Referer': 'https://bb-trade-transformation',
          'X-Title': 'bb-classifier',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await safeText(response);
        throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
      }

      const json = (await response.json()) as {
        id?: string;
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const content = json.choices?.[0]?.message?.content ?? '';
      return {
        content,
        generationId: json.id ?? null,
        inputTokens: json.usage?.prompt_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
