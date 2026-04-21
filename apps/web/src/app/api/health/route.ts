import { NextResponse } from 'next/server';

/**
 * Публичный healthcheck для Railway. Не трогает api, не трогает DB —
 * просто подтверждает, что Next.js-процесс жив и способен обрабатывать
 * запросы. Должен отдавать 200 даже если api временно недоступен.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true, service: 'web', ts: new Date().toISOString() });
}
