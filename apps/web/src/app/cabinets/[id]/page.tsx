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
  hasCabinetBot: boolean;
  cabinetBotVerifiedAt: string | null;
  cabinetBotLastError: string | null;
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

interface CabinetBot {
  cabinetId: string;
  botUsername: string | null;
  signalChatId: string | null;
  logChatId: string | null;
  enabled: boolean;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
}

interface PublishGroup {
  id: string;
  cabinetId: string;
  title: string;
  chatId: string;
  enabled: boolean;
  publishEveryN: number;
  signalCounter: number;
  createdAt: string;
  updatedAt: string;
}

interface MirrorMessage {
  id: string;
  publishGroupId: string;
  ingestId: string;
  sourceChatId: string;
  sourceMessageId: string;
  kind: string;
  status: string;
  targetChatId: string;
  targetMessageId: string | null;
  error: string | null;
  createdAt: string;
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

  const [settings, channelFilters, cabinetBot, publishGroups, mirrorMessages] = await Promise.all([
    apiFetch<Setting[]>(`/cabinets/${id}/settings`),
    apiFetch<ChannelFilter[]>(`/cabinets/${id}/channel-filters`),
    apiFetch<CabinetBot | null>(`/cabinets/${id}/cabinet-bot`),
    apiFetch<PublishGroup[]>(`/cabinets/${id}/publish-groups`),
    apiFetch<MirrorMessage[]>(`/cabinets/${id}/mirror-messages?limit=100`),
  ]);

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>
          {cabinet.displayName}{' '}
          <small style={{ color: 'var(--fg-dim)' }}>({cabinet.slug})</small>
        </h1>
        <CabinetDetail
          cabinet={cabinet}
          initialSettings={settings}
          initialChannelFilters={channelFilters}
          initialCabinetBot={cabinetBot}
          initialPublishGroups={publishGroups}
          initialMirrorMessages={mirrorMessages}
        />
      </div>
    </>
  );
}
