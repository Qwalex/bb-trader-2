import { NextResponse } from 'next/server';

/**
 * Проксирует Telegram Login payload в API. API валидирует HMAC, создаёт
 * сессию и ставит `Set-Cookie`. Мы пробрасываем Set-Cookie обратно клиенту,
 * чтобы браузер сохранил bb_session.
 */
const INTERNAL_API = process.env.API_INTERNAL_URL || 'http://localhost:3001';

export async function POST(req: Request) {
  const body = await req.text();
  const upstream = await fetch(`${INTERNAL_API}/auth/telegram-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  const data = await upstream.text();
  const res = new NextResponse(data, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) res.headers.set('set-cookie', setCookie);
  return res;
}
