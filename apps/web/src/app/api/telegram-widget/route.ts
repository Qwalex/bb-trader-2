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

  let body = await upstream.text();
  body = patchSelfHostedWidgetOrigin(body);
  const contentType =
    upstream.headers.get('content-type') || 'application/javascript; charset=utf-8';
  return { body, contentType };
}

/**
 * Если `telegram-widget.js` отдаётся с нашего домена, `getWidgetsOrigin` в апстриме
 * берёт origin из `document.currentScript.src` и строит iframe как `/embed/Bot` на **этом**
 * домене → 404. Принудительно используем `default_origin` (oauth.telegram.org / t.me),
 * когда скрипт не с официальных хостов Telegram.
 */
function patchSelfHostedWidgetOrigin(js: string): string {
  const needle = `    } else if (origin == 'https://telegram-js.azureedge.net' || origin == 'https://tg.dev') {
      origin = dev_origin;
    }
    return origin;`;
  const replacement = `    } else if (origin == 'https://telegram-js.azureedge.net' || origin == 'https://tg.dev') {
      origin = dev_origin;
    } else if (origin != 'https://oauth.telegram.org' && origin != 'https://oauth.tg.dev') {
      origin = default_origin;
    }
    return origin;`;
  if (!js.includes(needle)) {
    return js;
  }
  return js.replace(needle, replacement);
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
