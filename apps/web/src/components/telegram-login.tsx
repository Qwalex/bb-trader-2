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
 * Telegram Login Widget — вставляет официальный `<script src="telegram-widget.js">`
 * и ожидает колбэк на window.onTelegramAuth. Отправляем payload в `/api/auth/telegram`
 * (route-handler), который проксирует его в API (HMAC-проверка там).
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
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
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
