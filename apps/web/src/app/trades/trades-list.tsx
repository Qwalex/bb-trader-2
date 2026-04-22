'use client';

import { useState } from 'react';

interface TradeOrder {
  id: string;
  orderKind: string;
  side: string;
  status: string;
  price: number | null;
  qty: number | null;
  bybitOrderId: string | null;
}

interface Trade {
  id: string;
  pair: string;
  direction: string;
  status: string;
  leverage: number;
  orderUsd: number;
  realizedPnl: number | null;
  sourceChatId: string | null;
  createdAt: string;
  closedAt: string | null;
  orders: TradeOrder[];
}

export function TradesList({ initial }: { initial: Trade[] }) {
  const [trades, setTrades] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/proxy/trades?limit=200', { cache: 'no-store' });
    if (!res.ok) return;
    setTrades(await res.json());
  }

  async function removeTrade(id: string) {
    if (!confirm('Удалить сделку из истории (soft delete)?')) return;
    const res = await fetch(`/api/proxy/trades/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setMsg(`Ошибка удаления: ${await res.text()}`);
      return;
    }
    setMsg('Сделка удалена.');
    await refresh();
  }

  return (
    <div className="card">
      {msg && <p style={{ color: 'var(--accent)' }}>{msg}</p>}
      {trades.length === 0 ? (
        <p style={{ color: 'var(--fg-dim)' }}>Сделок пока нет.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Pair</th>
              <th>Side</th>
              <th>Status</th>
              <th>PnL</th>
              <th>Orders</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td>{trade.pair}</td>
                <td>{trade.direction}</td>
                <td>{trade.status}</td>
                <td>{trade.realizedPnl ?? '—'}</td>
                <td>{trade.orders.length}</td>
                <td>{new Date(trade.createdAt).toLocaleString()}</td>
                <td>
                  <button className="danger" onClick={() => void removeTrade(trade.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
