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
  status: string;
  classification: string | null;
  createdAt: string;
  draftStatus: string | null;
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
}: {
  initialSession: Session;
  initialChannels: Channel[];
  initialSummary: DashboardSummary;
  initialCabinetUsage: CabinetUsage[];
  initialRecentEvents: RecentEvent[];
  activeCabinetId: string | null;
}) {
  const [session, setSession] = useState(initialSession);
  const [channels, setChannels] = useState(initialChannels);
  const [summary, setSummary] = useState(initialSummary);
  const [cabinetUsage, setCabinetUsage] = useState(initialCabinetUsage);
  const [recentEvents, setRecentEvents] = useState(initialRecentEvents);
  const [search, setSearch] = useState('');
  const [qr, setQr] = useState<{ commandId: string; url: string | null; expiresAt: string | null } | null>(null);
  const [newChannel, setNewChannel] = useState({ chatId: '', title: '', username: '' });
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((row) => {
      return (
        row.title.toLowerCase().includes(q) ||
        row.chatId.toLowerCase().includes(q) ||
        (row.username ?? '').toLowerCase().includes(q)
      );
    });
  }, [channels, search]);

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

  async function updateChannel(channel: Channel, data: { enabled?: boolean; sourcePriority?: number }, busy: string) {
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
        <h2>Источники (legacy-style)</h2>
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
          <table>
            <thead>
              <tr>
                <th>Источник</th>
                <th>Chat ID</th>
                <th>Включён</th>
                <th>Priority</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredChannels.map((channel) => (
                <tr key={channel.id}>
                  <td>{formatSourceName(channel)}</td>
                  <td>
                    <code>{channel.chatId}</code>
                  </td>
                  <td>
                    <button
                      className="ghost"
                      disabled={busyKey === `toggle:${channel.id}`}
                      onClick={() => void onToggleChannel(channel)}
                    >
                      {channel.enabled ? 'on' : 'off'}
                    </button>
                  </td>
                  <td>
                    <input
                      style={{ width: 90 }}
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={channel.sourcePriority}
                      onBlur={(e) => void onPriorityBlur(channel, e.target.value)}
                    />
                  </td>
                  <td>
                    <button className="danger" onClick={() => void onRemoveChannel(channel)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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

      <div className="card">
        <h2>Recent ingest activity</h2>
        {recentEvents.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>Событий пока нет.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {recentEvents.map((event) => (
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
