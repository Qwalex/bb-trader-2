'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    onTelegramAuth?: (user: unknown) => void;
  }
}

interface Props {
  botUsername: string;
  callbackUrl?: string;
}

/**
 * Telegram Login Widget — подгружает скрипт через `/api/telegram-widget` (серверный
 * fetch с telegram.org), чтобы клиент в сетях с блокировкой telegram.org получал JS
 * с вашего домена. В ответе применяется патч: иначе виджет строил бы iframe на
 * `/{origin}/embed/Bot` и отдавал 404. Колбэк: window.onTelegramAuth → POST `/api/auth/telegram` → API.
 */
export function TelegramLoginWidget({ botUsername, callbackUrl = '/' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    window.onTelegramAuth = async (user: unknown) => {
      try {
        const res = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(user),
        });
        if (!res.ok) {
          const body = await res.text();
          alert(`Login failed: ${res.status} ${body}`);
          return;
        }
        window.location.href = callbackUrl;
      } catch (e) {
        alert(`Login error: ${(e as Error).message}`);
      }
    };

    const script = document.createElement('script');
    script.src = '/api/telegram-widget';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      delete window.onTelegramAuth;
    };
  }, [botUsername, callbackUrl]);

  return <div ref={containerRef} />;
}
