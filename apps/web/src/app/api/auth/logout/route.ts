import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const INTERNAL_API = process.env.API_INTERNAL_URL || 'http://localhost:3001';

export async function POST() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const upstream = await fetch(`${INTERNAL_API}/auth/logout`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
  });
  const res = NextResponse.json({ ok: upstream.ok }, { status: upstream.status });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) res.headers.set('set-cookie', setCookie);
  return res;
}
