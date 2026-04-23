import { redirect } from 'next/navigation';
import { TopNav } from '@/components/nav';
import { apiFetch, type ApiError } from '@/lib/api';
import { OpenrouterSpendPanel } from './spend-panel';

export const dynamic = 'force-dynamic';

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

export default async function OpenrouterSpendPage() {
  try {
    await apiFetch('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }
  const [spend, balance] = await Promise.all([
    apiFetch<SpendResponse>('/userbot/openrouter/spend?days=30'),
    apiFetch<BalanceResponse>('/userbot/openrouter/balance').catch(() => ({
      totalCredits: null,
      totalUsage: null,
      remainingCredits: null,
    })),
  ]);

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>OpenRouter spend</h1>
        <OpenrouterSpendPanel initialSpend={spend} initialBalance={balance} />
      </div>
    </>
  );
}
