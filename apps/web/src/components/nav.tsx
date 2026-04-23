'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogoutButton } from './logout-button';

interface Me {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  displayName: string | null;
  role: 'user' | 'admin';
  activeCabinetId: string | null;
}

export function TopNav() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/proxy/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Me;
      })
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
