import { redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';
import { TradesList } from './trades-list';

export const dynamic = 'force-dynamic';

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

export default async function TradesPage() {
  try {
    await apiFetch('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }
  const trades = await apiFetch<Trade[]>('/trades?limit=200');
  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Trades</h1>
        <TradesList initial={trades} />
      </div>
    </>
  );
}
