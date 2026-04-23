'use client';

import { useState } from 'react';

interface SpendResponse {
  days: number;
  totalUsd: number;
  generations: number;
  bySource: Array<{
    chatId: string | null;
    title: string | null;
    source: string | null;
    usd: number;
    generations: number;
  }>;
  timeline: Array<{ date: string; usd: number; generations: number }>;
}

interface BalanceResponse {
  totalCredits: number | null;
  totalUsage: number | null;
  remainingCredits: number | null;
}

function usd(value: number | null): string {
  if (value == null) return '—';
  return `$${value.toFixed(4)}`;
}

export function OpenrouterSpendPanel({
  initialSpend,
  initialBalance,
}: {
  initialSpend: SpendResponse;
  initialBalance: BalanceResponse;
}) {
  const [days, setDays] = useState(initialSpend.days);
  const [spend, setSpend] = useState(initialSpend);
  const [balance, setBalance] = useState(initialBalance);
  const [msg, setMsg] = useState<string | null>(null);

  async function refetch(nextDays: number) {
    setMsg(null);
    const [s, b] = await Promise.all([
      fetch(`/api/proxy/userbot/openrouter/spend?days=${nextDays}`, { cache: 'no-store' }).then((r) =>
        r.json(),
      ),
      fetch('/api/proxy/userbot/openrouter/balance', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    setSpend(s as SpendResponse);
    if (b) setBalance(b as BalanceResponse);
  }

  return (
    <>
      {msg && <div className="card">{msg}</div>}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>Summary</h2>
            <p style={{ color: 'var(--fg-dim)' }}>
              Filters can reduce this cost, but AI fallback remains active if no filter matches.
            </p>
          </div>
          <div className="row">
            <select
              value={days}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDays(next);
                void refetch(next);
              }}
            >
              <option value={7}>7d</option>
              <option value={30}>30d</option>
              <option value={90}>90d</option>
            </select>
          </div>
        </div>
        <div className="grid">
          <div className="card">
            <h3>Total spend</h3>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{usd(spend.totalUsd)}</div>
          </div>
          <div className="card">
            <h3>Generations</h3>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{spend.generations}</div>
          </div>
          <div className="card">
            <h3>Credits total</h3>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{usd(balance.totalCredits)}</div>
          </div>
          <div className="card">
            <h3>Credits left</h3>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{usd(balance.remainingCredits)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>By source</h2>
        {spend.bySource.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>No resolved generations for selected window.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Generations</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {spend.bySource.map((row, i) => (
                <tr key={`${row.chatId}:${i}`}>
                  <td>{row.title ?? row.chatId ?? '—'}</td>
                  <td>{row.source ?? '—'}</td>
                  <td>{row.generations}</td>
                  <td>{usd(row.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Daily timeline</h2>
        {spend.timeline.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>No daily points.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Generations</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {spend.timeline.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.generations}</td>
                  <td>{usd(row.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
