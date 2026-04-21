import { cookies } from 'next/headers';

/**
 * Server-side API client. Never call from client components — вся
 * коммуникация идёт через Next.js route handlers / server actions,
 * чтобы куки-сессия не утекала в браузер.
 */
const INTERNAL_API = process.env.API_INTERNAL_URL || 'http://localhost:3001';

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${INTERNAL_API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const error: ApiError = {
      status: res.status,
      message: res.statusText,
      details: body,
    };
    throw error;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function isAuthed(): Promise<boolean> {
  try {
    await apiFetch('/auth/me');
    return true;
  } catch {
    // Любая ошибка (401, 5xx, ECONNREFUSED пока api не поднялся) трактуется
    // как «пользователь не залогинен» — страница отрисует экран логина,
    // а не упадёт с 500. Это важно и для Railway healthcheck, и для
    // плавного старта, когда web поднимается раньше api.
    return false;
  }
}
