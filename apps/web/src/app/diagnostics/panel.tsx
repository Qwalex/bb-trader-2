'use client';

import { useState } from 'react';

interface DiagnosticRun {
  id: string;
  status: string;
  caseCount: number;
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

interface DiagnosticDetail {
  id: string;
  status: string;
  caseCount: number;
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  cases: Array<{
    id: string;
    title: string | null;
    status: string;
    ingestId: string | null;
    signalId: string | null;
    chatId: string | null;
    messageId: string | null;
  }>;
  modelResults: Array<{
    id: string;
    caseId: string;
    model: string;
    status: string;
    summary: string | null;
  }>;
  stepResults: Array<{
    id: string;
    caseId: string;
    stepName: string;
    status: string;
    error: string | null;
    payloadJson: string | null;
    createdAt: string;
  }>;
  logs: Array<{
    id: string;
    level: string;
    category: string;
    message: string;
    payload: string | null;
    createdAt: string;
  }>;
}

interface PipelineSummary {
  ingestCounts: Array<{ status: string; _count: { _all: number } }>;
  commandCounts: Array<{ status: string; _count: { _all: number } }>;
  recalcCounts: Array<{ status: string; _count: { _all: number } }>;
  stuck: {
    ingestClassifying: number;
    userbotCommands: number;
    recalcJobs: number;
  };
  checkedAt: string;
}

export function DiagnosticsPanel({ initialRuns }: { initialRuns: DiagnosticRun[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [detail, setDetail] = useState<DiagnosticDetail | null>(null);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refreshRuns() {
    const res = await fetch('/api/proxy/admin/diagnostics/runs?limit=50', { cache: 'no-store' });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    setRuns((await res.json()) as DiagnosticRun[]);
  }

  async function refreshPipelineSummary() {
    const res = await fetch('/api/proxy/admin/pipeline-summary', { cache: 'no-store' });
    if (!res.ok) {
      setMsg(`Pipeline summary error: ${await res.text()}`);
      return;
    }
    setPipeline((await res.json()) as PipelineSummary);
  }

  async function openRun(runId: string) {
    const res = await fetch(`/api/proxy/admin/diagnostics/runs/${runId}`, { cache: 'no-store' });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    setDetail((await res.json()) as DiagnosticDetail);
  }

  return (
    <>
      {msg && <div className="card">{msg}</div>}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Pipeline health</h2>
          <button className="ghost" onClick={() => void refreshPipelineSummary()}>
            Refresh
          </button>
        </div>
        {!pipeline ? (
          <p style={{ color: 'var(--fg-dim)' }}>Click refresh to load current queue health.</p>
        ) : (
          <>
            <p style={{ color: 'var(--fg-dim)' }}>Checked: {new Date(pipeline.checkedAt).toLocaleString()}</p>
            <div className="row">
              <div className="card" style={{ flex: 1 }}>
                <strong>Ingest stuck</strong>
                <div>{pipeline.stuck.ingestClassifying}</div>
              </div>
              <div className="card" style={{ flex: 1 }}>
                <strong>Userbot commands stuck</strong>
                <div>{pipeline.stuck.userbotCommands}</div>
              </div>
              <div className="card" style={{ flex: 1 }}>
                <strong>Recalc jobs stuck</strong>
                <div>{pipeline.stuck.recalcJobs}</div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Runs</h2>
          <button className="ghost" onClick={() => void refreshRuns()}>
            Refresh
          </button>
        </div>
        {runs.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>No diagnostic runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Cases</th>
                <th>Started</th>
                <th>Summary</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.status}</td>
                  <td>{row.caseCount}</td>
                  <td>{new Date(row.startedAt).toLocaleString()}</td>
                  <td>{row.summary ?? row.error ?? '—'}</td>
                  <td>
                    <button className="ghost" onClick={() => void openRun(row.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {detail && (
        <div className="card">
          <h2>Run detail: {detail.id}</h2>
          <p>
            status={detail.status} · cases={detail.caseCount}
          </p>
          <h3>Cases</h3>
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Status</th>
                <th>Title</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {detail.cases.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.status}</td>
                  <td>{row.title ?? '—'}</td>
                  <td>
                    {row.chatId ?? '—'} / {row.messageId ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Model results</h3>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Status</th>
                <th>Case</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {detail.modelResults.map((row) => (
                <tr key={row.id}>
                  <td>{row.model}</td>
                  <td>{row.status}</td>
                  <td>{row.caseId}</td>
                  <td>{row.summary ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Step results</h3>
          {detail.stepResults.length === 0 ? (
            <p style={{ color: 'var(--fg-dim)' }}>No step-level diagnostics.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>At</th>
                  <th>Case</th>
                  <th>Step</th>
                  <th>Status</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {detail.stepResults.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.caseId}</td>
                    <td>{row.stepName}</td>
                    <td>{row.status}</td>
                    <td>{row.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>Logs</h3>
          <table>
            <thead>
              <tr>
                <th>At</th>
                <th>Level</th>
                <th>Category</th>
                <th>Message</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {detail.logs.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.level}</td>
                  <td>{row.category}</td>
                  <td>{row.message}</td>
                  <td>{row.payload ? row.payload.slice(0, 180) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
