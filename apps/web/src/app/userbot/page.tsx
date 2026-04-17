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

export default async function UserbotPage() {
  try {
    await apiFetch('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }

  const [session, channels] = await Promise.all([
    apiFetch<Session>('/userbot/session'),
    apiFetch<Channel[]>('/userbot/channels'),
  ]);

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Telegram userbot</h1>
        <UserbotPanel initialSession={session} initialChannels={channels} />
      </div>
    </>
  );
}
