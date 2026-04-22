'use client';

import { useState } from 'react';

interface GlobalSetting {
  key: string;
  value: string;
}

interface AppLog {
  id: string;
  level: string;
  category: string;
  message: string;
  createdAt: string;
}

interface PipelineSummary {
  stuck: {
    ingestClassifying: number;
    userbotCommands: number;
    recalcJobs: number;
  };
  checkedAt: string;
}

export function AdminPanel({
  initialSettings,
  initialLogs,
  initialPipeline,
}: {
  initialSettings: GlobalSetting[];
  initialLogs: AppLog[];
  initialPipeline: PipelineSummary;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [logs, setLogs] = useState(initialLogs);
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveSetting(key: string, value: string) {
    const res = await fetch('/api/proxy/admin/global-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      setMsg(`Ошибка сохранения ${key}: ${await res.text()}`);
      return;
    }
    setMsg(`Сохранено: ${key}`);
  }

  async function runDiagnostics() {
    const res = await fetch('/api/proxy/admin/diagnostics/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ models: ['openai/gpt-4o-mini'] }),
    });
    setMsg(res.ok ? 'Diagnostics run started.' : `Diagnostics error: ${await res.text()}`);
  }

  async function runRecalc(dryRun: boolean) {
    const res = await fetch('/api/proxy/admin/recalc-closed-pnl/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun, limit: 500 }),
    });
    setMsg(res.ok ? `Recalc ${dryRun ? 'dry-run' : 'run'} started.` : `Recalc error: ${await res.text()}`);
  }

  async function refreshLogs() {
    const res = await fetch('/api/proxy/admin/logs?limit=200', { cache: 'no-store' });
    if (!res.ok) return;
    setLogs(await res.json());
  }

  async function refreshPipeline() {
    const res = await fetch('/api/proxy/admin/pipeline-summary', { cache: 'no-store' });
    if (!res.ok) return;
    setPipeline(await res.json());
  }

  return (
    <>
      {msg && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          {msg}
        </div>
      )}
      <div className="card">
        <h2>Global settings</h2>
        <div className="col">
          {settings.map((setting, idx) => (
            <label key={setting.key}>
              <strong>{setting.key}</strong>
              <input
                value={setting.value}
                onChange={(e) =>
                  setSettings((prev) => {
                    const next = [...prev];
                    next[idx] = { ...setting, value: e.target.value };
                    return next;
                  })
                }
              />
              <button className="ghost" onClick={() => void saveSetting(setting.key, settings[idx]?.value ?? '')}>
                Save
              </button>
            </label>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>Ops actions</h2>
        <div className="row">
          <button onClick={() => void runDiagnostics()}>Run diagnostics</button>
          <button className="ghost" onClick={() => void runRecalc(true)}>
            Recalc PnL (dry-run)
          </button>
          <button className="danger" onClick={() => void runRecalc(false)}>
            Recalc PnL (apply)
          </button>
        </div>
      </div>
      <div className="card">
        <h2>Pipeline health</h2>
        <p style={{ marginBottom: 8 }}>
          Last check: {new Date(pipeline.checkedAt).toLocaleString()}
        </p>
        <div className="row">
          <span>Stuck classifying: {pipeline.stuck.ingestClassifying}</span>
          <span>Stuck userbot commands: {pipeline.stuck.userbotCommands}</span>
          <span>Stuck recalc jobs: {pipeline.stuck.recalcJobs}</span>
          <button className="ghost" onClick={() => void refreshPipeline()}>
            Refresh
          </button>
        </div>
      </div>
      <div className="card">
        <h2>App logs</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="ghost" onClick={() => void refreshLogs()}>
            Refresh
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>At</th>
              <th>Level</th>
              <th>Category</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
                <td>{log.level}</td>
                <td>{log.category}</td>
                <td>{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
