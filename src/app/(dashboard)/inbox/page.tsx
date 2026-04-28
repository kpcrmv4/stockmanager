'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { Inbox, ClipboardCheck, Wine, Package, Repeat, Truck, ArrowRight, Loader2, RefreshCw, TrendingUp, AlertTriangle, Banknote, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils/cn';
import { formatThaiDate } from '@/lib/utils/format';

type Category = 'stock_explain' | 'bar_confirm' | 'customer_request' | 'borrow_approval' | 'transfer_confirm';

interface PendingItem {
  id: string;
  category: Category;
  store_id: string;
  store_name: string;
  comp_date?: string;
  reference_id?: string;
  count: number;
  href: string;
  preview?: string;
  created_at?: string;
}

interface StoreGroup {
  store_id: string;
  store_name: string;
  items: PendingItem[];
}

interface StoreStats {
  store_id: string;
  store_name: string;
  newDeposits: number;
  completedWithdrawals: number;
  activeDeposits: number;
  expiringSoon: number;
  newBorrows: number;
  pendingExplanations: number;
  commissionAmount: number;
}

interface DailySummary {
  /** ISO date label of the bar day (yesterday's calendar date in Bangkok) */
  dateLabel: string;
  newDeposits: number;
  completedWithdrawals: number;
  activeDeposits: number;
  expiringSoon: number;
  newBorrows: number;
  pendingExplanations: number;
  commissionAmount: number;
  perStore: StoreStats[];
}

const CATEGORY_META: Record<Category, { icon: typeof Inbox; titleKey: string; color: string }> = {
  stock_explain: { icon: ClipboardCheck, titleKey: 'inbox.stockExplain', color: 'amber' },
  bar_confirm: { icon: Wine, titleKey: 'inbox.barConfirm', color: 'emerald' },
  customer_request: { icon: Package, titleKey: 'inbox.customerRequest', color: 'green' },
  borrow_approval: { icon: Repeat, titleKey: 'inbox.borrowApproval', color: 'rose' },
  transfer_confirm: { icon: Truck, titleKey: 'inbox.transferConfirm', color: 'blue' },
};

