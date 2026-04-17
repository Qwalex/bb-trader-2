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
  text: string | null;
  /** Есть ли у сообщения reply — важно для паттернов с requiresQuote. */
  hasReply: boolean;
}

export interface ClassifyResult {
  classification: Classification;
  matchedPatternId: string | null;
  matchedGroup: string | null;
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
    return { classification: 'ignore', matchedPatternId: null, matchedGroup: null };
  }

  const patterns = await prisma.tgUserbotFilterPattern.findMany({
    where: { enabled: true },
    select: {
      id: true,
      groupName: true,
      kind: true,
      pattern: true,
      requiresQuote: true,
    },
  });

  let best: ClassifyResult = {
    classification: 'ignore',
    matchedPatternId: null,
    matchedGroup: null,
  };
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
      best = { classification: kind, matchedPatternId: p.id, matchedGroup: p.groupName };
    }
  }

  return best;
}
