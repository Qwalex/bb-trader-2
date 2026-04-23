'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

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
  sourceType: string;
  status: string;
  classification: string | null;
  classifyError: string | null;
  createdAt: string;
  draftStatus: string | null;
  aiRequest: string | null;
  aiResponse: string | null;
}

interface TracePayload {
  ingestId: string;
  chatId: string;
  messageId: string;
  classification: string | null;
  status: string;
  classifyError: string | null;
  aiRequest: string | null;
  aiResponse: string | null;
  createdAt: string;
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

interface CommandResult {
  id: string;
  type: string;
  status: string;
  resultJson: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

interface QrResultPayload {
  qrUrl?: string;
  qr_url?: string;
  expiresAt?: string;
  expires_at?: string;
  expires_in?: number;
}

interface SyncDialogsResultPayload {
  imported?: number;
}

function formatSourceName(row: Channel): string {
  return row.username ? `${row.title} (@${row.username})` : row.title;
}

function cutText(value: string | null, limit = 180): string {
  if (!value) return '—';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
}

export function UserbotPanel({
  initialSession,
  initialChannels,
  initialSummary,
  initialCabinetUsage,
  initialRecentEvents,
  activeCabinetId,
  initialActiveCabinetFilters,
}: {
  initialSession: Session;
  initialChannels: Channel[];
  initialSummary: DashboardSummary;
  initialCabinetUsage: CabinetUsage[];
  initialRecentEvents: RecentEvent[];
  activeCabinetId: string | null;
  initialActiveCabinetFilters: ActiveCabinetFilter[];
}) {
  const [session, setSession] = useState(initialSession);
  const [channels, setChannels] = useState(initialChannels);
  const [summary, setSummary] = useState(initialSummary);
  const [cabinetUsage, setCabinetUsage] = useState(initialCabinetUsage);
  const [recentEvents, setRecentEvents] = useState(initialRecentEvents);
  const [activeCabinetFilters, setActiveCabinetFilters] = useState(initialActiveCabinetFilters);
  const [search, setSearch] = useState('');
  const [onlySignals, setOnlySignals] = useState(true);
  const [groupBySource, setGroupBySource] = useState(true);
  const [qr, setQr] = useState<{ commandId: string; url: string | null; expiresAt: string | null } | null>(null);
  const [newChannel, setNewChannel] = useState({ chatId: '', title: '', username: '' });
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [trace, setTrace] = useState<TracePayload | null>(null);

  const filterByChannelId = useMemo(
    () => new Map(activeCabinetFilters.map((f) => [f.userbotChannelId, f])),
    [activeCabinetFilters],
  );

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((row) => {
      const sourceName = formatSourceName(row).toLowerCase();
      return (
        sourceName.includes(q) ||
        row.chatId.toLowerCase().includes(q) ||
        (row.username ?? '').toLowerCase().includes(q)
      );
    });
  }, [channels, search]);

