import { notFound, redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';
import { CabinetDetail } from './cabinet-detail';

export const dynamic = 'force-dynamic';

interface Cabinet {
  id: string;
  slug: string;
  displayName: string;
  network: 'mainnet' | 'testnet';
  enabled: boolean;
  hasBybitKey: boolean;
  bybitKeyVerifiedAt: string | null;
  bybitKeyLastError: string | null;
}

interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

interface ChannelFilter {
  id: string;
  cabinetId: string;
  userbotChannelId: string;
  chatId: string;
  title: string;
  enabled: boolean;
  defaultLeverage: number | null;
  forcedLeverage: number | null;
  defaultEntryUsd: string | null;
  minLotBump: boolean | null;
}

export default async function CabinetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await apiFetch('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }

  let cabinet: Cabinet | null = null;
  try {
    const list = await apiFetch<Cabinet[]>('/cabinets');
    cabinet = list.find((c) => c.id === id) ?? null;
  } catch {
    /* handled below */
  }
  if (!cabinet) notFound();

  const [settings, channelFilters] = await Promise.all([
    apiFetch<Setting[]>(`/cabinets/${id}/settings`),
    apiFetch<ChannelFilter[]>(`/cabinets/${id}/channel-filters`),
  ]);

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>
          {cabinet.displayName}{' '}
          <small style={{ color: 'var(--fg-dim)' }}>({cabinet.slug})</small>
        </h1>
        <CabinetDetail cabinet={cabinet} initialSettings={settings} initialChannelFilters={channelFilters} />
      </div>
    </>
  );
}
