import { redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';

export const dynamic = 'force-dynamic';

interface Me {
  role: 'user' | 'admin';
}

export default async function AdminPage() {
  let me: Me;
  try {
    me = await apiFetch<Me>('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }
  if (me.role !== 'admin') redirect('/');

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Admin</h1>
        <div className="card">
          <h2>Глобальные настройки</h2>
          <p style={{ color: 'var(--fg-dim)' }}>
            PUBLIC_SIGNUP_ENABLED, фильтры паттернов, диагностические запуски —
            TODO. Сейчас все admin-операции выполняются через прямые SQL-команды
            или API (`/admin/*`) endpoints (см. apps/api).
          </p>
        </div>
      </div>
    </>
  );
}
