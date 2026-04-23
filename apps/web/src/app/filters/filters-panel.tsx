'use client';

import { useMemo, useState } from 'react';
import { CLASSIFICATIONS } from '@repo/shared-ts/enums';

type FilterKind = 'signal' | 'close' | 'result' | 'reentry' | 'ignore';

interface FilterPattern {
  id: string;
  groupName: string;
  kind: FilterKind;
  pattern: string;
  requiresQuote: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FilterExample {
  id: string;
  groupName: string;
  kind: FilterKind;
  example: string;
  requiresQuote: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const KINDS = CLASSIFICATIONS as readonly FilterKind[];

export function FiltersPanel({
  initialGroups,
  initialPatterns,
  initialExamples,
}: {
  initialGroups: string[];
  initialPatterns: FilterPattern[];
  initialExamples: FilterExample[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [patterns, setPatterns] = useState(initialPatterns);
  const [examples, setExamples] = useState(initialExamples);
  const [groupName, setGroupName] = useState(initialGroups[0] ?? '');
  const [kind, setKind] = useState<FilterKind>('signal');
  const [pattern, setPattern] = useState('');
  const [example, setExample] = useState('');
  const [requiresQuote, setRequiresQuote] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const shownPatterns = useMemo(
    () => (groupName ? patterns.filter((p) => p.groupName === groupName) : patterns),
    [patterns, groupName],
  );
  const shownExamples = useMemo(
    () => (groupName ? examples.filter((e) => e.groupName === groupName) : examples),
    [examples, groupName],
  );

  async function refetch() {
    const [g, p, e] = await Promise.all([
      fetch('/api/proxy/filters/groups').then((r) => r.json()),
      fetch('/api/proxy/filters/patterns').then((r) => r.json()),
      fetch('/api/proxy/filters/examples').then((r) => r.json()),
    ]);
    setGroups(g as string[]);
    setPatterns(p as FilterPattern[]);
    setExamples(e as FilterExample[]);
  }

  async function onGeneratePattern() {
    if (!groupName.trim() || !example.trim()) {
      setMsg('Нужны groupName и example для генерации паттерна.');
      return;
    }
    const res = await fetch('/api/proxy/filters/patterns/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        groupName: groupName.trim(),
        kind,
        example: example.trim(),
        requiresQuote,
      }),
    });
    if (!res.ok) {
      setMsg(`Ошибка генерации: ${await res.text()}`);
      return;
    }
    const data = (await res.json()) as { pattern: string };
    setPattern(data.pattern);
    setMsg('Паттерн сгенерирован. Проверьте и сохраните.');
  }

  async function onCreatePattern(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/proxy/filters/patterns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        groupName: groupName.trim(),
        kind,
        pattern: pattern.trim(),
        requiresQuote,
        enabled: true,
      }),
    });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    setPattern('');
    await refetch();
    setMsg('Паттерн добавлен.');
  }

  async function onCreateExample(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/proxy/filters/examples', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        groupName: groupName.trim(),
        kind,
        example: example.trim(),
        requiresQuote,
        enabled: true,
      }),
    });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    setExample('');
    await refetch();
    setMsg('Пример добавлен.');
  }

  async function togglePatternEnabled(row: FilterPattern) {
    const res = await fetch(`/api/proxy/filters/patterns/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    await refetch();
  }

  async function toggleExampleEnabled(row: FilterExample) {
    const res = await fetch(`/api/proxy/filters/examples/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    await refetch();
  }

  async function removePattern(id: string) {
    const res = await fetch(`/api/proxy/filters/patterns/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    await refetch();
  }

  async function removeExample(id: string) {
    const res = await fetch(`/api/proxy/filters/examples/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setMsg(`Ошибка: ${await res.text()}`);
      return;
    }
    await refetch();
  }

  return (
    <>
      {msg && <div className="card">{msg}</div>}

      <div className="card">
        <h2>Новый фильтр</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <label>
            Group
            <input
              list="filter-groups"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Источник или chatId"
            />
            <datalist id="filter-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as FilterKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 20 }}>
            <input
              type="checkbox"
              checked={requiresQuote}
              onChange={(e) => setRequiresQuote(e.target.checked)}
            />
            requires reply/quote
          </label>
        </div>
        <form onSubmit={onCreatePattern} className="col" style={{ marginBottom: 10 }}>
          <label>
            Pattern (regex)
            <input value={pattern} onChange={(e) => setPattern(e.target.value)} required />
          </label>
          <div className="row">
            <button type="submit">Добавить паттерн</button>
            <button type="button" className="ghost" onClick={() => void onGeneratePattern()}>
              Сгенерировать из примера
            </button>
          </div>
        </form>
        <form onSubmit={onCreateExample} className="col">
          <label>
            Example
            <textarea value={example} onChange={(e) => setExample(e.target.value)} required />
          </label>
          <div>
            <button type="submit">Добавить пример</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Patterns</h2>
        {shownPatterns.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>Нет паттернов.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Kind</th>
                <th>Pattern</th>
                <th>Quote</th>
                <th>Enabled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shownPatterns.map((p) => (
                <tr key={p.id}>
                  <td>{p.groupName}</td>
                  <td>{p.kind}</td>
                  <td>
                    <code>{p.pattern}</code>
                  </td>
                  <td>{p.requiresQuote ? 'yes' : 'no'}</td>
                  <td>
                    <button className="ghost" onClick={() => void togglePatternEnabled(p)}>
                      {p.enabled ? 'on' : 'off'}
                    </button>
                  </td>
                  <td>
                    <button className="danger" onClick={() => void removePattern(p.id)}>
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
        <h2>Examples</h2>
        {shownExamples.length === 0 ? (
          <p style={{ color: 'var(--fg-dim)' }}>Нет примеров.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Kind</th>
                <th>Example</th>
                <th>Quote</th>
                <th>Enabled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shownExamples.map((e) => (
                <tr key={e.id}>
                  <td>{e.groupName}</td>
                  <td>{e.kind}</td>
                  <td>{e.example.slice(0, 120)}</td>
                  <td>{e.requiresQuote ? 'yes' : 'no'}</td>
                  <td>
                    <button className="ghost" onClick={() => void toggleExampleEnabled(e)}>
                      {e.enabled ? 'on' : 'off'}
                    </button>
                  </td>
                  <td>
                    <button className="danger" onClick={() => void removeExample(e.id)}>
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
