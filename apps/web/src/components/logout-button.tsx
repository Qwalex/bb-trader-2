'use client';

export function LogoutButton() {
  async function onClick() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <button className="ghost" onClick={onClick}>
      Выйти
    </button>
  );
}
