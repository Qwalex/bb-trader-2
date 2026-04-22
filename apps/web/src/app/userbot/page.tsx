import { redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';
import { UserbotPanel } from './userbot-panel';

export const dynamic = 'force-dynamic';

interface Session {
  userId: string;
  phone: string | null;
  status: string;
  lastSeenAt: string | null;
  lastError: string | null;
  hasSession: boolean;
}

interface Channel {
  id: string;
  chatId: string;
  title: string;
  username: string | null;
  enabled: boolean;
  sourcePriority: number;
}

interface DashboardSummary {
  channelsTotal: number;
  channelsEnabled: number;
  cabinetsTotal: number;
  cabinetsEnabled: number;
  ingestToday: number;
  classifiedToday: number;
  signalsReadyToday: number;
  signalsFannedOutToday: number;
}

interface CabinetUsage {
  cabinetId: string;
  cabinetSlug: string;
  cabinetDisplayName: string;
  cabinetEnabled: boolean;
  activeFilters: number;
  totalFilters: number;
}

interface RecentEvent {
  id: string;
  chatId: string;
  chatTitle: string | null;
  messageId: string;
  text: string | null;
  status: string;
  classification: string | null;
  createdAt: string;
  draftStatus: string | null;
}

interface ActiveCabinetFilter {
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

interface CurrentUser {
  id: string;
  activeCabinetId: string | null;
}

export default async function UserbotPage() {
  let me: CurrentUser;
  try {
    me = await apiFetch<CurrentUser>('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }

  const [session, channels, summary, cabinetUsage, recentEvents] = await Promise.all([
    apiFetch<Session>('/userbot/session'),
    apiFetch<Channel[]>('/userbot/channels'),
    apiFetch<DashboardSummary>('/userbot/dashboard/summary'),
    apiFetch<CabinetUsage[]>('/userbot/dashboard/cabinets'),
    apiFetch<RecentEvent[]>('/userbot/events/recent?limit=40'),
  ]);
  const activeCabinetFilters =
    me.activeCabinetId == null
      ? []
      : await apiFetch<ActiveCabinetFilter[]>(`/cabinets/${me.activeCabinetId}/channel-filters`).catch(
          () => [],
        );

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Telegram userbot</h1>
        <p style={{ color: 'var(--fg-dim)' }}>
          Этот userbot общий для аккаунта: читает подключённые источники и передаёт сигналы в pipeline.
          Отдельный cabinet bot настраивается внутри каждого кабинета.
        </p>
        <UserbotPanel
          initialSession={session}
          initialChannels={channels}
          initialSummary={summary}
          initialCabinetUsage={cabinetUsage}
          initialRecentEvents={recentEvents}
          activeCabinetId={me.activeCabinetId}
          initialActiveCabinetFilters={activeCabinetFilters}
        />
      </div>
    </>
  );
}