  const filteredRecentEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bySignal = onlySignals
      ? recentEvents.filter((row) => row.classification === 'signal')
      : recentEvents;
    if (!q) return bySignal;
    return bySignal.filter((row) => {
      const sourceName = (row.chatTitle ?? row.chatId).toLowerCase();
      const text = (row.text ?? '').toLowerCase();
      return sourceName.includes(q) || row.chatId.toLowerCase().includes(q) || text.includes(q);
    });
  }, [onlySignals, recentEvents, search]);

  const recentBySource = useMemo(() => {
    const grouped = new Map<string, RecentEvent[]>();
    for (const row of filteredRecentEvents) {
      const list = grouped.get(row.chatId) ?? [];
      list.push(row);
      grouped.set(row.chatId, list);
    }
    return Array.from(grouped.entries())
      .map(([chatId, rows]) => ({
        chatId,
        title: rows[0]?.chatTitle ?? chatId,
        rows: [...rows].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredRecentEvents]);

  function extractQr(resultJson: string | null): { url: string | null; expiresAt: string | null } | null {
    if (!resultJson) return null;
    try {
      const data = JSON.parse(resultJson) as QrResultPayload;
      const url = data.qrUrl ?? data.qr_url ?? null;
      const expiresAt =
        data.expiresAt ??
        data.expires_at ??
        (typeof data.expires_in === 'number'
          ? new Date(Date.now() + data.expires_in * 1000).toISOString()
          : null);
      if (!url) return null;
      return { url, expiresAt };
    } catch {
      return null;
    }
  }

  async function refetchAll() {
    const [s, c, ds, dc, re] = await Promise.all([
      fetch('/api/proxy/userbot/session', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/proxy/userbot/channels', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/proxy/userbot/dashboard/summary', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/proxy/userbot/dashboard/cabinets', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/proxy/userbot/events/recent?limit=40', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    setSession(s as Session);
    setChannels(c as Channel[]);
    setSummary(ds as DashboardSummary);
    setCabinetUsage(dc as CabinetUsage[]);
    setRecentEvents(re as RecentEvent[]);
    if (activeCabinetId) {
      const filtersRes = await fetch(`/api/proxy/cabinets/${activeCabinetId}/channel-filters`, {
        cache: 'no-store',
      });
      if (filtersRes.ok) {
        setActiveCabinetFilters((await filtersRes.json()) as ActiveCabinetFilter[]);
      }
    }
  }

  async function enqueue(type: string, payload?: Record<string, unknown>) {
    const res = await fetch('/api/proxy/userbot/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, payload }),
    });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return null;
    }
    return (await res.json()) as { commandId: string };
  }

  async function pollCommand(commandId: string) {
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`/api/proxy/userbot/commands/${commandId}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const cmd = (await res.json()) as CommandResult;
      const qrData = extractQr(cmd.resultJson);
      if (qrData) {
        setQr({ commandId, url: qrData.url, expiresAt: qrData.expiresAt });
        return cmd;
      }
      if (cmd.status === 'done' || cmd.status === 'failed') return cmd;
    }
    return null;
  }

  async function waitForSessionTransition(timeoutMs = 120_000, pollMs = 2_000): Promise<Session | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollMs));
      const res = await fetch('/api/proxy/userbot/session', { cache: 'no-store' });
      if (!res.ok) continue;
      const next = (await res.json()) as Session;
      setSession(next);
      if (next.status === 'connected' || next.status === 'failed' || next.status === 'awaiting_2fa') {
        return next;
      }
    }
    return null;
  }

  async function onStartQrLogin() {
    setMsg(null);
    const cmd = await enqueue('login_qr');
    if (!cmd) return;
    setQr({ commandId: cmd.commandId, url: null, expiresAt: null });
    const result = await pollCommand(cmd.commandId);
    const qrFromResult = extractQr(result?.resultJson ?? null);
    if (result?.status === 'failed') {
      setMsg(`Ошибка: ${result.error}`);
    } else if (qrFromResult?.url) {
      setMsg('QR получен. Отсканируйте его в Telegram и дождитесь статуса connected.');
      const finalSession = await waitForSessionTransition();
      if (finalSession?.status === 'connected') {
        setMsg('Сессия успешно подключена.');
        setQr(null);
      } else if (finalSession?.status === 'awaiting_2fa') {
        setMsg('Нужен пароль 2FA. Введите его ниже, чтобы завершить вход.');
      } else if (finalSession?.lastError) {
        setMsg(`Ошибка входа: ${finalSession.lastError}`);
      } else if (finalSession?.status === 'failed') {
        setMsg(`Ошибка входа: статус ${finalSession.status}`);
      } else {
        setMsg('QR отсканирован, но подтверждение входа не получено вовремя. Проверьте userbot-логи.');
      }
    } else if (result?.status === 'done') {
      setMsg('Команда login_qr выполнена, ожидаем подтверждение входа в Telegram.');
    }
    await refetchAll();
  }

  async function onSubmitTwoFa(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const password = twoFaPassword.trim();
    if (!password) {
      setMsg('Введите пароль 2FA.');
      return;
    }
    const cmd = await enqueue('submit_2fa_password', { password });
    if (!cmd) return;
    setTwoFaPassword('');
    setMsg('Проверяем 2FA-пароль...');
    const result = await pollCommand(cmd.commandId);
    if (result?.status === 'failed') {
      setMsg(`Ошибка 2FA: ${result.error || 'не удалось подтвердить пароль'}`);
      await refetchAll();
      return;
    }
    const finalSession = await waitForSessionTransition(60_000, 1_500);
    if (finalSession?.status === 'connected') {
      setMsg('Сессия успешно подключена.');
      setQr(null);
    } else if (finalSession?.status === 'awaiting_2fa') {
      setMsg(finalSession.lastError || 'Пароль 2FA неверный, попробуйте снова.');
    } else if (finalSession?.status === 'failed') {
      setMsg(finalSession.lastError || 'Не удалось завершить вход по 2FA.');
    }
    await refetchAll();
  }

  async function onLogout() {
    if (!confirm('Разлогинить Telegram-сессию?')) return;
    await enqueue('logout');
    setMsg('Команда на выход отправлена.');
    setTimeout(() => {
      void refetchAll();
    }, 1500);
  }

  async function onSyncDialogs() {
    setMsg(null);
    const cmd = await enqueue('sync_dialogs');
    if (!cmd) return;
    setMsg('Синхронизируем список каналов из Telegram...');
    const result = await pollCommand(cmd.commandId);
    if (result?.status === 'failed') {
      setMsg(`Ошибка синхронизации: ${result.error || 'команда завершилась с ошибкой'}`);
      return;
    }
    let importedText = '';
    try {
      const data = (result?.resultJson ? JSON.parse(result.resultJson) : {}) as SyncDialogsResultPayload;
      if (typeof data.imported === 'number') importedText = ` Импортировано: ${data.imported}.`;
    } catch {
      /* ignore malformed payload */
    }
    await refetchAll();
    setMsg(`Синхронизация завершена.${importedText}`);
  }

  async function onScanToday() {
    setBusyKey('scan-today');
    setMsg(null);
    try {
      const res = await fetch('/api/proxy/userbot/scan-today', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limitPerChat: 200 }),
      });
      if (!res.ok) {
        setMsg(`Ошибка scan-today: ${await res.text()}`);
        return;
      }
      const data = (await res.json()) as { total: number; processed: number };
      await refetchAll();
      setMsg(`scan-today: queued ${data.processed} из ${data.total}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function onRereadAll() {
    setBusyKey('reread-all');
    setMsg(null);
    try {
      const res = await fetch('/api/proxy/userbot/reread-all', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 1000 }),
      });
      if (!res.ok) {
        setMsg(`Ошибка reread-all: ${await res.text()}`);
        return;
      }
      const data = (await res.json()) as { total: number; processed: number };
      await refetchAll();
      setMsg(`reread-all: queued ${data.processed} из ${data.total}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function onRereadOne(ingestId: string) {
    setBusyKey(`reread:${ingestId}`);
    setMsg(null);
    try {
      const res = await fetch(`/api/proxy/userbot/reread/${ingestId}`, { method: 'POST' });
      if (!res.ok) {
        setMsg(`Ошибка reread: ${await res.text()}`);
        return;
      }
      await refetchAll();
      setMsg(`Сообщение ${ingestId} поставлено на повторную обработку.`);
    } finally {
      setBusyKey(null);
    }
  }

  async function onOpenTrace(ingestId: string) {
    const res = await fetch(`/api/proxy/userbot/trace/${ingestId}`, { cache: 'no-store' });
    if (!res.ok) {
      setMsg(`Ошибка trace: ${await res.text()}`);
      return;
    }
    setTrace((await res.json()) as TracePayload);
  }

  async function onAddChannel(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/proxy/userbot/channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chatId: newChannel.chatId.trim(),
        title: newChannel.title.trim(),
        username: newChannel.username.trim() || undefined,
      }),
    });
    if (res.ok) {
      setNewChannel({ chatId: '', title: '', username: '' });
      await refetchAll();
      return;
    }
    setMsg(`Ошибка: ${await res.text()}`);
  }

  async function updateChannel(
    channel: Channel,
    data: { enabled?: boolean; sourcePriority?: number },
    busy: string,
  ) {
    setBusyKey(busy);
    setMsg(null);
    try {
      const res = await fetch(`/api/proxy/userbot/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: data.enabled ?? channel.enabled,
          sourcePriority: data.sourcePriority ?? channel.sourcePriority,
        }),
      });
      if (!res.ok) {
        setMsg(`Ошибка: ${await res.text()}`);
        return;
      }
      await refetchAll();
    } finally {
      setBusyKey(null);
    }
  }

  async function updateActiveFilter(
    channelId: string,
    data: {
      enabled?: boolean;
      defaultLeverage?: number | null;
      forcedLeverage?: number | null;
      defaultEntryUsd?: string | null;
      minLotBump?: boolean | null;
    },
    busy: string,
  ) {
    if (!activeCabinetId) {
      setMsg('Выберите active cabinet, чтобы менять source-level настройки.');
      return;
    }
    const filter = filterByChannelId.get(channelId);
    if (!filter) {
      setMsg('Для этого источника ещё нет фильтра в активном кабинете. Включите его в кабинете.');
      return;
    }
    setBusyKey(busy);
    setMsg(null);
    try {
      const res = await fetch(`/api/proxy/cabinets/${activeCabinetId}/channel-filters/${filter.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        setMsg(`Ошибка: ${await res.text()}`);
        return;
      }
      await refetchAll();
    } finally {
      setBusyKey(null);
    }
  }

  async function onToggleChannel(channel: Channel) {
    await updateChannel(channel, { enabled: !channel.enabled }, `toggle:${channel.id}`);
  }

  async function onPriorityBlur(channel: Channel, rawValue: string) {
    const parsed = Number.parseInt(rawValue.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setMsg('Priority должен быть целым числом от 0 до 100.');
      return;
    }
    if (parsed === channel.sourcePriority) return;
    await updateChannel(channel, { sourcePriority: parsed }, `priority:${channel.id}`);
  }

  async function onRemoveChannel(channel: Channel) {
    if (!confirm(`Удалить канал ${channel.title}?`)) return;
    const res = await fetch(`/api/proxy/userbot/channels/${channel.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    await refetchAll();
  }

  useEffect(() => {
    const id = setInterval(() => {
      void refetchAll();
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (session.status === 'connected') {
      setQr(null);
    }
  }, [session.status]);

  return (
    <>
      {msg && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          {msg}
        </div>
      )}

      <div className="grid">
        <div className="card">
          <h2>Источники</h2>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.channelsEnabled}</div>
          <p style={{ color: 'var(--fg-dim)', margin: '8px 0 0' }}>включено из {summary.channelsTotal}</p>
        </div>
        <div className="card">
          <h2>Кабинеты</h2>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.cabinetsEnabled}</div>
          <p style={{ color: 'var(--fg-dim)', margin: '8px 0 0' }}>активных из {summary.cabinetsTotal}</p>
        </div>
        <div className="card">
          <h2>Ingest Today</h2>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.ingestToday}</div>
          <p style={{ color: 'var(--fg-dim)', margin: '8px 0 0' }}>
            classified: {summary.classifiedToday}
          </p>
        </div>
        <div className="card">
          <h2>Signal Drafts</h2>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.signalsReadyToday}</div>
          <p style={{ color: 'var(--fg-dim)', margin: '8px 0 0' }}>
            fanned out: {summary.signalsFannedOutToday}
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Сессия</h2>
        <p>
          Статус:{' '}
          <span className={`badge ${session.status === 'connected' ? 'ok' : session.status === 'failed' ? 'err' : ''}`}>
            {session.status}
          </span>
          {session.phone && <> · телефон: {session.phone}</>}
          {session.lastSeenAt && <> · last seen: {new Date(session.lastSeenAt).toLocaleString()}</>}
        </p>
        {session.lastError && <p style={{ color: 'var(--danger)' }}>{session.lastError}</p>}

        <div className="row">
          {!session.hasSession && <button onClick={onStartQrLogin}>Залогиниться (QR)</button>}
          {session.hasSession && <button onClick={onStartQrLogin}>Переподключиться</button>}
          {session.hasSession && (
            <button className="ghost" onClick={onSyncDialogs}>
              Синхронизировать каналы
            </button>
          )}
          {session.hasSession && (
            <button className="danger" onClick={onLogout}>
              Разлогинить
            </button>
          )}
          <button className="ghost" disabled={busyKey === 'scan-today'} onClick={() => void onScanToday()}>
            {busyKey === 'scan-today' ? 'scan…' : 'Сканировать сегодня'}
          </button>
          <button className="ghost" disabled={busyKey === 'reread-all'} onClick={() => void onRereadAll()}>
            {busyKey === 'reread-all' ? 'reread…' : 'Перечитать все'}
          </button>
        </div>

        {session.status === 'awaiting_2fa' && (
          <form onSubmit={onSubmitTwoFa} className="row" style={{ marginTop: 12 }}>
            <input
              type="password"
              placeholder="Введите пароль 2FA"
              value={twoFaPassword}
              onChange={(e) => setTwoFaPassword(e.target.value)}
              required
            />
            <button type="submit">Подтвердить 2FA</button>
          </form>
        )}

        {qr && (
          <div className="card" style={{ marginTop: 16 }}>
            <p>Отсканируйте QR в официальном Telegram-клиенте:</p>
            {qr.url ? (
              <img
                alt="Telegram QR"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr.url)}`}
              />
            ) : (
              <p style={{ color: 'var(--fg-dim)' }}>ожидаем QR от userbot-сервиса…</p>
            )}
            {qr.expiresAt && (
              <small style={{ color: 'var(--fg-dim)' }}>
                действителен до {new Date(qr.expiresAt).toLocaleTimeString()}
              </small>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Источники (карточки)</h2>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <input
            style={{ minWidth: 280 }}
            placeholder="Поиск по названию, chat id или @username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span style={{ color: 'var(--fg-dim)' }}>
            Найдено: {filteredChannels.length} из {channels.length}
          </span>
        </div>

        <form onSubmit={onAddChannel} className="row" style={{ marginBottom: 12 }}>
          <input
            placeholder="chatId (напр. -1001234567890)"
            value={newChannel.chatId}
            onChange={(e) => setNewChannel({ ...newChannel, chatId: e.target.value })}
            required
          />
          <input
            placeholder="Название"
            value={newChannel.title}
            onChange={(e) => setNewChannel({ ...newChannel, title: e.target.value })}
            required
          />
          <input
            placeholder="@username (опц.)"
            value={newChannel.username}
            onChange={(e) => setNewChannel({ ...newChannel, username: e.target.value })}
          />
          <button type="submit">+ Добавить</button>
        </form>

        {filteredChannels.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>Источников по текущему фильтру нет.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filteredChannels.map((channel) => {
              const filter = filterByChannelId.get(channel.id);
              return (
                <article key={channel.id} className="card" style={{ marginBottom: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{formatSourceName(channel)}</strong>{' '}
                      <span style={{ color: 'var(--fg-dim)' }}>
                        <code>{channel.chatId}</code>
                      </span>
                    </div>
                    <div className="row">
                      <button
                        className="ghost"
                        disabled={busyKey === `toggle:${channel.id}`}
                        onClick={() => void onToggleChannel(channel)}
                      >
                        source {channel.enabled ? 'on' : 'off'}
                      </button>
                      <button className="danger" onClick={() => void onRemoveChannel(channel)}>
                        удалить
                      </button>
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: 8 }}>
                    <label>
                      Priority
                      <input
                        style={{ width: 100, marginLeft: 8 }}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={channel.sourcePriority}
                        onBlur={(e) => void onPriorityBlur(channel, e.target.value)}
                      />
                    </label>
                    <span className="badge">active cabinet: {activeCabinetId ? 'set' : 'not selected'}</span>
                    {filter ? (
                      <span className="badge ok">filter linked</span>
                    ) : (
                      <span className="badge">filter missing</span>
                    )}
                  </div>

                  {filter ? (
                    <div className="row" style={{ marginTop: 10 }}>
                      <button
                        className="ghost"
                        disabled={busyKey === `filter-enabled:${channel.id}`}
                        onClick={() =>
                          void updateActiveFilter(
                            channel.id,
                            { enabled: !filter.enabled },
                            `filter-enabled:${channel.id}`,
                          )
                        }
                      >
                        cabinet filter {filter.enabled ? 'on' : 'off'}
                      </button>
                      <label>
                        Default lev
                        <input
                          style={{ width: 90, marginLeft: 8 }}
                          type="number"
                          min={1}
                          defaultValue={filter.defaultLeverage ?? ''}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            const next = v === '' ? null : Number.parseInt(v, 10);
                            if (v !== '' && (!Number.isFinite(next) || next == null || next < 1)) return;
                            if (next === filter.defaultLeverage) return;
                            void updateActiveFilter(
                              channel.id,
                              { defaultLeverage: next },
                              `filter-default-lev:${channel.id}`,
                            );
                          }}
                        />
                      </label>
                      <label>
                        Forced lev
                        <input
                          style={{ width: 90, marginLeft: 8 }}
                          type="number"
                          min={1}
                          defaultValue={filter.forcedLeverage ?? ''}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            const next = v === '' ? null : Number.parseInt(v, 10);
                            if (v !== '' && (!Number.isFinite(next) || next == null || next < 1)) return;
                            if (next === filter.forcedLeverage) return;
                            void updateActiveFilter(
                              channel.id,
                              { forcedLeverage: next },
                              `filter-forced-lev:${channel.id}`,
                            );
                          }}
                        />
                      </label>
                      <label>
                        Entry USD
                        <input
                          style={{ width: 130, marginLeft: 8 }}
                          defaultValue={filter.defaultEntryUsd ?? ''}
                          onBlur={(e) => {
                            const nextRaw = e.target.value.trim();
                            const next = nextRaw === '' ? null : nextRaw;
                            if (next === filter.defaultEntryUsd) return;
                            void updateActiveFilter(
                              channel.id,
                              { defaultEntryUsd: next },
                              `filter-entry:${channel.id}`,
                            );
                          }}
                        />
                      </label>
                      <label>
                        Min lot bump
                        <select
                          style={{ marginLeft: 8 }}
                          value={
                            filter.minLotBump == null ? '' : filter.minLotBump ? 'true' : 'false'
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            const next = raw === '' ? null : raw === 'true';
                            if (next === filter.minLotBump) return;
                            void updateActiveFilter(
                              channel.id,
                              { minLotBump: next },
                              `filter-minlot:${channel.id}`,
                            );
                          }}
                        >
                          <option value="">inherit</option>
                          <option value="false">off</option>
                          <option value="true">on</option>
                        </select>
                      </label>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--fg-dim)', marginTop: 8 }}>
                      Для этого источника нет фильтра в активном кабинете. Создайте/включите его в кабинете:
                      {' '}
                      {activeCabinetId ? <Link href={`/cabinets/${activeCabinetId}`}>открыть кабинет</Link> : 'выберите active cabinet'}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Сообщения из источников</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={onlySignals}
              onChange={(e) => setOnlySignals(e.target.checked)}
            />
            Только сигналы
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={groupBySource}
              onChange={(e) => setGroupBySource(e.target.checked)}
            />
            Группировать по источникам
          </label>
        </div>

        {filteredRecentEvents.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>Событий по текущему фильтру нет.</p>
        ) : groupBySource ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {recentBySource.map((group) => (
              <details key={group.chatId} className="card" style={{ marginBottom: 0 }}>
                <summary style={{ cursor: 'pointer' }}>
                  <strong>{group.title}</strong>{' '}
                  <span style={{ color: 'var(--fg-dim)' }}>
                    ({group.chatId}) · {group.rows.length} сообщ.
                  </span>
                </summary>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {group.rows.map((event) => (
                    <div key={event.id} className="card" style={{ marginBottom: 0 }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div style={{ color: 'var(--fg-dim)' }}>#{event.messageId}</div>
                        <div style={{ color: 'var(--fg-dim)' }}>
                          {new Date(event.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <p style={{ margin: '8px 0' }}>{cutText(event.text)}</p>
                      <div className="row">
                        <span className="badge">ingest: {event.status}</span>
                        <span className="badge">{event.classification ?? 'classification:none'}</span>
                        <span className="badge">{event.draftStatus ?? 'draft:none'}</span>
                        {event.classifyError && (
                          <span className="badge err">{cutText(event.classifyError, 80)}</span>
                        )}
                        <button
                          className="ghost"
                          disabled={busyKey === `reread:${event.id}`}
                          onClick={() => void onRereadOne(event.id)}
                        >
                          reread
                        </button>
                        <button className="ghost" onClick={() => void onOpenTrace(event.id)}>
                          trace
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filteredRecentEvents.map((event) => (
              <div key={event.id} className="card" style={{ marginBottom: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{event.chatTitle ?? event.chatId}</strong>{' '}
                    <span style={{ color: 'var(--fg-dim)' }}>
                      ({event.chatId} / {event.messageId})
                    </span>
                  </div>
                  <div style={{ color: 'var(--fg-dim)' }}>{new Date(event.createdAt).toLocaleString()}</div>
                </div>
                <p style={{ margin: '8px 0' }}>{cutText(event.text)}</p>
                <div className="row">
                  <span className="badge">ingest: {event.status}</span>
                  <span className="badge">{event.classification ?? 'classification:none'}</span>
                  <span className="badge">{event.draftStatus ?? 'draft:none'}</span>
                  {event.classifyError && (
                    <span className="badge err">{cutText(event.classifyError, 80)}</span>
                  )}
                  <button
                    className="ghost"
                    disabled={busyKey === `reread:${event.id}`}
                    onClick={() => void onRereadOne(event.id)}
                  >
                    reread
                  </button>
                  <button className="ghost" onClick={() => void onOpenTrace(event.id)}>
                    trace
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {trace && (
        <div
          role="presentation"
          onClick={() => setTrace(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Classifier trace"
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 'min(1000px, 100%)', maxHeight: '85vh', overflowY: 'auto', marginBottom: 0 }}
          >
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, color: 'var(--fg)' }}>
                Trace: {trace.chatId} / {trace.messageId}
              </h2>
              <button className="ghost" onClick={() => setTrace(null)}>
                Закрыть
              </button>
            </div>
            <p style={{ color: 'var(--fg-dim)' }}>
              ingest={trace.status} · classification={trace.classification ?? 'none'}
              {trace.classifyError ? ` · error=${trace.classifyError}` : ''}
            </p>
            <h3>AI request</h3>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {trace.aiRequest ?? '—'}
            </pre>
            <h3>AI response</h3>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {trace.aiResponse ?? '—'}
            </pre>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Cabinet coverage</h2>
        <p style={{ color: 'var(--fg-dim)' }}>
          Trading-настройки по источникам живут на уровне кабинета. Здесь показано, где именно эти источники активированы.
        </p>
        {cabinetUsage.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>Кабинетов пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Кабинет</th>
                <th>Статус</th>
                <th>Фильтры</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cabinetUsage.map((cabinet) => (
                <tr key={cabinet.cabinetId}>
                  <td>
                    {cabinet.cabinetDisplayName}{' '}
                    <span style={{ color: 'var(--fg-dim)' }}>({cabinet.cabinetSlug})</span>
                    {activeCabinetId === cabinet.cabinetId && (
                      <span className="badge ok" style={{ marginLeft: 8 }}>
                        active
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${cabinet.cabinetEnabled ? 'ok' : 'err'}`}>
                      {cabinet.cabinetEnabled ? 'enabled' : 'disabled'}
                    </span>
                  </td>
                  <td>
                    {cabinet.activeFilters} / {cabinet.totalFilters}
                  </td>
                  <td>
                    <Link href={`/cabinets/${cabinet.cabinetId}`}>Открыть кабинет</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
