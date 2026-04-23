import { redirect } from 'next/navigation';
import { TopNav } from '@/components/nav';
import { apiFetch, type ApiError } from '@/lib/api';
import { SettingsPanel } from './settings-panel';

export const dynamic = 'force-dynamic';

interface Me {
  id: string;
  role: 'user' | 'admin';
}

interface GlobalSetting {
  key: string;
  value: string;
}

export default async function SettingsPage() {
  let me: Me;
  try {
    me = await apiFetch<Me>('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }
  const globalSettings =
    me.role === 'admin'
      ? await apiFetch<GlobalSetting[]>('/admin/global-settings').catch(() => [])
      : [];
  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Settings</h1>
        <SettingsPanel role={me.role} initialGlobalSettings={globalSettings} />
      </div>
    </>
  );
}