export default function InboxPage() {
  const t = useTranslations();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  // Collapsed store cards — set of store_ids whose card is hidden.
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set());
  const toggleStoreCollapsed = useCallback((storeId: string) => {
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }, []);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const isOwner = user?.role === 'owner' || user?.role === 'accountant';
      if (!isOwner) {
        setItems([]);
        return;
      }

      // 1. All stores user can see (owner sees all, accountant sees all)
      const { data: stores } = await supabase
        .from('stores')
        .select('id, store_name, store_code, active')
        .eq('active', true)
        .order('store_name');
      const storeMap = new Map((stores || []).map((s) => [s.id, s.store_name as string]));

      // 2. Pending counts grouped per store/date.
      const [explainRes, barRes, custReqRes, borrowRes, transferRes] = await Promise.all([
        // Stock explanations awaiting owner approval — group by store + comp_date
        supabase
          .from('comparisons')
          .select('id, store_id, comp_date, product_name, product_code')
          .eq('status', 'explained')
          .order('comp_date', { ascending: false }),
        // Deposits awaiting bar confirm
        supabase
          .from('deposits')
          .select('id, store_id, deposit_code, customer_name, product_name, created_at')
          .eq('status', 'pending_confirm')
          .order('created_at', { ascending: false }),
        // LINE customer deposit requests
        supabase
          .from('deposit_requests')
          .select('id, store_id, customer_name, product_name, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        // Borrow requests awaiting approval (lender side)
        supabase
          .from('borrows')
          .select('id, to_store_id, borrow_code, created_at')
          .eq('status', 'pending_approval')
          .order('created_at', { ascending: false }),
        // Transfers awaiting receiver confirmation
        supabase
          .from('transfers')
          .select('id, to_store_id, product_name, quantity, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);

      const next: PendingItem[] = [];

      // Stock explanations — aggregate per (store_id, comp_date)
      const explainGroups = new Map<string, { store_id: string; comp_date: string; rows: typeof explainRes.data }>();
      for (const row of (explainRes.data || []) as Array<{ id: string; store_id: string; comp_date: string; product_name: string | null; product_code: string }>) {
        const key = `${row.store_id}__${row.comp_date}`;
        const g = explainGroups.get(key);
        if (g) g.rows!.push(row);
        else explainGroups.set(key, { store_id: row.store_id, comp_date: row.comp_date, rows: [row] });
      }
      for (const g of explainGroups.values()) {
        const preview = (g.rows || []).slice(0, 3).map((r) => r.product_name || r.product_code).join(', ');
        next.push({
          id: `stock_${g.store_id}_${g.comp_date}`,
          category: 'stock_explain',
          store_id: g.store_id,
          store_name: storeMap.get(g.store_id) || '-',
          comp_date: g.comp_date,
          count: g.rows?.length || 0,
          href: `/stock/approval?date=${g.comp_date}`,
          preview,
        });
      }

      for (const row of (barRes.data || []) as Array<{ id: string; store_id: string; deposit_code: string; customer_name: string; product_name: string; created_at: string }>) {
        next.push({
          id: `bar_${row.id}`,
          category: 'bar_confirm',
          store_id: row.store_id,
          store_name: storeMap.get(row.store_id) || '-',
          reference_id: row.deposit_code,
          count: 1,
          href: `/deposit?id=${row.id}`,
          preview: `${row.customer_name} — ${row.product_name}`,
          created_at: row.created_at,
        });
      }

      for (const row of (custReqRes.data || []) as Array<{ id: string; store_id: string; customer_name: string | null; product_name: string | null; created_at: string }>) {
        next.push({
          id: `req_${row.id}`,
          category: 'customer_request',
          store_id: row.store_id,
          store_name: storeMap.get(row.store_id) || '-',
          count: 1,
          href: `/deposit/requests`,
          preview: `${row.customer_name || ''} — ${row.product_name || ''}`,
          created_at: row.created_at,
        });
      }

      for (const row of (borrowRes.data || []) as Array<{ id: string; to_store_id: string; borrow_code: string | null; created_at: string }>) {
        next.push({
          id: `borrow_${row.id}`,
          category: 'borrow_approval',
          store_id: row.to_store_id,
          store_name: storeMap.get(row.to_store_id) || '-',
          reference_id: row.borrow_code || row.id.slice(0, 8),
          count: 1,
          href: `/borrow`,
          created_at: row.created_at,
        });
      }

      for (const row of (transferRes.data || []) as Array<{ id: string; to_store_id: string; product_name: string | null; quantity: number | null; created_at: string }>) {
        next.push({
          id: `transfer_${row.id}`,
          category: 'transfer_confirm',
          store_id: row.to_store_id,
          store_name: storeMap.get(row.to_store_id) || '-',
          count: 1,
          href: `/transfer`,
          preview: `${row.product_name || ''} ${row.quantity ? `× ${row.quantity}` : ''}`,
          created_at: row.created_at,
        });
      }

      setItems(next);
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  // Daily summary across all stores — uses the same "bar day" window
  // as the chat-room daily summary cron: 11:00 yesterday → 05:59 today
  // Bangkok time, so a late-night bar's stats land on the right day.
  const fetchSummary = useCallback(async () => {
    const supabase = createClient();
    const isPrivileged = user?.role === 'owner' || user?.role === 'accountant';
    if (!isPrivileged) {
      setSummary(null);
      return;
    }

    const now = new Date();
    const bangkokOffset = 7 * 60 * 60 * 1000;
    const bangkokNow = new Date(now.getTime() + bangkokOffset);

    const barStart = new Date(bangkokNow);
    barStart.setDate(barStart.getDate() - 1);
    barStart.setHours(11, 0, 0, 0);
    const barEnd = new Date(bangkokNow);
    barEnd.setHours(5, 59, 59, 999);

    const startUTC = new Date(barStart.getTime() - bangkokOffset).toISOString();
    const endUTC = new Date(barEnd.getTime() - bangkokOffset).toISOString();

    const yesterday = new Date(bangkokNow);
    yesterday.setDate(yesterday.getDate() - 1);
    // Use the same formatter as the rest of the app so the date reads
    // "26 เม.ย. 2569" everywhere instead of an ISO string here, locale-
    // formatted strings in other places.
    const dateLabel = formatThaiDate(yesterday);

    const in3Days = new Date(bangkokNow);
    in3Days.setDate(in3Days.getDate() + 3);
    const nowUTC = new Date(bangkokNow.getTime() - bangkokOffset).toISOString();
    const in3DaysUTC = new Date(in3Days.getTime() - bangkokOffset).toISOString();

    // Commission month window for "this calendar month"
    const monthStart = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), 1);
    const monthStartIso = monthStart.toISOString().slice(0, 10);

    // Pull rows (with store_id) instead of just counts so we can both
    // total across stores and break down per store in one round trip.
    const [storesRes, newDepositsRes, withdrawalsRes, activeDepositsRes, expiringSoonRes, newBorrowsRes, pendingExplanationsRes, commissionRes] = await Promise.all([
      supabase.from('stores').select('id, store_name').eq('active', true),
      supabase.from('deposits').select('id, store_id').gte('created_at', startUTC).lte('created_at', endUTC),
      supabase.from('withdrawals').select('id, store_id').eq('status', 'completed').gte('created_at', startUTC).lte('created_at', endUTC),
      supabase.from('deposits').select('id, store_id').eq('status', 'in_store'),
      supabase.from('deposits').select('id, store_id').eq('status', 'in_store').gt('expiry_date', nowUTC).lte('expiry_date', in3DaysUTC),
      supabase.from('borrows').select('id, from_store_id').gte('created_at', startUTC).lte('created_at', endUTC),
      supabase.from('comparisons').select('id, store_id').eq('status', 'pending'),
      supabase.from('commission_entries').select('store_id, net_amount').is('cancelled_at', null).gte('bill_date', monthStartIso),
    ]);

    const stores = (storesRes.data || []) as Array<{ id: string; store_name: string }>;
    // Initialise an empty StoreStats for every active store so the table
    // shows all branches even if some had zero activity.
    const perStoreMap = new Map<string, StoreStats>();
    for (const s of stores) {
      perStoreMap.set(s.id, {
        store_id: s.id,
        store_name: s.store_name,
        newDeposits: 0,
        completedWithdrawals: 0,
        activeDeposits: 0,
        expiringSoon: 0,
        newBorrows: 0,
        pendingExplanations: 0,
        commissionAmount: 0,
      });
    }
    const bumpStore = (sid: string | null | undefined, key: keyof Omit<StoreStats, 'store_id' | 'store_name'>, by = 1) => {
      if (!sid) return;
      const row = perStoreMap.get(sid);
      if (!row) return;
      (row[key] as number) += by;
    };

    for (const row of (newDepositsRes.data || []) as Array<{ store_id: string }>) bumpStore(row.store_id, 'newDeposits');
    for (const row of (withdrawalsRes.data || []) as Array<{ store_id: string }>) bumpStore(row.store_id, 'completedWithdrawals');
    for (const row of (activeDepositsRes.data || []) as Array<{ store_id: string }>) bumpStore(row.store_id, 'activeDeposits');
    for (const row of (expiringSoonRes.data || []) as Array<{ store_id: string }>) bumpStore(row.store_id, 'expiringSoon');
    for (const row of (newBorrowsRes.data || []) as Array<{ from_store_id: string }>) bumpStore(row.from_store_id, 'newBorrows');
    for (const row of (pendingExplanationsRes.data || []) as Array<{ store_id: string }>) bumpStore(row.store_id, 'pendingExplanations');
    for (const row of (commissionRes.data || []) as Array<{ store_id: string; net_amount: number | null }>) {
      bumpStore(row.store_id, 'commissionAmount', Number(row.net_amount) || 0);
    }

    const perStore = Array.from(perStoreMap.values()).sort((a, b) => a.store_name.localeCompare(b.store_name));
    const totals = perStore.reduce(
      (acc, s) => ({
        newDeposits: acc.newDeposits + s.newDeposits,
        completedWithdrawals: acc.completedWithdrawals + s.completedWithdrawals,
        activeDeposits: acc.activeDeposits + s.activeDeposits,
        expiringSoon: acc.expiringSoon + s.expiringSoon,
        newBorrows: acc.newBorrows + s.newBorrows,
        pendingExplanations: acc.pendingExplanations + s.pendingExplanations,
        commissionAmount: acc.commissionAmount + s.commissionAmount,
      }),
      { newDeposits: 0, completedWithdrawals: 0, activeDeposits: 0, expiringSoon: 0, newBorrows: 0, pendingExplanations: 0, commissionAmount: 0 },
    );

    setSummary({
      dateLabel,
      ...totals,
      perStore,
    });
  }, [user?.role]);

  // Hold the latest fetchers in refs so the realtime + interval
  // callbacks always invoke the current closure.
  const fetchPendingRef = useRef(fetchPending);
  const fetchSummaryRef = useRef(fetchSummary);
  useEffect(() => { fetchPendingRef.current = fetchPending; }, [fetchPending]);
  useEffect(() => { fetchSummaryRef.current = fetchSummary; }, [fetchSummary]);

  useEffect(() => {
    fetchPending();
    fetchSummary();
  }, [fetchPending, fetchSummary]);

  // Live updates:
  //   - Subscribe to Supabase Realtime on the five source tables.
  //     Any insert/update/delete fires a debounced refetch (~600ms)
  //     so the badge + table refresh inside ~1s of the staff action.
  //   - Polling fallback every 60s, paused while the tab is hidden
  //     so we don't burn quota on background tabs / sleeping devices.
  //   - Refetch on tab focus / visibilitychange to recover from
  //     dropped sockets.
  useEffect(() => {
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (document.hidden) return;
        fetchPendingRef.current();
        fetchSummaryRef.current();
      }, 600);
    };

    const channel = supabase
      .channel('inbox-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comparisons' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_requests' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrows' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_entries' }, debouncedRefetch)
      .subscribe();

    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchPendingRef.current();
      fetchSummaryRef.current();
    }, 60_000);

    const onFocusOrVisible = () => {
      if (document.hidden) return;
      fetchPendingRef.current();
      fetchSummaryRef.current();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  const totalCount = items.reduce((s, x) => s + x.count, 0);

  // Group: store → category → items
  const byStore = new Map<string, StoreGroup>();
  for (const item of items) {
    const g = byStore.get(item.store_id);
    if (g) g.items.push(item);
    else byStore.set(item.store_id, { store_id: item.store_id, store_name: item.store_name, items: [item] });
  }
  const storeGroups = Array.from(byStore.values()).sort((a, b) => a.store_name.localeCompare(b.store_name));

  const isPrivileged = user?.role === 'owner' || user?.role === 'accountant';

  if (!isPrivileged) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm dark:bg-gray-800">
          <Inbox className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('inbox.ownerOnly')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-6 w-6 text-fuchsia-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('inbox.title')}</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('inbox.subtitle')}</p>
        </div>
        <button
          onClick={() => { fetchPending(); fetchSummary(); }}
          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('inbox.refresh')}
        </button>
      </div>

      {/* Daily summary — same KPIs as the chat daily-summary cron, but
          rolled up across all stores so the owner sees one snapshot. */}
      {summary && (
        <Card padding="none">
          <CardHeader
            title={t('inbox.dailySummaryTitle')}
            description={t('inbox.dailySummaryDate', { date: summary.dateLabel })}
          />
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiTile
                color="emerald"
                icon={Wine}
                label={t('inbox.kpiNewDeposits')}
                value={summary.newDeposits}
              />
              <KpiTile
                color="blue"
                icon={Package}
                label={t('inbox.kpiCompletedWithdrawals')}
                value={summary.completedWithdrawals}
              />
              <KpiTile
                color="indigo"
                icon={TrendingUp}
                label={t('inbox.kpiActiveDeposits')}
                value={summary.activeDeposits}
              />
              <KpiTile
                color="amber"
                icon={AlertTriangle}
                label={t('inbox.kpiExpiringSoon')}
                value={summary.expiringSoon}
              />
              <KpiTile
                color="rose"
                icon={Repeat}
                label={t('inbox.kpiNewBorrows')}
                value={summary.newBorrows}
              />
              <KpiTile
                color="amber"
                icon={ClipboardCheck}
                label={t('inbox.kpiPendingExplanations')}
                value={summary.pendingExplanations}
              />
              <KpiTile
                color="emerald"
                icon={Banknote}
                label={t('inbox.kpiCommissionMonth')}
                value={summary.commissionAmount}
                format="currency"
              />
            </div>

            {/* Per-store breakdown — same KPI columns but per branch */}
            {summary.perStore.length > 1 && (
              <div className="mt-4 -mx-4 sm:-mx-5 overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-y border-gray-100 bg-gray-50/50 text-left text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400">
                      <th className="px-3 py-2 font-medium">{t('inbox.colStore')}</th>
                      <th className="px-2 py-2 text-right font-medium">{t('inbox.kpiNewDeposits')}</th>
                      <th className="px-2 py-2 text-right font-medium">{t('inbox.kpiCompletedWithdrawals')}</th>
                      <th className="px-2 py-2 text-right font-medium">{t('inbox.kpiActiveDeposits')}</th>
                      <th className="px-2 py-2 text-right font-medium">{t('inbox.kpiExpiringSoon')}</th>
                      <th className="px-2 py-2 text-right font-medium">{t('inbox.kpiNewBorrows')}</th>
                      <th className="px-2 py-2 text-right font-medium">{t('inbox.kpiPendingExplanations')}</th>
                      <th className="px-2 py-2 text-right font-medium">{t('inbox.kpiCommissionMonth')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700 dark:divide-gray-700 dark:text-gray-300">
                    {summary.perStore.map((s) => (
                      <tr key={s.store_id}>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{s.store_name}</td>
                        <td className="px-2 py-2 text-right">{s.newDeposits.toLocaleString('th-TH')}</td>
                        <td className="px-2 py-2 text-right">{s.completedWithdrawals.toLocaleString('th-TH')}</td>
                        <td className="px-2 py-2 text-right">{s.activeDeposits.toLocaleString('th-TH')}</td>
                        <td className={cn('px-2 py-2 text-right', s.expiringSoon > 0 && 'font-medium text-amber-600 dark:text-amber-400')}>{s.expiringSoon.toLocaleString('th-TH')}</td>
                        <td className="px-2 py-2 text-right">{s.newBorrows.toLocaleString('th-TH')}</td>
                        <td className={cn('px-2 py-2 text-right', s.pendingExplanations > 0 && 'font-medium text-amber-600 dark:text-amber-400')}>{s.pendingExplanations.toLocaleString('th-TH')}</td>
                        <td className="px-2 py-2 text-right">{s.commissionAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/50 font-bold text-gray-900 dark:border-gray-600 dark:bg-gray-800/30 dark:text-white">
                      <td className="px-3 py-2">{t('inbox.colTotal')}</td>
                      <td className="px-2 py-2 text-right">{summary.newDeposits.toLocaleString('th-TH')}</td>
                      <td className="px-2 py-2 text-right">{summary.completedWithdrawals.toLocaleString('th-TH')}</td>
                      <td className="px-2 py-2 text-right">{summary.activeDeposits.toLocaleString('th-TH')}</td>
                      <td className="px-2 py-2 text-right">{summary.expiringSoon.toLocaleString('th-TH')}</td>
                      <td className="px-2 py-2 text-right">{summary.newBorrows.toLocaleString('th-TH')}</td>
                      <td className="px-2 py-2 text-right">{summary.pendingExplanations.toLocaleString('th-TH')}</td>
                      <td className="px-2 py-2 text-right">{summary.commissionAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending-approvals header card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('inbox.todayPendingTotal')}</p>
              <p className="mt-0.5 text-2xl font-bold text-gray-900 dark:text-white">
                {totalCount}
              </p>
              <p className="text-xs text-gray-400">
                {t('inbox.acrossStores', { count: storeGroups.length })}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 text-right">
              {(['stock_explain', 'bar_confirm', 'customer_request', 'borrow_approval', 'transfer_confirm'] as Category[]).map((c) => {
                const total = items.filter((i) => i.category === c).reduce((s, x) => s + x.count, 0);
                if (total === 0) return null;
                const meta = CATEGORY_META[c];
                const Icon = meta.icon;
                return (
                  <div key={c} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                    <Icon className={cn('h-3.5 w-3.5', `text-${meta.color}-500`)} />
                    <span>{t(meta.titleKey)}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{total}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : storeGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">{t('inbox.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        storeGroups.map((g) => {
          const isCollapsed = collapsedStores.has(g.store_id);
          const totalCountForStore = g.items.reduce((s, x) => s + x.count, 0);
          return (
          <Card key={g.store_id} padding="none">
            <CardHeader
              title={g.store_name}
              description={t('inbox.storeStats', { count: totalCountForStore })}
              action={
                <button
                  type="button"
                  onClick={() => toggleStoreCollapsed(g.store_id)}
                  aria-label={isCollapsed ? t('inbox.expand') : t('inbox.collapse')}
                  title={isCollapsed ? t('inbox.expand') : t('inbox.collapse')}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
              }
            />
            {!isCollapsed && (
            <CardContent>
              <div className="space-y-1.5">
                {/* Group items by category */}
                {(['stock_explain', 'bar_confirm', 'customer_request', 'borrow_approval', 'transfer_confirm'] as Category[]).map((cat) => {
                  const catItems = g.items.filter((i) => i.category === cat);
                  if (catItems.length === 0) return null;
                  const meta = CATEGORY_META[cat];
                  const Icon = meta.icon;
                  return (
                    <div key={cat}>
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        <Icon className={cn('h-3.5 w-3.5', `text-${meta.color}-500`)} />
                        {t(meta.titleKey)}
                      </div>
                      <div className="space-y-1">
                        {catItems.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
                            className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 transition-colors hover:bg-gray-100 dark:border-gray-700/50 dark:bg-gray-800/40 dark:hover:bg-gray-700/40"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {item.comp_date
                                  ? t('inbox.dateLabel', { date: formatThaiDate(item.comp_date) })
                                  : item.reference_id
                                    ? `#${item.reference_id}`
                                    : item.preview || '-'}
                                {item.count > 1 && (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-medium text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">
                                    {item.count}
                                  </span>
                                )}
                              </p>
                              {item.comp_date && item.preview && (
                                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{item.preview}</p>
                              )}
                            </div>
                            <ArrowRight className="ml-2 h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
            )}
          </Card>
          );
        })
      )}
    </div>
  );
}

interface KpiTileProps {
  color: 'emerald' | 'blue' | 'indigo' | 'amber' | 'rose';
  icon: typeof Inbox;
  label: string;
  value: number;
  format?: 'count' | 'currency';
}

function KpiTile({ color, icon: Icon, label, value, format = 'count' }: KpiTileProps) {
  // Map to literal classes so Tailwind's JIT picks them up reliably.
  const palette = {
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', icon: 'text-indigo-600 dark:text-indigo-400' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400' },
    rose: { bg: 'bg-rose-50 dark:bg-rose-900/20', icon: 'text-rose-600 dark:text-rose-400' },
  }[color];
  const display = format === 'currency'
    ? value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : value.toLocaleString('th-TH');
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-700/50 dark:bg-gray-800/40">
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', palette.bg)}>
        <Icon className={cn('h-5 w-5', palette.icon)} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-lg font-bold leading-tight text-gray-900 dark:text-white">{display}</p>
      </div>
    </div>
  );
}
