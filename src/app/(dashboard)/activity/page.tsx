'use client';

import { useTranslations } from 'next-intl';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, Tabs, EmptyState, toast } from '@/components/ui';
import { formatThaiDate, formatThaiDateTime, formatNumber } from '@/lib/utils/format';
import { todayBangkok, formatTimeBangkok, daysFromNowISO, startOfTodayBangkokISO, endOfTodayBangkokISO } from '@/lib/utils/date';
import { AUDIT_ACTION_LABELS } from '@/lib/audit';
import type { AuditLog } from '@/types/database';
import {
  Loader2,
  RefreshCw,
  CalendarDays,
  Wine,
  ClipboardCheck,
  Repeat,
  Inbox,
  Store as StoreIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  store_code: string;
  store_name: string;
}

interface StoreSummary {
  storeId: string;
  storeName: string;
  storeCode: string;
  deposit: {
    pendingConfirm: number;
    pendingWithdrawal: number;
    inStore: number;
    expiringSoon: number;
  };
  stock: {
    countedToday: number;
    pendingExplanation: number;
    pendingApproval: number;
    overThreshold: number;
  };
  borrow: {
    outgoing: number;        // ขอยืม (from_store = this store)
    incoming: number;        // ให้ยืม (to_store = this store)
    pendingApproval: number; // รออนุมัติ
    approved: number;        // อนุมัติแล้ว
    posAdjusting: number;    // รอตัดสต๊อก
  };
  todayActivityCount: number;
}

interface AuditLogEntry extends AuditLog {
  profile?: {
    display_name: string | null;
    username: string;
    role: string;
  } | null;
  store?: {
    store_name: string;
    store_code: string;
  } | null;
}

type FilterCategory = 'all' | 'stock' | 'deposit' | 'borrow' | 'customer' | 'system';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_CATEGORIES: Record<FilterCategory, string[]> = {
  all: [],
  stock: [
    'STOCK_COUNT_SAVED',
    'STOCK_COUNT_RESET',
    'STOCK_EXPLANATION_SUBMITTED',
    'STOCK_EXPLANATION_BATCH',
    'STOCK_APPROVED',
    'STOCK_REJECTED',
    'STOCK_BATCH_APPROVED',
    'STOCK_BATCH_REJECTED',
    'STOCK_COMPARISON_GENERATED',
    'STOCK_TXT_UPLOADED',
    'AUTO_ADD_PRODUCT',
    'AUTO_DEACTIVATE',
    'AUTO_REACTIVATE',
    'PRODUCT_CREATED',
    'PRODUCT_UPDATED',
    'PRODUCT_TOGGLED',
    'PRODUCT_DELETED',
  ],
  deposit: [
    'DEPOSIT_CREATED',
    'DEPOSIT_REQUEST_APPROVED',
    'DEPOSIT_REQUEST_REJECTED',
    'DEPOSIT_STATUS_CHANGED',
    'WITHDRAWAL_COMPLETED',
    'WITHDRAWAL_REJECTED',
    'WITHDRAWAL_REQUESTED',
    'TRANSFER_CREATED',
    'TRANSFER_CONFIRMED',
    'TRANSFER_REJECTED',
  ],
  borrow: [
    'BORROW_REQUESTED',
    'BORROW_APPROVED',
    'BORROW_REJECTED',
    'BORROW_POS_CONFIRMED',
    'BORROW_COMPLETED',
  ],
  customer: [
    'CUSTOMER_DEPOSIT_REQUEST',
    'CUSTOMER_WITHDRAWAL_REQUEST',
    'CUSTOMER_INQUIRY',
  ],
  system: [
    'CRON_DAILY_REMINDER_SENT',
    'CRON_EXPIRY_CHECK',
    'CRON_DEPOSIT_EXPIRED',
    'CRON_FOLLOW_UP_SENT',
    'AUDIT_LOG_CLEANUP',
  ],
};

const FILTER_LABEL_KEYS: Record<FilterCategory, string> = {
  all: 'filterAll',
  stock: 'filterStock',
  deposit: 'filterDeposit',
  borrow: 'filterBorrow',
  customer: 'filterCustomer',
  system: 'filterSystem',
};

