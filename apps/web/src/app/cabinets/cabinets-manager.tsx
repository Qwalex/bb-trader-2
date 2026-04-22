'use client';

import { useState } from 'react';

interface Cabinet {
  id: string;
  slug: string;
  displayName: string;
  network: 'mainnet' | 'testnet';
  enabled: boolean;
  hasBybitKey: boolean;
  bybitKeyVerifiedAt: string | null;
  bybitKeyLastError: string | null;
  createdAt: string;
}

export function CabinetsManager({ initial }: { initial: Cabinet[] }) {
  const [cabinets, setCabinets] = useState<Cabinet[]>(initial);
  const [creating, setCreating] = useState(false);
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    const res = await fetch('/api/proxy/cabinets', { cache: 'no-store' });
    if (res.ok) setCabinets(await res.json());
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/proxy/cabinets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, displayName, network }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setSlug('');
    setDisplayName('');
    setCreating(false);
    await refetch();
  }

  async function onDelete(id: string) {
    if (!confirm('Удалить кабинет? Это действие необратимо.')) return;
    const res = await fetch(`/api/proxy/cabinets/${id}`, { method: 'DELETE' });
    if (res.ok) await refetch();
  }

  async function onToggle(c: Cabinet) {
    await fetch(`/api/proxy/cabinets/${c.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    await refetch();
  }

  return (
    <>
      <div className="card">
        {!creating ? (
          <button onClick={() => setCreating(true)}>+ Новый кабинет</button>
        ) : (
          <form onSubmit={onCreate} className="col">
            <label>
              Slug (латиница, уникален)
              <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
            </label>
            <label>
              Отображаемое имя
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
            <label>
              Сеть
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value as 'mainnet' | 'testnet')}
              >
                <option value="testnet">testnet</option>
                <option value="mainnet">mainnet</option>
              </select>
            </label>
            <div className="row">
              <button type="submit">Создать</button>
              <button type="button" className="ghost" onClick={() => setCreating(false)}>
                Отмена
              </button>
            </div>
            {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          </form>
        )}
      </div>

      {cabinets.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--fg-dim)' }}>Пока нет кабинетов.</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Slug</th>
                <th>Сеть</th>
                <th>Включён</th>
                <th>Bybit ключ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cabinets.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={`/cabinets/${c.id}`}>{c.displayName}</a>
                  </td>
                  <td>
                    <code>{c.slug}</code>
                  </td>
                  <td>{c.network}</td>
                  <td>
                    <button className="ghost" onClick={() => onToggle(c)}>
                      {c.enabled ? 'on' : 'off'}
                    </button>
                  </td>
                  <td>
                    {!c.hasBybitKey && <span className="badge">не задан</span>}
                    {c.hasBybitKey && c.bybitKeyVerifiedAt && <span className="badge ok">OK</span>}
                    {c.hasBybitKey && !c.bybitKeyVerifiedAt && c.bybitKeyLastError && (
                      <span className="badge err" title={c.bybitKeyLastError}>
                        ошибка
                      </span>
                    )}
                    {c.hasBybitKey && !c.bybitKeyVerifiedAt && !c.bybitKeyLastError && (
                      <span className="badge">ожидает</span>
                    )}
                  </td>
                  <td>
                    <button className="danger" onClick={() => onDelete(c.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
