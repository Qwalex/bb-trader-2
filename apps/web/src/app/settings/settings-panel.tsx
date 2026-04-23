'use client';

import Link from 'next/link';
import { useState } from 'react';

interface GlobalSetting {
  key: string;
  value: string;
}

const IMPORTANT_GLOBAL_KEYS = [
  'LLM_MODEL',
  'LLM_FALLBACK_MODEL',
  'OPENROUTER_API_KEY',
  'PUBLIC_SIGNUP_ENABLED',
] as const;

export function SettingsPanel({
  role,
  initialGlobalSettings,
}: {
  role: 'user' | 'admin';
  initialGlobalSettings: GlobalSetting[];
}) {
  const [settings, setSettings] = useState<GlobalSetting[]>(initialGlobalSettings);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveGlobalSetting(key: string, value: string) {
    const res = await fetch('/api/proxy/admin/global-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    setMsg(`Сохранено: ${key}`);
  }

  function getValue(key: string): string {
    return settings.find((row) => row.key === key)?.value ?? '';
  }

  function setValue(key: string, value: string) {
    setSettings((prev) => {
      const idx = prev.findIndex((row) => row.key === key);
      if (idx === -1) return [...prev, { key, value }];
      const next = [...prev];
      next[idx] = { key, value };
      return next;
    });
  }

  return (
    <>
      {msg && <div className="card">{msg}</div>}

      <div className="card">
        <h2>Trading scope</h2>
        <ul>
          <li>
            Account-level ingest/classifier settings and source management live on <Link href="/userbot">/userbot</Link>.
          </li>
          <li>
            Optional source filters for OpenRouter load control live on <Link href="/filters">/filters</Link>.
          </li>
          <li>
            Cabinet execution settings (leverage/order sizing) live inside each cabinet page.
          </li>
          <li>
            OpenRouter spend and balance dashboard lives on <Link href="/openrouter-spend">/openrouter-spend</Link>.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Key mapping</h2>
        <p style={{ color: 'var(--fg-dim)' }}>
          Legacy `ENTRY_USD` is now normalized as cabinet setting `DEFAULT_ORDER_USD`.
        </p>
      </div>

      {role === 'admin' && (
        <div className="card">
          <h2>Global ops settings</h2>
          <p style={{ color: 'var(--fg-dim)' }}>
            Affects all users/services. OpenRouter key can be configured here instead of env.
          </p>
          <div className="col">
            {IMPORTANT_GLOBAL_KEYS.map((key) => (
              <label key={key}>
                <strong>{key}</strong>
                <input value={getValue(key)} onChange={(e) => setValue(key, e.target.value)} />
                <div>
                  <button className="ghost" onClick={() => void saveGlobalSetting(key, getValue(key))}>
                    Save
                  </button>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
