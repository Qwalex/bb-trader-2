import { redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';
import { FiltersPanel } from './filters-panel';

export const dynamic = 'force-dynamic';

interface FilterPattern {
  id: string;
  groupName: string;
  kind: 'signal' | 'close' | 'result' | 'reentry' | 'ignore';
  pattern: string;
  requiresQuote: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FilterExample {
  id: string;
  groupName: string;
  kind: 'signal' | 'close' | 'result' | 'reentry' | 'ignore';
  example: string;
  requiresQuote: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export default async function FiltersPage() {
  let me: { role?: 'user' | 'admin' } | null = null;
  try {
    me = await apiFetch<{ role: 'user' | 'admin' }>('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }
  if (me?.role !== 'admin') redirect('/');

  let groups: string[] = [];
  let patterns: FilterPattern[] = [];
  let examples: FilterExample[] = [];
  try {
    [groups, patterns, examples] = await Promise.all([
      apiFetch<string[]>('/filters/groups'),
      apiFetch<FilterPattern[]>('/filters/patterns'),
      apiFetch<FilterExample[]>('/filters/examples'),
    ]);
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401 || err.status === 403) redirect('/');
    throw e;
  }
  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Source filters</h1>
        <p style={{ color: 'var(--fg-dim)' }}>
          Фильтры опциональны: они снижают нагрузку на OpenRouter. Если фильтр не сработал, AI всё
          равно должен разобрать сигнал.
        </p>
        <FiltersPanel initialGroups={groups} initialPatterns={patterns} initialExamples={examples} />
      </div>
    </>
  );
}
