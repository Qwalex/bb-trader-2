import { redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';
import { AdminPanel } from './admin-panel';

export const dynamic = 'force-dynamic';

interface Me {
  role: 'user' | 'admin';
}

interface PipelineSummary {
  ingestCounts?: Array<{ status: string; _count: { _all: number } }>;
  commandCounts?: Array<{ status: string; _count: { _all: number } }>;
  recalcCounts?: Array<{ status: string; _count: { _all: number } }>;
  stuck: {
    ingestClassifying: number;
    userbotCommands: number;
    recalcJobs: number;
  };
  cabinetBot: {
    configuredBots: number;
    enabledBots: number;
    verifiedBots: number;
    failedDeliveries: number;
  };
  checkedAt: string;
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

  const [settings, logs, pipeline] = await Promise.all([
    apiFetch<Array<{ key: string; value: string }>>('/admin/global-settings'),
    apiFetch<Array<{ id: string; level: string; category: string; message: string; createdAt: string }>>(
      '/admin/logs?limit=200',
    ),
    apiFetch<PipelineSummary>('/admin/pipeline-summary'),
  ]);

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Admin</h1>
        <AdminPanel initialSettings={settings} initialLogs={logs} initialPipeline={pipeline} />
      </div>
    </>
  );
}
