'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { Inbox, ClipboardCheck, Wine, Package, Repeat, Truck, ArrowRight, Loader2, RefreshCw, TrendingUp, AlertTriangle, Banknote } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils/cn';

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
          href: `/deposit/${row.id}`,
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
    const dateLabel = yesterday.toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

    const in3Days = new Date(bangkokNow);
    in3Days.setDate(in3Days.getDate() + 3);
    const nowUTC = new Date(bangkokNow.getTime() - bangkokOffset).toISOString();
    const in3DaysUTC = new Date(in3Days.getTime() - bangkokOffset).toISOString();

    // Commission month window for "this calendar month"
    const monthStart = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), 1);
    const monthStartIso = monthStart.toISOString().slice(0, 10);

    const [
      newDepositsRes,
      withdrawalsRes,
      activeDepositsRes,
      expiringSoonRes,
      newBorrowsRes,
      pendingExplanationsRes,
      commissionRes,
    ] = await Promise.all([
      supabase.from('deposits').select('id', { count: 'exact', head: true })
        .gte('created_at', startUTC).lte('created_at', endUTC),
      supabase.from('withdrawals').select('id', { count: 'exact', head: true })
        .eq('status', 'completed').gte('created_at', startUTC).lte('created_at', endUTC),
      supabase.from('deposits').select('id', { count: 'exact', head: true })
        .eq('status', 'in_store'),
      supabase.from('deposits').select('id', { count: 'exact', head: true })
        .eq('status', 'in_store').gt('expiry_date', nowUTC).lte('expiry_date', in3DaysUTC),
      supabase.from('borrows').select('id', { count: 'exact', head: true })
        .gte('created_at', startUTC).lte('created_at', endUTC),
      supabase.from('comparisons').select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('commission_entries').select('net_amount')
        .is('cancelled_at', null).gte('bill_date', monthStartIso),
    ]);

    const commissionAmount = (commissionRes.data || []).reduce(
      (s: number, r: { net_amount: number | null }) => s + (Number(r.net_amount) || 0),
      0,
    );

    setSummary({
      dateLabel,
      newDeposits: newDepositsRes.count || 0,
      completedWithdrawals: withdrawalsRes.count || 0,
      activeDeposits: activeDepositsRes.count || 0,
      expiringSoon: expiringSoonRes.count || 0,
      newBorrows: newBorrowsRes.count || 0,
      pendingExplanations: pendingExplanationsRes.count || 0,
      commissionAmount,
    });
  }, [user?.role]);

  useEffect(() => {
    fetchPending();
    fetchSummary();
  }, [fetchPending, fetchSummary]);

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
        storeGroups.map((g) => (
          <Card key={g.store_id} padding="none">
            <CardHeader
              title={g.store_name}
              description={t('inbox.storeStats', { count: g.items.reduce((s, x) => s + x.count, 0) })}
            />
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
                                  ? t('inbox.dateLabel', { date: item.comp_date })
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
          </Card>
        ))
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
