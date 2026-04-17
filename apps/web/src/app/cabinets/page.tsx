import { redirect } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api';
import { TopNav } from '@/components/nav';
import { CabinetsManager } from './cabinets-manager';

export const dynamic = 'force-dynamic';

interface Cabinet {
  id: string;
  slug: string;
  displayName: string;
  network: 'mainnet' | 'testnet';
  enabled: boolean;
  hasBybitKey: boolean;
  bybitKeyVerifiedAt: string | null;
  bybitKeyLastError: string | null;
  createdAt: string;
}

export default async function CabinetsPage() {
  try {
    await apiFetch('/auth/me');
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) redirect('/login');
    throw e;
  }
  const cabinets = await apiFetch<Cabinet[]>('/cabinets');
  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Кабинеты</h1>
        <CabinetsManager initial={cabinets} />
      </div>
    </>
  );
}
