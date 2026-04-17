'use client';

import { useEffect, useState } from 'react';

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

interface CommandResult {
  id: string;
  type: string;
  status: string;
  resultJson: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export function UserbotPanel({
  initialSession,
  initialChannels,
}: {
  initialSession: Session;
  initialChannels: Channel[];
}) {
  const [session, setSession] = useState(initialSession);
  const [channels, setChannels] = useState(initialChannels);
  const [qr, setQr] = useState<{ commandId: string; url: string | null; expiresAt: string | null } | null>(null);
  const [newChannel, setNewChannel] = useState({ chatId: '', title: '', username: '' });
  const [msg, setMsg] = useState<string | null>(null);

  async function refetch() {
    const [s, c] = await Promise.all([
      fetch('/api/proxy/userbot/session', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/proxy/userbot/channels', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    setSession(s);
    setChannels(c);
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
      if (cmd.status === 'done' || cmd.status === 'error') return cmd;
      if (cmd.status === 'in_progress' && cmd.resultJson) {
        const data = JSON.parse(cmd.resultJson) as { qrUrl?: string; expiresAt?: string };
        if (data.qrUrl) {
          setQr({
            commandId,
            url: data.qrUrl,
            expiresAt: data.expiresAt ?? null,
          });
        }
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
    if (result?.status === 'done') {
      setMsg('Сессия успешно создана.');
      setQr(null);
    } else if (result?.status === 'error') {
      setMsg(`Ошибка: ${result.error}`);
    }
    await refetch();
  }

  async function onLogout() {
    if (!confirm('Разлогинить Telegram-сессию?')) return;
    await enqueue('logout');
    setMsg('Команда на выход отправлена.');
    setTimeout(refetch, 1500);
  }

  async function onAddChannel(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/proxy/userbot/channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chatId: newChannel.chatId,
        title: newChannel.title,
        username: newChannel.username || undefined,
      }),
    });
    if (res.ok) {
      setNewChannel({ chatId: '', title: '', username: '' });
      await refetch();
    } else {
      setMsg(`Ошибка: ${await res.text()}`);
    }
  }

  async function onToggleChannel(c: Channel) {
    await fetch(`/api/proxy/userbot/channels/${c.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !c.enabled, sourcePriority: c.sourcePriority }),
    });
    await refetch();
  }

  async function onRemoveChannel(c: Channel) {
    if (!confirm(`Удалить канал ${c.title}?`)) return;
    await fetch(`/api/proxy/userbot/channels/${c.id}`, { method: 'DELETE' });
    await refetch();
  }

  useEffect(() => {
    const id = setInterval(refetch, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {msg && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          {msg}
        </div>
      )}

      <div className="card">
        <h2>Сессия</h2>
        <p>
          Статус:{' '}
          <span className={`badge ${session.status === 'connected' ? 'ok' : session.status === 'error' ? 'err' : ''}`}>
            {session.status}
          </span>
          {session.phone && <> · телефон: {session.phone}</>}
          {session.lastSeenAt && <> · last seen: {new Date(session.lastSeenAt).toLocaleString()}</>}
        </p>
        {session.lastError && (
          <p style={{ color: 'var(--danger)' }}>{session.lastError}</p>
        )}

        <div className="row">
          {!session.hasSession && <button onClick={onStartQrLogin}>Залогиниться (QR)</button>}
          {session.hasSession && <button onClick={onStartQrLogin}>Переподключиться</button>}
          {session.hasSession && (
            <button className="danger" onClick={onLogout}>
              Разлогинить
            </button>
          )}
        </div>

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
        <h2>Каналы</h2>
        <form onSubmit={onAddChannel} className="row">
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

        {channels.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>Каналов нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Chat ID</th>
                <th>@</th>
                <th>Включён</th>
                <th>Priority</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td>
                    <code>{c.chatId}</code>
                  </td>
                  <td>{c.username ?? '—'}</td>
                  <td>
                    <button className="ghost" onClick={() => onToggleChannel(c)}>
                      {c.enabled ? 'on' : 'off'}
                    </button>
                  </td>
                  <td>{c.sourcePriority}</td>
                  <td>
                    <button className="danger" onClick={() => onRemoveChannel(c)}>
                      ×
                    </button>
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
