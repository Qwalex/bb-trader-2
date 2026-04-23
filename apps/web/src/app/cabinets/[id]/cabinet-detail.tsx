'use client';

import { useState } from 'react';

interface Cabinet {
  id: string;
  slug: string;
  network: 'mainnet' | 'testnet';
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

const KNOWN_SETTINGS: Array<{ key: string; description: string; placeholder?: string }> = [
  { key: 'DEFAULT_ORDER_USD', description: 'Размер входа по умолчанию, USD', placeholder: '10' },
  { key: 'DEFAULT_LEVERAGE', description: 'Плечо по умолчанию', placeholder: '10' },
  { key: 'FORCED_LEVERAGE', description: 'Принудительное плечо (опционально)', placeholder: '20' },
  { key: 'BUMP_TO_MIN_EXCHANGE_LOT', description: 'Поднимать объём до min lot (true/false)' },
  { key: 'ENTRY_FILL_STRATEGY', description: 'Стратегия входа: market/limit' },
  { key: 'TP_SL_STEP_POLICY', description: 'Политика TP/SL для пошагового закрытия' },
  { key: 'DCA_ENABLED', description: 'Разрешить DCA (true/false)' },
];

export function CabinetDetail({
  cabinet,
  initialSettings,
  initialChannelFilters,
  initialCabinetBot,
}: {
  cabinet: Cabinet;
  initialSettings: Setting[];
  initialChannelFilters: ChannelFilter[];
  initialCabinetBot: CabinetBot | null;
}) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [target, setTarget] = useState<'mainnet' | 'testnet'>(cabinet.network);
  const [settings, setSettings] = useState<Setting[]>(initialSettings);
  const [channelFilters, setChannelFilters] = useState<ChannelFilter[]>(initialChannelFilters);
  const [cabinetBot, setCabinetBot] = useState<CabinetBot | null>(initialCabinetBot);
  const [botToken, setBotToken] = useState('');
  const [botSignalChatId, setBotSignalChatId] = useState(initialCabinetBot?.signalChatId ?? '');
  const [botLogChatId, setBotLogChatId] = useState(initialCabinetBot?.logChatId ?? '');
  const [botEnabled, setBotEnabled] = useState(initialCabinetBot?.enabled ?? true);
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

  async function onToggleChannelFilter(filter: ChannelFilter) {
    const res = await fetch(`/api/proxy/cabinets/${cabinet.id}/channel-filters/${filter.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !filter.enabled }),
    });
    if (!res.ok) {
      setMsg(`Ошибка channel filter: ${await res.text()}`);
      return;
    }
    setChannelFilters((prev) =>
      prev.map((f) => (f.id === filter.id ? { ...f, enabled: !f.enabled } : f)),
    );
  }

  async function refreshCabinetBot() {
    const res = await fetch(`/api/proxy/cabinets/${cabinet.id}/cabinet-bot`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as CabinetBot | null;
    setCabinetBot(data);
    if (data) {
      setBotSignalChatId(data.signalChatId ?? '');
      setBotLogChatId(data.logChatId ?? '');
      setBotEnabled(data.enabled);
    }
  }

  async function onSaveCabinetBot(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const body: Record<string, unknown> = {
      signalChatId: botSignalChatId.trim() || null,
      logChatId: botLogChatId.trim() || null,
      enabled: botEnabled,
    };
    if (botToken.trim()) body.botToken = botToken.trim();
    const res = await fetch(`/api/proxy/cabinets/${cabinet.id}/cabinet-bot`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg(`Ошибка cabinet bot: ${await res.text()}`);
      return;
    }
    setBotToken('');
    await refreshCabinetBot();
    setMsg('Cabinet bot сохранён.');
  }

  async function onVerifyCabinetBot() {
    setMsg(null);
    const res = await fetch(`/api/proxy/cabinets/${cabinet.id}/cabinet-bot/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verifySignalChatId: true, verifyLogChatId: true }),
    });
    if (!res.ok) {
      setMsg(`Ошибка верификации cabinet bot: ${await res.text()}`);
      return;
    }
    await refreshCabinetBot();
    setMsg('Cabinet bot успешно верифицирован.');
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

      <div className="card">
        <h2>Cabinet bot assistant</h2>
        <p style={{ color: 'var(--fg-dim)' }}>
          Один бот кабинета для intake сигналов и отправки логов/уведомлений.
        </p>
        <p>
          Статус:{' '}
          {!cabinetBot && <span className="badge">не настроен</span>}
          {cabinetBot?.lastVerifiedAt && <span className="badge ok">verified</span>}
          {cabinetBot && !cabinetBot.lastVerifiedAt && cabinetBot.lastVerifyError && (
            <span className="badge err">ошибка</span>
          )}
          {cabinetBot && !cabinetBot.lastVerifiedAt && !cabinetBot.lastVerifyError && (
            <span className="badge">ожидает верификации</span>
          )}
          {cabinetBot?.botUsername && <> · @{cabinetBot.botUsername}</>}
        </p>
        {cabinetBot?.lastVerifyError && (
          <p style={{ color: 'var(--danger)' }}>{cabinetBot.lastVerifyError}</p>
        )}
        <form onSubmit={onSaveCabinetBot} className="col">
          <label>
            Bot token {cabinetBot ? '(оставьте пустым, чтобы не менять)' : ''}
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              required={!cabinetBot}
            />
          </label>
          <label>
            Signal source chat ID
            <input
              placeholder="например -1001234567890"
              value={botSignalChatId}
              onChange={(e) => setBotSignalChatId(e.target.value)}
            />
          </label>
          <label>
            Logs destination chat ID
            <input
              placeholder="например -1001234567890"
              value={botLogChatId}
              onChange={(e) => setBotLogChatId(e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={botEnabled}
              onChange={(e) => setBotEnabled(e.target.checked)}
            />
            Бот включён
          </label>
          <div className="row">
            <button type="submit">Сохранить bot config</button>
            <button type="button" className="ghost" onClick={() => void onVerifyCabinetBot()}>
              Verify bot
            </button>
          </div>
        </form>
        {cabinetBot?.lastInboundAt && (
          <p style={{ color: 'var(--fg-dim)' }}>
            Last inbound: {new Date(cabinetBot.lastInboundAt).toLocaleString()}
          </p>
        )}
        {cabinetBot?.lastOutboundAt && (
          <p style={{ color: 'var(--fg-dim)' }}>
            Last outbound: {new Date(cabinetBot.lastOutboundAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Source-level filters</h2>
        {channelFilters.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>Для кабинета пока нет привязанных фильтров источников.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Chat ID</th>
                <th>Enabled</th>
                <th>Default lev</th>
                <th>Forced lev</th>
                <th>Entry USD</th>
                <th>Min lot bump</th>
              </tr>
            </thead>
            <tbody>
              {channelFilters.map((filter) => (
                <tr key={filter.id}>
                  <td>{filter.title}</td>
                  <td>
                    <code>{filter.chatId}</code>
                  </td>
                  <td>
                    <button className="ghost" onClick={() => void onToggleChannelFilter(filter)}>
                      {filter.enabled ? 'on' : 'off'}
                    </button>
                  </td>
                  <td>{filter.defaultLeverage ?? '—'}</td>
                  <td>{filter.forcedLeverage ?? '—'}</td>
                  <td>{filter.defaultEntryUsd ?? '—'}</td>
                  <td>{filter.minLotBump == null ? '—' : filter.minLotBump ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
