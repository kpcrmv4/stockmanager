'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Total number of items waiting for owner approval across all stores.
 *
 * Mirrors the categories surfaced on `/inbox`:
 *   - comparisons.status='explained'      (stock explanations)
 *   - deposits.status='pending_confirm'   (bar-side receive)
 *   - deposit_requests.status='pending'   (LINE customer requests)
 *   - borrows.status='pending_approval'   (lender approval)
 *   - transfers.status='pending'          (receiver confirm)
 *
 * Privileged-only (owner/accountant); other roles always get 0 so the
 * sidebar badge stays hidden for them.
 *
 * Re-fetches every `pollMs` (default 60s) and on tab focus so the
 * badge stays roughly up-to-date without a realtime subscription.
 */
export function useInboxCount(pollMs = 60_000): number {
  const { user } = useAuthStore();
  const [count, setCount] = useState(0);
  const isPrivileged = user?.role === 'owner' || user?.role === 'accountant';

  useEffect(() => {
    if (!isPrivileged) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const supabase = createClient();

    const fetchCount = async () => {
      const [explainRes, barRes, custReqRes, borrowRes, transferRes] = await Promise.all([
        supabase.from('comparisons').select('id', { count: 'exact', head: true }).eq('status', 'explained'),
        supabase.from('deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending_confirm'),
        supabase.from('deposit_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('borrows').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('transfers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      if (cancelled) return;
      const total =
        (explainRes.count || 0)
        + (barRes.count || 0)
        + (custReqRes.count || 0)
        + (borrowRes.count || 0)
        + (transferRes.count || 0);
      setCount(total);
    };

    fetchCount();
    const interval = setInterval(fetchCount, pollMs);
    const onFocus = () => fetchCount();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isPrivileged, pollMs]);

  return count;
}
