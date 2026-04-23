import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { LogoutButton } from './logout-button';

interface Me {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  displayName: string | null;
  role: 'user' | 'admin';
  activeCabinetId: string | null;
}

export async function TopNav() {
  let me: Me | null = null;
  try {
    me = await apiFetch<Me>('/auth/me');
  } catch {
    /* not logged in */
  }

  const brand = process.env.NEXT_PUBLIC_BRAND_NAME || 'bb-trader';

  return (
    <nav className="top">
      <Link href="/" className="brand">
        {brand}
      </Link>
      {me && (
        <>
          <Link href="/">Dashboard</Link>
          <Link href="/cabinets">Кабинеты</Link>
          <Link href="/userbot">Userbot</Link>
          {me.role === 'admin' && <Link href="/filters">Filters</Link>}
          <Link href="/openrouter-spend">OpenRouter</Link>
          <Link href="/settings">Settings</Link>
          {me.role === 'admin' && <Link href="/diagnostics">Diagnostics</Link>}
          <Link href="/trades">Trades</Link>
          {me.role === 'admin' && <Link href="/admin">Admin</Link>}
          <span className="spacer" />
          <span style={{ color: 'var(--fg-dim)' }}>
            {me.displayName || me.telegramUsername || me.telegramUserId}
            {me.role === 'admin' && <span className="badge ok" style={{ marginLeft: 8 }}>admin</span>}
          </span>
          <LogoutButton />
        </>
      )}
    </nav>
  );
}
