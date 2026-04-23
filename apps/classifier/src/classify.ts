/**
 * Определение типа сообщения (signal / close / result / reentry / ignore) на основе
 * глобальной таблицы `TgUserbotFilterPattern`. Быстрый локальный matcher — до OpenRouter.
 *
 * Портирован упрощённо с bb-trader/apps/api/src/modules/telegram-userbot/*filter*. Полные
 * правила groupName/kind — в БД (таблица seed'ится в production cut-over через SQL-скрипт из bb-trader).
 */

import type { Classification } from '@repo/shared-ts';
import type { PrismaClient } from '@repo/shared-prisma';

export interface ClassifyInput {
  userId: string;
  chatId: string;
  text: string | null;
  /** Есть ли у сообщения reply — важно для паттернов с requiresQuote. */
  hasReply: boolean;
}

export interface ClassifyResult {
  /**
   * null = локальные фильтры не сработали -> нужно идти в AI parsing path.
   * ignore/close/result/reentry/signal = явное локальное решение.
   */
  classification: Classification | null;
  matchedPatternId: string | null;
  matchedGroup: string | null;
  matchedBy: 'pattern' | 'example' | null;
}

const KIND_PRIORITY: Record<string, number> = {
  ignore: 0,
  reentry: 1,
  close: 2,
  result: 3,
  signal: 4,
};

export async function classifyByPatterns(
  prisma: PrismaClient,
  input: ClassifyInput,
): Promise<ClassifyResult> {
  if (!input.text || !input.text.trim()) {
    return {
      classification: 'ignore',
      matchedPatternId: null,
      matchedGroup: null,
      matchedBy: null,
    };
  }

  const channel = await prisma.userbotChannel.findFirst({
    where: { userId: input.userId, chatId: input.chatId },
    select: { title: true },
  });
  const targetGroups = new Set<string>([input.chatId.trim().toLowerCase()]);
  if (channel?.title?.trim()) targetGroups.add(channel.title.trim().toLowerCase());

  const [patternsRaw, examplesRaw] = await Promise.all([
    prisma.tgUserbotFilterPattern.findMany({
      where: { enabled: true },
      select: {
        id: true,
        groupName: true,
        kind: true,
        pattern: true,
        requiresQuote: true,
      },
    }),
    prisma.tgUserbotFilterExample.findMany({
      where: { enabled: true },
      select: {
        groupName: true,
        kind: true,
        example: true,
        requiresQuote: true,
      },
    }),
  ]);
  const patterns = patternsRaw.filter((p) => targetGroups.has(p.groupName.trim().toLowerCase()));
  const examples = examplesRaw.filter((ex) => targetGroups.has(ex.groupName.trim().toLowerCase()));

  let best: ClassifyResult | null = null;
  let bestPriority = -1;

  for (const p of patterns) {
    if (p.requiresQuote && !input.hasReply) continue;
    let regex: RegExp;
    try {
      regex = new RegExp(p.pattern, 'imu');
    } catch {
      continue;
    }
    if (!regex.test(input.text)) continue;

    const kind = p.kind as Classification;
    const priority = KIND_PRIORITY[kind] ?? -1;
    if (priority > bestPriority) {
      bestPriority = priority;
      best = {
        classification: kind,
        matchedPatternId: p.id,
        matchedGroup: p.groupName,
        matchedBy: 'pattern',
      };
    }
  }

  // Fallback: weak fuzzy match by examples (legacy behavior).
  if (bestPriority < 0) {
    for (const ex of examples) {
      if (ex.requiresQuote && !input.hasReply) continue;
      const score = overlapScore(input.text, ex.example);
      if (score < 0.34) continue;
      const kind = ex.kind as Classification;
      const priority = KIND_PRIORITY[kind] ?? -1;
      if (priority > bestPriority) {
        bestPriority = priority;
        best = {
          classification: kind,
          matchedPatternId: null,
          matchedGroup: ex.groupName,
          matchedBy: 'example',
        };
      }
    }
  }

  if (best) return best;
  return {
    classification: null,
    matchedPatternId: null,
    matchedGroup: null,
    matchedBy: null,
  };
}

function overlapScore(input: string, example: string): number {
  const left = tokenize(input);
  const right = tokenize(example);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-zа-я0-9_ ]/giu, ' ')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3),
  );
}
