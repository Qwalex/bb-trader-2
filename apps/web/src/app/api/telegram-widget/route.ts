import { NextResponse } from 'next/server';

/** Официальный URL виджета; не принимаем произвольные URL из запроса (не open proxy). */
const UPSTREAM = 'https://telegram.org/js/telegram-widget.js?22';

const CACHE_TTL_MS = 86_400_000; // 24h

let memoryCache: { body: string; contentType: string; fetchedAt: number } | null = null;

async function loadFromUpstream(): Promise<{ body: string; contentType: string }> {
  const upstream = await fetch(UPSTREAM, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; bb-trade-web/telegram-widget-proxy)',
    },
  });

  if (!upstream.ok) {
    throw new Error(`upstream ${upstream.status}`);
  }

  const body = await upstream.text();
  const contentType =
    upstream.headers.get('content-type') || 'application/javascript; charset=utf-8';
  return { body, contentType };
}

/**
 * Отдаёт `telegram-widget.js` с вашего домена: браузер в заблокированной сети
 * не ходит на telegram.org за скриптом (сервер деплоя должен до upstream достучаться).
 */
export async function GET() {
  try {
    const now = Date.now();
    if (memoryCache && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
      return new NextResponse(memoryCache.body, {
        status: 200,
        headers: {
          'content-type': memoryCache.contentType,
          'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
        },
      });
    }

    const { body, contentType } = await loadFromUpstream();
    memoryCache = { body, contentType, fetchedAt: now };

    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new NextResponse('Telegram widget script unavailable', { status: 502 });
  }
}