const STORE_BORDER_COLORS = [
  'border-l-indigo-500',
  'border-l-emerald-500',
  'border-l-blue-500',
  'border-l-violet-500',
  'border-l-amber-500',
  'border-l-rose-500',
  'border-l-teal-500',
  'border-l-orange-500',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayDateString(): string {
  return todayBangkok();
}

function getRelativeTime(dateStr: string, t: (key: string, values?: any) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return t('justNow');
  if (diffMins < 60) return t('minutesAgo', { count: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t('hoursAgo', { count: diffHours });
  return formatThaiDateTime(dateStr);
}

function formatTime(dateStr: string): string {
  return formatTimeBangkok(dateStr);
}

function getActionDotColor(action_type: string): string {
  const config = AUDIT_ACTION_LABELS[action_type];
  if (!config) return 'bg-gray-400';
  switch (config.color) {
    case 'emerald':
      return 'bg-emerald-500';
    case 'red':
      return 'bg-red-500';
    case 'amber':
      return 'bg-amber-500';
    case 'blue':
      return 'bg-blue-500';
    case 'indigo':
      return 'bg-indigo-500';
    case 'violet':
      return 'bg-violet-500';
    case 'green':
      return 'bg-green-500';
    case 'teal':
      return 'bg-teal-500';
    case 'gray':
      return 'bg-gray-400';
    default:
      return 'bg-gray-400';
  }
}

function getActionLabel(action_type: string): string {
  const config = AUDIT_ACTION_LABELS[action_type];
  return config?.label || action_type;
}

function getActorLabel(entry: AuditLogEntry, t: (key: string) => string): string {
  if (entry.action_type.startsWith('CUSTOMER_')) {
    return t('actorCustomer');
  }
  if (!entry.changed_by) {
    return t('actorSystem');
  }
  if (entry.profile) {
    const name = entry.profile.display_name || entry.profile.username;
    const role = entry.profile.role;
    return `${name} (${role})`;
  }
  return t('actorUnknown');
}

function getEntryDetails(entry: AuditLogEntry, t: (key: string, values?: any) => string): string {
  const newVal = entry.new_value as Record<string, unknown> | null;
  const oldVal = entry.old_value as Record<string, unknown> | null;
  const action = entry.action_type;

  // --- Product toggle: show product name + on/off status ---
  if (action === 'PRODUCT_TOGGLED') {
    const val = newVal || oldVal;
    const productName = val?.product_name ? String(val.product_name) : '';
    const productCode = val?.product_code ? String(val.product_code) : '';
    const newActive = newVal?.active;
    const statusText = newActive === true ? t('detailActivated') : newActive === false ? t('detailDeactivated') : '';
    const parts: string[] = [];
    if (productName) parts.push(productName);
    if (productCode) parts.push(`(${productCode})`);
    if (statusText) parts.push(`→ ${statusText}`);
    return parts.join(' ');
  }

  // --- Product created/updated/deleted: show product name + code ---
  if (action === 'PRODUCT_CREATED' || action === 'PRODUCT_UPDATED' || action === 'PRODUCT_DELETED') {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.product_name) parts.push(String(val.product_name));
    if (val?.product_code) parts.push(`(${String(val.product_code)})`);
    return parts.join(' ');
  }

  // --- Auto product actions: show product info ---
  if (action === 'AUTO_ADD_PRODUCT' || action === 'AUTO_DEACTIVATE' || action === 'AUTO_REACTIVATE') {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.product_name) parts.push(String(val.product_name));
    if (val?.product_code) parts.push(`(${String(val.product_code)})`);
    return parts.join(' ');
  }

  // --- Deposit actions: show deposit code + customer + product ---
  if (action.startsWith('DEPOSIT_') || action === 'WITHDRAWAL_COMPLETED' || action === 'WITHDRAWAL_REJECTED' || action === 'WITHDRAWAL_REQUESTED') {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.deposit_code) parts.push(String(val.deposit_code));
    if (val?.customer_name) parts.push(String(val.customer_name));
    if (val?.product_name) parts.push(String(val.product_name));
    if (val?.actual_qty != null) parts.push(t('detailQty', { qty: val.actual_qty }));
    if (val?.quantity != null && !val?.actual_qty) parts.push(t('detailQty', { qty: val.quantity }));
    if (val?.reason) parts.push(t('detailReason', { reason: String(val.reason) }));
    return parts.join(' — ');
  }

  // --- Customer actions: show customer + product ---
  if (action.startsWith('CUSTOMER_')) {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.customer_name) parts.push(String(val.customer_name));
    if (val?.product_name) parts.push(String(val.product_name));
    return parts.join(' — ');
  }

  // --- Transfer actions: show transfer info ---
  if (action.startsWith('TRANSFER_')) {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.transfer_code) parts.push(String(val.transfer_code));
    if (val?.product_name) parts.push(String(val.product_name));
    return parts.join(' — ');
  }

  // --- Borrow actions: show items ---
  if (action.startsWith('BORROW_')) {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.items && Array.isArray(val.items)) {
      const names = (val.items as Array<Record<string, unknown>>)
        .map((item) => item.product_name)
        .filter(Boolean)
        .slice(0, 3);
      if (names.length > 0) parts.push(names.join(', '));
    }
    if (val?.product_name) parts.push(String(val.product_name));
    if (val?.total_items && typeof val.total_items === 'number')
      parts.push(t('detailItems', { count: val.total_items }));
    return parts.join(' — ');
  }

  // --- Stock explanation/approval: show product + difference ---
  if (action === 'STOCK_EXPLANATION_SUBMITTED' || action === 'STOCK_APPROVED' || action === 'STOCK_REJECTED') {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.product_name) parts.push(String(val.product_name));
    if (val?.product_code) parts.push(`(${String(val.product_code)})`);
    if (val?.difference != null) {
      const diff = Number(val.difference);
      parts.push(t('detailDifference', { diff: `${diff > 0 ? '+' : ''}${diff}` }));
    }
    return parts.join(' ');
  }

  // --- Stock batch actions: show count + product list ---
  if (action === 'STOCK_BATCH_APPROVED' || action === 'STOCK_BATCH_REJECTED' || action === 'STOCK_EXPLANATION_BATCH') {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.count && typeof val.count === 'number')
      parts.push(t('detailItems', { count: val.count }));
    if (val?.submitted_count && typeof val.submitted_count === 'number')
      parts.push(t('detailItems', { count: val.submitted_count }));
    if (val?.products && Array.isArray(val.products)) {
      const names = (val.products as string[]).slice(0, 3);
      if (names.length > 0) parts.push(names.join(', '));
      if ((val.products as string[]).length > 3)
        parts.push(`+${(val.products as string[]).length - 3}`);
    }
    return parts.join(' — ');
  }

  // --- Stock count saved: per-item vs batch ---
  if (action === 'STOCK_COUNT_SAVED') {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.type === 'per_item') {
      // Per-item: show product name + count value
      if (val?.product_name) parts.push(String(val.product_name));
      if (val?.product_code) parts.push(`(${String(val.product_code)})`);
      if (val?.count_quantity != null) parts.push(`= ${val.count_quantity}`);
    } else {
      // Batch: show items count + product list
      if (val?.items_count && typeof val.items_count === 'number')
        parts.push(t('detailItems', { count: val.items_count }));
      if (val?.type === 'supplementary') parts.push(t('detailSupplementary'));
      if (val?.products && Array.isArray(val.products)) {
        const names = (val.products as string[]).slice(0, 3);
        if (names.length > 0) parts.push(names.join(', '));
        if ((val.products as string[]).length > 3)
          parts.push(`+${(val.products as string[]).length - 3}`);
      }
    }
    return parts.join(' ');
  }

  // --- Other stock actions: show count/batch info ---
  if (action.startsWith('STOCK_')) {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.product_name) parts.push(String(val.product_name));
    if (val?.product_code) parts.push(`(${String(val.product_code)})`);
    if (val?.items_count && typeof val.items_count === 'number')
      parts.push(t('detailItems', { count: val.items_count }));
    if (val?.count && typeof val.count === 'number')
      parts.push(t('detailItems', { count: val.count }));
    if (val?.total_items && typeof val.total_items === 'number')
      parts.push(t('detailItems', { count: val.total_items }));
    return parts.join(' ');
  }

  // --- Audit log cleanup: show deleted count + retention ---
  if (action === 'AUDIT_LOG_CLEANUP') {
    const val = newVal || oldVal;
    const parts: string[] = [];
    if (val?.deleted_count != null) parts.push(t('detailDeleted', { count: val.deleted_count }));
    if (val?.retention_days != null) parts.push(t('detailRetention', { days: val.retention_days }));
    return parts.join(' ');
  }

  // --- Generic fallback: try common fields ---
  if (newVal) {
    const parts: string[] = [];
    if (newVal.deposit_code) parts.push(String(newVal.deposit_code));
    if (newVal.customer_name) parts.push(String(newVal.customer_name));
    if (newVal.product_name) parts.push(String(newVal.product_name));
    if (newVal.product_code) parts.push(`(${String(newVal.product_code)})`);
    if (newVal.count && typeof newVal.count === 'number')
      parts.push(t('detailItems', { count: newVal.count }));
    if (newVal.total_items && typeof newVal.total_items === 'number')
      parts.push(t('detailItems', { count: newVal.total_items }));
    if (parts.length > 0) return parts.join(' — ');
  }
  if (oldVal) {
    const parts: string[] = [];
    if (oldVal.deposit_code) parts.push(String(oldVal.deposit_code));
    if (oldVal.product_name) parts.push(String(oldVal.product_name));
    if (oldVal.product_code) parts.push(`(${String(oldVal.product_code)})`);
    if (parts.length > 0) return parts.join(' — ');
  }

  return '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActivityPage() {
  const t = useTranslations('activity');
  // State
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [storeSummaries, setStoreSummaries] = useState<StoreSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [loadingLogs, setLoadingLogs] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch stores
  // -------------------------------------------------------------------------

  const fetchStores = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: storesData, error } = await supabase
        .from('stores')
        .select('id, store_code, store_name')
        .eq('active', true)
        .order('store_code');

      if (error) throw error;
      setStores(storesData || []);
      return storesData || [];
    } catch (error) {
      console.error('Error fetching stores:', error);
      toast({
        type: 'error',
        title: t('errorOccurred'),
        message: t('cannotLoadBranches'),
      });
      return [];
    }
  }, []);

  // -------------------------------------------------------------------------
  // Fetch store summaries
  // -------------------------------------------------------------------------

  const fetchStoreSummaries = useCallback(
    async (storeList: StoreOption[], date: string) => {
      try {
        const supabase = createClient();
        const todayStart = `${date}T00:00:00`;
        const todayEnd = `${date}T23:59:59`;

        const expiryDateISO = daysFromNowISO(7);
        const nowISO = new Date().toISOString();

        const summaries: StoreSummary[] = await Promise.all(
          storeList.map(async (store) => {
            const [
              pendingConfirmRes,
              inStoreRes,
              pendingWithdrawalRes,
              expiringSoonRes,
              countedTodayRes,
              pendingExplanationRes,
              pendingApprovalRes,
              activityCountRes,
              borrowOutgoingRes,
              borrowIncomingRes,
              borrowPendingRes,
              borrowApprovedRes,
              borrowPosAdjustingRes,
            ] = await Promise.all([
              // Deposit: pending_confirm
              supabase
                .from('deposits')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
                .eq('status', 'pending_confirm'),

              // Deposit: in_store
              supabase
                .from('deposits')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
                .eq('status', 'in_store'),

              // Deposit: pending_withdrawal
              supabase
                .from('deposits')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
                .eq('status', 'pending_withdrawal'),

              // Deposit: expiring within 7 days
              supabase
                .from('deposits')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
                .eq('status', 'in_store')
                .lte('expiry_date', expiryDateISO)
                .gte('expiry_date', nowISO),

              // Stock: counted today
              supabase
                .from('manual_counts')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
                .eq('count_date', date),

              // Stock: pending explanation
              supabase
                .from('comparisons')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
                .eq('status', 'pending'),

              // Stock: pending approval
              supabase
                .from('comparisons')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
                .eq('status', 'explained'),

              // Activity count today
              supabase
                .from('audit_logs')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
                .gte('created_at', todayStart)
                .lte('created_at', todayEnd),

              // Borrow: outgoing (ขอยืม — this store is borrower, active statuses)
              supabase
                .from('borrows')
                .select('*', { count: 'exact', head: true })
                .eq('from_store_id', store.id)
                .in('status', ['pending_approval', 'approved', 'pos_adjusting']),

              // Borrow: incoming (ให้ยืม — this store is lender, active statuses)
              supabase
                .from('borrows')
                .select('*', { count: 'exact', head: true })
                .eq('to_store_id', store.id)
                .in('status', ['pending_approval', 'approved', 'pos_adjusting']),

              // Borrow: pending approval
              supabase
                .from('borrows')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending_approval')
                .or(`from_store_id.eq.${store.id},to_store_id.eq.${store.id}`),

              // Borrow: approved
              supabase
                .from('borrows')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'approved')
                .or(`from_store_id.eq.${store.id},to_store_id.eq.${store.id}`),

              // Borrow: pos_adjusting (รอตัดสต๊อก)
              supabase
                .from('borrows')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pos_adjusting')
                .or(`from_store_id.eq.${store.id},to_store_id.eq.${store.id}`),
            ]);

            // Count comparisons with diff_percent exceeding threshold (e.g. abs > 10%)
            const { count: overThreshold } = await supabase
              .from('comparisons')
              .select('*', { count: 'exact', head: true })
              .eq('store_id', store.id)
              .eq('status', 'pending')
              .or('diff_percent.gt.10,diff_percent.lt.-10');

            return {
              storeId: store.id,
              storeName: store.store_name,
              storeCode: store.store_code,
              deposit: {
                pendingConfirm: pendingConfirmRes.count || 0,
                pendingWithdrawal: pendingWithdrawalRes.count || 0,
                inStore: inStoreRes.count || 0,
                expiringSoon: expiringSoonRes.count || 0,
              },
              stock: {
                countedToday: countedTodayRes.count || 0,
                pendingExplanation: pendingExplanationRes.count || 0,
                pendingApproval: pendingApprovalRes.count || 0,
                overThreshold: overThreshold || 0,
              },
              borrow: {
                outgoing: borrowOutgoingRes.count || 0,
                incoming: borrowIncomingRes.count || 0,
                pendingApproval: borrowPendingRes.count || 0,
                approved: borrowApprovedRes.count || 0,
                posAdjusting: borrowPosAdjustingRes.count || 0,
              },
              todayActivityCount: activityCountRes.count || 0,
            };
          })
        );

        setStoreSummaries(summaries);
      } catch (error) {
        console.error('Error fetching store summaries:', error);
        toast({
          type: 'error',
          title: t('errorOccurred'),
          message: t('cannotLoadBranchSummary'),
        });
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Fetch audit logs
  // -------------------------------------------------------------------------

  const fetchAuditLogs = useCallback(
    async (date: string, storeId: string) => {
      setLoadingLogs(true);
      try {
        const supabase = createClient();
        // If querying for today, use Bangkok-aware boundaries;
        // otherwise, use the selected date string with T00/T23:59:59
        const todayStart = `${date}T00:00:00`;
        const todayEnd = `${date}T23:59:59`;

        let query = supabase
          .from('audit_logs')
          .select(
            '*, profile:profiles!changed_by(display_name, username, role), store:stores!store_id(store_name, store_code)'
          )
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd)
          .order('created_at', { ascending: false })
          .limit(100);

        if (storeId !== 'all') {
          query = query.eq('store_id', storeId);
        }

        const { data, error } = await query;
        if (error) throw error;

        setAuditLogs((data as AuditLogEntry[]) || []);
      } catch (error) {
        console.error('Error fetching audit logs:', error);
        toast({
          type: 'error',
          title: t('errorOccurred'),
          message: t('cannotLoadActivity'),
        });
        setAuditLogs([]);
      } finally {
        setLoadingLogs(false);
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const storeList = await fetchStores();
      await Promise.all([
        fetchStoreSummaries(storeList, selectedDate),
        fetchAuditLogs(selectedDate, selectedStore),
      ]);
    } finally {
      setLoading(false);
    }
  }, [fetchStores, fetchStoreSummaries, fetchAuditLogs, selectedDate, selectedStore]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when date or store changes (after initial load)
  useEffect(() => {
    if (!loading && stores.length > 0) {
      fetchStoreSummaries(stores, selectedDate);
      fetchAuditLogs(selectedDate, selectedStore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedStore]);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const storeTabs = useMemo(() => {
    const allTab = { id: 'all', label: t('allBranches') };
    const storeTabs = stores.map((s) => ({
      id: s.id,
      label: s.store_name,
    }));
    return [allTab, ...storeTabs];
  }, [stores]);

  const filteredSummaries = useMemo(() => {
    if (selectedStore === 'all') return storeSummaries;
    return storeSummaries.filter((s) => s.storeId === selectedStore);
  }, [storeSummaries, selectedStore]);

  const filteredLogs = useMemo(() => {
    if (filterCategory === 'all') return auditLogs;
    const allowedActions = FILTER_CATEGORIES[filterCategory];
    return auditLogs.filter((log) => allowedActions.includes(log.action_type));
  }, [auditLogs, filterCategory]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ---- Header with date picker ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={cn(
                'rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-700 shadow-sm transition-colors',
                'hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
                'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400'
              )}
            />
          </div>
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('refresh')}
          </button>
        </div>
      </div>

      {/* ---- Store tabs ---- */}
      <Tabs
        tabs={storeTabs}
        activeTab={selectedStore}
        onChange={setSelectedStore}
      />

      {/* ==== Section 1: สรุปสถานะรายสาขา ==== */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('branchStatusSummary')}
        </h2>

        {filteredSummaries.length === 0 ? (
          <Card padding="md">
            <EmptyState
              icon={StoreIcon}
              title={t('noBranchData')}
              description={t('noBranchActive')}
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredSummaries.map((summary, idx) => (
              <div
                key={summary.storeId}
                className={cn(
                  'rounded-xl border-l-4 bg-white p-5 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700',
                  STORE_BORDER_COLORS[idx % STORE_BORDER_COLORS.length]
                )}
              >
                {/* Store name header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StoreIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      {summary.storeName}
                    </h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      ({summary.storeCode})
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {t('todayActivity')}{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {formatNumber(summary.todayActivityCount)}
                    </span>{' '}
                    {t('entries')}
                  </span>
                </div>

                {/* Deposit stats */}
                <div className="mb-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Wine className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {t('sectionDeposit')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatBox
                      label={t('waitingStaffAccept')}
                      value={summary.deposit.pendingConfirm}
                      color="amber"
                    />
                    <StatBox
                      label={t('waitingWithdraw')}
                      value={summary.deposit.pendingWithdrawal}
                      color="blue"
                    />
                    <StatBox
                      label={t('inStore')}
                      value={summary.deposit.inStore}
                      color="emerald"
                    />
                    <StatBox
                      label={t('expiringSoon')}
                      value={summary.deposit.expiringSoon}
                      color={summary.deposit.expiringSoon > 0 ? 'red' : 'gray'}
                    />
                  </div>
                </div>

                {/* Stock stats */}
                <div className="mb-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <ClipboardCheck className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {t('sectionStock')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatBox
                      label={t('countedToday')}
                      value={summary.stock.countedToday}
                      color="indigo"
                    />
                    <StatBox
                      label={t('pendingExplanation')}
                      value={summary.stock.pendingExplanation}
                      color={
                        summary.stock.pendingExplanation > 0 ? 'amber' : 'gray'
                      }
                    />
                    <StatBox
                      label={t('pendingApproval')}
                      value={summary.stock.pendingApproval}
                      color={
                        summary.stock.pendingApproval > 0 ? 'blue' : 'gray'
                      }
                    />
                    <StatBox
                      label={t('overThreshold')}
                      value={summary.stock.overThreshold}
                      color={
                        summary.stock.overThreshold > 0 ? 'red' : 'gray'
                      }
                    />
                  </div>
                </div>

                {/* Borrow stats */}
                <div>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5 text-teal-500" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {t('sectionBorrow')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <StatBox
                      label={t('borrowOutgoing')}
                      value={summary.borrow.outgoing}
                      color={
                        summary.borrow.outgoing > 0 ? 'violet' : 'gray'
                      }
                    />
                    <StatBox
                      label={t('borrowIncoming')}
                      value={summary.borrow.incoming}
                      color={
                        summary.borrow.incoming > 0 ? 'teal' : 'gray'
                      }
                    />
                    <StatBox
                      label={t('pendingApproval')}
                      value={summary.borrow.pendingApproval}
                      color={
                        summary.borrow.pendingApproval > 0 ? 'amber' : 'gray'
                      }
                    />
                    <StatBox
                      label={t('approved')}
                      value={summary.borrow.approved}
                      color={
                        summary.borrow.approved > 0 ? 'blue' : 'gray'
                      }
                    />
                    <StatBox
                      label={t('pendingPosAdjust')}
                      value={summary.borrow.posAdjusting}
                      color={
                        summary.borrow.posAdjusting > 0 ? 'amber' : 'gray'
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ==== Section 2: กิจกรรมทั้งหมด (Audit Log Timeline) ==== */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('allActivity')}
        </h2>

        {/* Category filter chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABEL_KEYS) as FilterCategory[]).map((cat) => {
            const count = cat === 'all'
              ? auditLogs.length
              : auditLogs.filter((log) => FILTER_CATEGORIES[cat].includes(log.action_type)).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  filterCategory === cat
                    ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                )}
              >
                {t(FILTER_LABEL_KEYS[cat])}
                {count > 0 && (
                  <span className={cn(
                    'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    filterCategory === cat
                      ? 'bg-white/20'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Audit log timeline */}
        <Card padding="none">
          <CardHeader
            title={`${formatThaiDate(selectedDate)}`}
            description={
              selectedStore === 'all'
                ? t('allBranches')
                : stores.find((s) => s.id === selectedStore)?.store_name ||
                  ''
            }
            action={
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {t('itemCount', { count: formatNumber(filteredLogs.length) })}
              </span>
            }
          />

          {loadingLogs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t('noActivity')}
              description={t('noActivityOnDate', { date: formatThaiDate(selectedDate) })}
            />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredLogs.map((entry) => {
                const details = getEntryDetails(entry, t);
                const actorLabel = getActorLabel(entry, t);

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    {/* Time */}
                    <span className="mt-0.5 w-12 shrink-0 text-xs font-medium tabular-nums text-gray-400 dark:text-gray-500">
                      {formatTime(entry.created_at)}
                    </span>

                    {/* Colored dot */}
                    <div className="mt-1.5 shrink-0">
                      <div
                        className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          getActionDotColor(entry.action_type)
                        )}
                      />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {getActionLabel(entry.action_type)}
                        </span>
                        {details && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            &mdash; {details}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {selectedStore === 'all' && entry.store && (
                          <span className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                            <StoreIcon className="mr-0.5 h-2.5 w-2.5" />
                            {entry.store.store_name}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {t('by')}: {actorLabel}
                        </span>
                        <span className="text-xs text-gray-300 dark:text-gray-600">
                          {getRelativeTime(entry.created_at, t)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatBoxProps {
  label: string;
  value: number;
  color: 'emerald' | 'red' | 'amber' | 'blue' | 'indigo' | 'violet' | 'teal' | 'gray';
}

const STAT_COLOR_MAP: Record<
  string,
  { bg: string; text: string; valueTxt: string }
> = {
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    valueTxt: 'text-emerald-700 dark:text-emerald-300',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-600 dark:text-red-400',
    valueTxt: 'text-red-700 dark:text-red-300',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
    valueTxt: 'text-amber-700 dark:text-amber-300',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    valueTxt: 'text-blue-700 dark:text-blue-300',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    valueTxt: 'text-indigo-700 dark:text-indigo-300',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    text: 'text-violet-600 dark:text-violet-400',
    valueTxt: 'text-violet-700 dark:text-violet-300',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    text: 'text-teal-600 dark:text-teal-400',
    valueTxt: 'text-teal-700 dark:text-teal-300',
  },
  gray: {
    bg: 'bg-gray-50 dark:bg-gray-700/30',
    text: 'text-gray-500 dark:text-gray-400',
    valueTxt: 'text-gray-700 dark:text-gray-300',
  },
};

function StatBox({ label, value, color }: StatBoxProps) {
  const colors = STAT_COLOR_MAP[color] || STAT_COLOR_MAP.gray;
  return (
    <div
      className={cn(
        'rounded-lg px-3 py-2.5 text-center',
        colors.bg
      )}
    >
      <p className={cn('text-lg font-bold', colors.valueTxt)}>
        {formatNumber(value)}
      </p>
      <p className={cn('text-[11px] font-medium', colors.text)}>{label}</p>
    </div>
  );
}
