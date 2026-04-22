'use client';

import { useState } from 'react';

interface Cabinet {
  id: string;
  slug: string;
  network: 'mainnet' | 'testnet';
  hasBybitKey: boolean;
  bybitKeyVerifiedAt: string | null;
  bybitKeyLastError: string | null;
}

interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

const KNOWN_SETTINGS: Array<{ key: string; description: string; placeholder?: string }> = [
  { key: 'ENTRY_USD', description: 'Размер входа по умолчанию, USD', placeholder: '10' },
  { key: 'DEFAULT_LEVERAGE', description: 'Плечо по умолчанию', placeholder: '10' },
  { key: 'MAX_LEVERAGE', description: 'Максимально допустимое плечо', placeholder: '20' },
  { key: 'TP_STRATEGY', description: 'TP-стратегия (closest/furthest/progressive)' },
  { key: 'SL_STRATEGY', description: 'SL-стратегия' },
];

export function CabinetDetail({
  cabinet,
  initialSettings,
}: {
  cabinet: Cabinet;
  initialSettings: Setting[];
}) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [target, setTarget] = useState<'mainnet' | 'testnet'>(cabinet.network);
  const [settings, setSettings] = useState<Setting[]>(initialSettings);
  const [msg, setMsg] = useState<string | null>(null);

  async function onUpsertKey(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(`/api/proxy/cabinets/${cabinet.id}/bybit-key`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        testnet: target === 'testnet',
        ...(target === 'mainnet'
          ? { apiKeyMainnet: apiKey, apiSecretMainnet: apiSecret }
          : { apiKeyTestnet: apiKey, apiSecretTestnet: apiSecret }),
      }),
    });
    if (res.ok) {
      setMsg('Ключ сохранён. Верификация запустится в фоне trader-сервисом.');
      setApiKey('');
      setApiSecret('');
    } else {
      setMsg(`Ошибка: ${await res.text()}`);
    }
  }

  function updateLocal(key: string, value: string) {
    setSettings((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      const now = new Date().toISOString();
      if (idx === -1) return [...prev, { key, value, updatedAt: now }];
      const next = [...prev];
      next[idx] = { key, value, updatedAt: now };
      return next;
    });
  }

  async function onSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const values = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const res = await fetch(`/api/proxy/cabinets/${cabinet.id}/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    setMsg(res.ok ? 'Настройки сохранены.' : `Ошибка: ${await res.text()}`);
  }

  const getValue = (key: string) => settings.find((s) => s.key === key)?.value ?? '';

  return (
    <>
      {msg && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          {msg}
        </div>
      )}

      <div className="card">
        <h2>Bybit API-ключи</h2>
        <p style={{ color: 'var(--fg-dim)' }}>
          Секрет шифруется (AES-256-GCM) в API. Текущий статус:{' '}
          {!cabinet.hasBybitKey && <span className="badge">не задан</span>}
          {cabinet.hasBybitKey && cabinet.bybitKeyVerifiedAt && (
            <span className="badge ok">
              OK, проверено {new Date(cabinet.bybitKeyVerifiedAt).toLocaleString()}
            </span>
          )}
          {cabinet.hasBybitKey && !cabinet.bybitKeyVerifiedAt && cabinet.bybitKeyLastError && (
            <span className="badge err">
              ошибка: {cabinet.bybitKeyLastError || 'не указана'}
            </span>
          )}
          {cabinet.hasBybitKey && !cabinet.bybitKeyVerifiedAt && !cabinet.bybitKeyLastError && (
            <span className="badge">ожидает проверки trader-сервисом</span>
          )}
        </p>
        <form onSubmit={onUpsertKey} className="col">
          <label>
            Сеть
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as 'mainnet' | 'testnet')}
            >
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </label>
          <label>
            API key
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
          </label>
          <label>
            API secret
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              required
            />
          </label>
          <div>
            <button type="submit">Сохранить</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Настройки кабинета</h2>
        <form onSubmit={onSaveSettings} className="col">
          {KNOWN_SETTINGS.map(({ key, description, placeholder }) => (
            <label key={key}>
              <strong>{key}</strong>{' '}
              <span style={{ color: 'var(--fg-dim)' }}>— {description}</span>
              <input
                placeholder={placeholder}
                value={getValue(key)}
                onChange={(e) => updateLocal(key, e.target.value)}
              />
            </label>
          ))}
          <div>
            <button type="submit">Сохранить настройки</button>
          </div>
        </form>
      </div>
    </>
  );
}
