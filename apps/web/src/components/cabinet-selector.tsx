'use client';

import { useState, useTransition } from 'react';

interface Cabinet {
  id: string;
  slug: string;
  displayName: string;
  enabled: boolean;
}

interface Props {
  cabinets: Cabinet[];
  activeId: string | null;
}

export function CabinetSelector({ cabinets, activeId }: Props) {
  const [selected, setSelected] = useState(activeId ?? '');
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setSelected(next);
    startTransition(async () => {
      await fetch('/api/proxy/auth/active-cabinet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cabinetId: next || null }),
      });
      window.location.reload();
    });
  }

  if (cabinets.length === 0) {
    return (
      <p style={{ color: 'var(--fg-dim)' }}>
        Кабинетов ещё нет. <a href="/cabinets">Создать</a>.
      </p>
    );
  }

  return (
    <select value={selected} onChange={onChange} disabled={pending}>
      <option value="">— выберите —</option>
      {cabinets.map((c) => (
        <option key={c.id} value={c.id}>
          {c.displayName} ({c.slug}) {c.enabled ? '' : '[disabled]'}
        </option>
      ))}
    </select>
  );
}
