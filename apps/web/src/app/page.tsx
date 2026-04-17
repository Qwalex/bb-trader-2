import { redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';
import { CabinetSelector } from '@/components/cabinet-selector';

export const dynamic = 'force-dynamic';

interface Summary {
  activeCabinetId: string | null;
  signalsCount: number;
  openSignalsCount: number;
  balance: { totalUsd: string; at: string } | null;
}

interface RecentSignal {
  id: string;
  pair: string;
  direction: string;
  status: string;
  realizedPnl: string | null;
  createdAt: string;
  closedAt: string | null;
}

interface Cabinet {
  id: string;
  slug: string;
  displayName: string;
  enabled: boolean;
}

export default async function HomePage() {
  try {
    await apiFetch('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }

  const cabinets = await apiFetch<Cabinet[]>('/cabinets');
  const summary = await apiFetch<Summary>('/dashboard/summary');
  const recent = summary.activeCabinetId
    ? await apiFetch<RecentSignal[]>('/dashboard/signals?limit=20')
    : [];

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Dashboard</h1>

        <div className="card">
          <h2>Активный кабинет</h2>
          <CabinetSelector cabinets={cabinets} activeId={summary.activeCabinetId} />
        </div>

        {summary.activeCabinetId ? (
          <>
            <div className="grid">
              <div className="card">
                <h2>Всего сигналов</h2>
                <div style={{ fontSize: 24 }}>{summary.signalsCount}</div>
              </div>
              <div className="card">
                <h2>Открыто</h2>
                <div style={{ fontSize: 24 }}>{summary.openSignalsCount}</div>
              </div>
              <div className="card">
                <h2>Баланс (USDT)</h2>
                <div style={{ fontSize: 24 }}>
                  {summary.balance ? summary.balance.totalUsd : '—'}
                </div>
                {summary.balance && (
                  <small style={{ color: 'var(--fg-dim)' }}>
                    снято {new Date(summary.balance.at).toLocaleString()}
                  </small>
                )}
              </div>
            </div>

            <div className="card">
              <h2>Последние сигналы</h2>
              {recent.length === 0 ? (
                <p style={{ color: 'var(--fg-dim)' }}>Пока ничего нет.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Пара</th>
                      <th>Сторона</th>
                      <th>Статус</th>
                      <th>PnL</th>
                      <th>Создан</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((s) => (
                      <tr key={s.id}>
                        <td>{s.pair}</td>
                        <td>{s.direction}</td>
                        <td>
                          <span className="badge">{s.status}</span>
                        </td>
                        <td>{s.realizedPnl ?? '—'}</td>
                        <td>{new Date(s.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div className="card">
            <p>
              Нет активного кабинета. Создайте его в разделе{' '}
              <a href="/cabinets">Кабинеты</a>.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
