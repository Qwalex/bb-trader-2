import { redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';
import { DiagnosticsPanel } from './panel';

export const dynamic = 'force-dynamic';

interface Me {
  role: 'user' | 'admin';
}

interface DiagnosticRun {
  id: string;
  status: string;
  caseCount: number;
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export default async function DiagnosticsPage() {
  let me: Me;
  try {
    me = await apiFetch<Me>('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }
  if (me.role !== 'admin') redirect('/');
  const runs = await apiFetch<DiagnosticRun[]>('/admin/diagnostics/runs?limit=50');
  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Diagnostics</h1>
        <DiagnosticsPanel initialRuns={runs} />
      </div>
    </>
  );
}
