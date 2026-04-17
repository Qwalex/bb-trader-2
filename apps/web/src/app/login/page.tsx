import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/api';
import { TelegramLoginWidget } from '@/components/telegram-login';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const authed = await isAuthed();
  if (authed) redirect('/');

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME || 'bb-trader';

  return (
    <div className="container">
      <h1>{brand}</h1>
      <p style={{ color: 'var(--fg-dim)' }}>
        Войдите через Telegram. Первый вход с ID, равным{' '}
        <code>INITIAL_ADMIN_TELEGRAM_ID</code>, автоматически становится admin.
      </p>
      <div className="card">
        {botUsername ? (
          <TelegramLoginWidget botUsername={botUsername} />
        ) : (
          <p>
            <strong>NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</strong> не задан. Укажите имя бота в env
            и перезапустите web-сервис.
          </p>
        )}
      </div>
    </div>
  );
}
