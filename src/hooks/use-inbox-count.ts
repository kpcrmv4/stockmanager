'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Total number of items waiting for owner approval across all stores.
 *
 * Mirrors the categories surfaced on `/inbox`:
 *   - comparisons.status='explained'         (stock explanations)
 *   - deposits.status='pending_confirm'      (bar-side receive)
 *   - deposits.status='pending_staff'        (LIFF customer requests)
 *   - borrows.status='pending_approval'      (lender approval)
 *   - transfers.status='pending'             (receiver confirm)
 *
 * Privileged-only (owner/accountant); other roles always get 0 so the
 * sidebar badge stays hidden for them.
 *
 * Update strategy:
 *   1. Supabase Realtime: subscribe to changes on the five source tables
 *      and refetch (debounced ~600ms) when an event arrives, so the badge
 *      updates within ~1 second of staff submitting an explanation.
 *   2. Polling fallback: every `pollMs` (default 60s) AND on tab focus,
 *      in case the realtime channel hiccups or a deploy invalidates the
 *      socket. Poll is paused while the tab is hidden so we don't burn
 *      quota when the user has the page open in a background tab.
 */
export function useInboxCount(pollMs = 60_000): number {
  const { user } = useAuthStore();
  const [count, setCount] = useState(0);
  const isPrivileged = user?.role === 'owner' || user?.role === 'accountant';
  const fetchRef = useRef<() => void>(() => {});

  const fetchCount = useCallback(async () => {
    if (!isPrivileged) {
      setCount(0);
      return;
    }
    const supabase = createClient();
    const [explainRes, barRes, custReqRes, borrowRes, transferRes] = await Promise.all([
      supabase.from('comparisons').select('id', { count: 'exact', head: true }).eq('status', 'explained'),
      supabase.from('deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending_confirm'),
      supabase.from('deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending_staff'),
      supabase.from('borrows').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
      supabase.from('transfers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    const total =
      (explainRes.count || 0)
      + (barRes.count || 0)
      + (custReqRes.count || 0)
      + (borrowRes.count || 0)
      + (transferRes.count || 0);
    setCount(total);
  }, [isPrivileged]);

  // Keep a ref to the latest fetcher so the realtime + interval callbacks
  // always call the current closure (avoids stale `isPrivileged`).
  useEffect(() => { fetchRef.current = fetchCount; }, [fetchCount]);

  useEffect(() => {
    if (!isPrivileged) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!document.hidden) fetchRef.current();
      }, 600);
    };

    fetchRef.current();

    // ── Realtime: refetch on any change to the five source tables ──
    const supabase = createClient();
    const channel = supabase
      .channel('inbox-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comparisons' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrows' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, debouncedFetch)
      .subscribe();

    // ── Polling fallback: skip when the tab is hidden ──
    const interval = setInterval(() => {
      if (!document.hidden) fetchRef.current();
    }, pollMs);

    // ── Refetch on focus / when the tab becomes visible again ──
    const onFocus = () => {
      if (!document.hidden) fetchRef.current();
    };
    const onVisibility = () => {
      if (!document.hidden) fetchRef.current();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, [isPrivileged, pollMs]);

  return count;
}
