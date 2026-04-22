import type { PrismaClient } from '@repo/shared-prisma';
import type { AppLogger } from './logger.js';
import type { OpenRouterClient } from './openrouter.js';

interface DiagnosticsPayload {
  runId: string;
  models: string[];
  caseIds?: string[];
}

interface DiagnosticsDeps {
  prisma: PrismaClient;
  logger: AppLogger;
  openrouter: OpenRouterClient;
}

export async function handleDiagnosticsRun(
  deps: DiagnosticsDeps,
  payload: DiagnosticsPayload,
): Promise<void> {
  const { prisma, logger, openrouter } = deps;
  await prisma.diagnosticRun.update({
    where: { id: payload.runId },
    data: { status: 'running', startedAt: new Date(), modelsJson: JSON.stringify(payload.models) },
  });
  const cases = payload.caseIds?.length
    ? await prisma.ingestEvent.findMany({
        where: { id: { in: payload.caseIds } },
        select: { id: true, chatId: true, messageId: true, text: true },
      })
    : await prisma.ingestEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, chatId: true, messageId: true, text: true },
      });

  let caseCount = 0;
  for (const sourceCase of cases) {
    const diagCase = await prisma.diagnosticCase.create({
      data: {
        runId: payload.runId,
        ingestId: sourceCase.id,
        chatId: sourceCase.chatId,
        messageId: sourceCase.messageId,
        title: sourceCase.text?.slice(0, 80) ?? `case-${sourceCase.id}`,
        status: 'pending',
        traceJson: JSON.stringify({ sourceIngestId: sourceCase.id }),
      },
    });
    caseCount += 1;
    for (const model of payload.models) {
      try {
        const result = await openrouter.chat(
          [
            {
              role: 'system',
              content:
                'Classify if this message likely contains a trade signal. Return compact JSON: {"classification":"signal|close|result|reentry|ignore","confidence":0..1}.',
            },
            {
              role: 'user',
              content: sourceCase.text ?? '',
            },
          ],
          { model, temperature: 0 },
        );
        await prisma.diagnosticModelResult.upsert({
          where: {
            runId_caseId_model: {
              runId: payload.runId,
              caseId: diagCase.id,
              model,
            },
          },
          create: {
            runId: payload.runId,
            caseId: diagCase.id,
            model,
            status: 'completed',
            summary: result.content.slice(0, 2000),
            rawResponse: result.content,
            inputTokens: result.inputTokens ?? null,
            outputTokens: result.outputTokens ?? null,
            totalTokens:
              (result.inputTokens ?? 0) + (result.outputTokens ?? 0) > 0
                ? (result.inputTokens ?? 0) + (result.outputTokens ?? 0)
                : null,
          },
          update: {
            status: 'completed',
            summary: result.content.slice(0, 2000),
            rawResponse: result.content,
            inputTokens: result.inputTokens ?? null,
            outputTokens: result.outputTokens ?? null,
            totalTokens:
              (result.inputTokens ?? 0) + (result.outputTokens ?? 0) > 0
                ? (result.inputTokens ?? 0) + (result.outputTokens ?? 0)
                : null,
          },
        });
      } catch (error) {
        await prisma.diagnosticModelResult.upsert({
          where: {
            runId_caseId_model: {
              runId: payload.runId,
              caseId: diagCase.id,
              model,
            },
          },
          create: {
            runId: payload.runId,
            caseId: diagCase.id,
            model,
            status: 'failed',
            summary: error instanceof Error ? error.message : String(error),
          },
          update: {
            status: 'failed',
            summary: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    await prisma.diagnosticCase.update({
      where: { id: diagCase.id },
      data: { status: 'completed' },
    });
  }

  await prisma.diagnosticRun.update({
    where: { id: payload.runId },
    data: {
      status: 'completed',
      caseCount,
      summary: `Processed ${caseCount} cases with ${payload.models.length} models`,
      finishedAt: new Date(),
    },
  });
  logger.info({ runId: payload.runId, caseCount }, 'classifier.diagnostics.completed');
}
