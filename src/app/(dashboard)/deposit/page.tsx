'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { currentShiftRange } from '@/lib/utils/date';
import {
  Button,
  Badge,
  Card,
  Tabs,
  EmptyState,
  Modal,
  ModalFooter,
  Textarea,
  PhotoUpload,
  toast,
} from '@/components/ui';
import { formatThaiDate, formatNumber, daysUntil } from '@/lib/utils/format';
import { DEPOSIT_STATUS_LABELS } from '@/lib/utils/constants';
import {
  Wine,
  Plus,
  Search,
  Clock,
  AlertTriangle,
  Package,
  Eye,
  ChevronRight,
  ChevronDown,
  Crown,
  Minus,
  Truck,
  CalendarDays,
  Warehouse,
  CheckSquare,
  Square,
  Send,
  Calendar,
  Printer,
  XCircle,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DepositForm } from './_components/deposit-form';
import { DepositDetail } from './_components/deposit-detail';
import { notifyChatTransferBatch, notifyChatTransferSubmitted } from '@/lib/chat/transfer-bot-client';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { generateTransferCode } from '@/lib/utils/transfer-code';
import type { TransferCardItem } from '@/types/transfer-chat';
import type { TransferPrintPayload } from '@/types/database';

interface Deposit {
  id: string;
  store_id: string;
  deposit_code: string;
  customer_id: string | null;
  line_user_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  remaining_qty: number;
  remaining_percent: number | null;
  table_number: string | null;
  status: string;
  expiry_date: string | null;
  received_by: string | null;
  notes: string | null;
  photo_url: string | null;
  customer_photo_url: string | null;
  received_photo_url: string | null;
  confirm_photo_url: string | null;
  is_vip: boolean;
  is_no_deposit: boolean;
  created_at: string;
}

interface TransferBatchItem {
  id: string;
  transfer_code: string | null;
  deposit_id: string | null;
  deposit_code: string | null;
  product_name: string | null;
  customer_name: string | null;
  quantity: number | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

interface TransferBatchGroup {
  transfer_code: string;
  items: TransferBatchItem[];
  created_at: string;
}

const statusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending_confirm: 'warning',
  in_store: 'success',
  pending_withdrawal: 'info',
  withdrawn: 'default',
  expired: 'danger',
  transfer_pending: 'warning',
  transferred_out: 'info',
};

const DEPOSIT_TAB_IDS = ['all', 'in_store', 'pending_confirm', 'expired', 'transfer_pending', 'vip'] as const;
const DEPOSIT_TAB_KEYS: Record<string, string> = {
  all: 'tabs.all',
  in_store: 'tabs.inStore',
  pending_confirm: 'tabs.pendingConfirm',
  expired: 'tabs.expired',
  transfer_pending: 'tabs.transferPending',
  vip: 'tabs.vip',
};

const PAGE_SIZE = 50;
const ACTIVE_STATUSES = ['in_store', 'pending_confirm', 'pending_withdrawal', 'transfer_pending', 'expired'];

export default function DepositPage() {
  const t = useTranslations('deposit');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const searchParams = useSearchParams();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Date range filter (default: กะทำงานปัจจุบัน based on working hours 12:00-06:00)
  const [dateFrom, setDateFrom] = useState(() => currentShiftRange().from);
  const [dateTo, setDateTo] = useState(() => currentShiftRange().to);
  const [dateFilterEnabled, setDateFilterEnabled] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);

  // Batch selection for expired tab
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchTransferring, setIsBatchTransferring] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferNote, setTransferNote] = useState('');
  const [transferPhoto, setTransferPhoto] = useState<string | null>(null);

  // Transfer batches for "รอนำส่ง HQ" tab
  const [transferBatches, setTransferBatches] = useState<TransferBatchGroup[]>([]);
  const [expandedTransferBatches, setExpandedTransferBatches] = useState<Set<string>>(new Set());
  const [isLoadingTransferBatches, setIsLoadingTransferBatches] = useState(false);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [printingBatch, setPrintingBatch] = useState<TransferBatchGroup | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  // Cancel batch in deposit page
  const [showCancelBatchModal, setShowCancelBatchModal] = useState(false);
  const [cancellingTransferBatch, setCancellingTransferBatch] = useState<TransferBatchGroup | null>(null);
  const [isCancellingBatch, setIsCancellingBatch] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState({
    activeCount: 0,
    pendingCount: 0,
    expiredCount: 0,
    vipCount: 0,
    transferPendingCount: 0,
    pendingWithdrawalCount: 0,
  });

  // Handle action query parameter (e.g. ?action=new or ?action=withdraw)
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'new') {
      setShowNewForm(true);
    } else if (action === 'withdraw') {
      setActiveTab('in_store');
    }
  }, [searchParams]);

  // Print transfer receipt via print_queue
  const printTransferReceipt = useCallback(async (payload: TransferPrintPayload) => {
    if (!currentStoreId || !user) return;
    const supabase = createClient();
    const { error } = await supabase.from('print_queue').insert({
      store_id: currentStoreId,
      deposit_id: null,
      job_type: 'transfer',
      status: 'pending',
      copies: 1,
      payload,
      requested_by: user.id,
    });
    if (error) {
      toast({ type: 'error', title: t('printError'), message: error.message });
    } else {
      toast({ type: 'success', title: t('printSent'), message: t('printSentMessage') });
    }
  }, [currentStoreId, user]);

  // Update date range when store's working hours are loaded
  useEffect(() => {
    if (!currentStoreId) return;
    const loadWorkingHours = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('store_settings')
        .select('print_server_working_hours')
        .eq('store_id', currentStoreId)
        .single();
      const wh = data?.print_server_working_hours as { startHour?: number; endHour?: number } | null;
      if (wh?.startHour != null && wh?.endHour != null) {
        const shift = currentShiftRange(wh.startHour, wh.endHour);
        setDateFrom(shift.from);
        setDateTo(shift.to);
      }
    };
    loadWorkingHours();
  }, [currentStoreId]);

  // Load stats counts separately (lightweight queries)
  // When date filter is enabled, counts reflect only the filtered date range
  const loadStats = useCallback(async (supabase: ReturnType<typeof createClient>, storeId: string, filterEnabled?: boolean, fromDate?: string, toDate?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withDateFilter = (query: any) => {
      if (filterEnabled && fromDate && toDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        return query.gte('created_at', from.toISOString()).lte('created_at', to.toISOString());
      }
      return query;
    };

    const [
      { count: activeCount },
      { count: pendingCount },
      { count: expiredCount },
      { count: vipCount },
      { count: transferPendingCount },
      { count: pendingWithdrawalCount },
    ] = await Promise.all([
      withDateFilter(supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'in_store')),
      withDateFilter(supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'pending_confirm')),
      withDateFilter(supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'expired')),
      withDateFilter(supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('is_vip', true)),
      withDateFilter(supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'transfer_pending')),
      withDateFilter(supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('store_id', storeId).in('status', ['pending', 'approved'])),
    ]);

    setStats({
      activeCount: activeCount || 0,
      pendingCount: pendingCount || 0,
      expiredCount: expiredCount || 0,
      vipCount: vipCount || 0,
      transferPendingCount: transferPendingCount || 0,
      pendingWithdrawalCount: pendingWithdrawalCount || 0,
    });
  }, []);

  // Load transfer batches for "รอนำส่ง HQ" tab
  const loadTransferBatches = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoadingTransferBatches(true);
    const supabase = createClient();

    // Find central store
    const { data: centralStore } = await supabase
      .from('stores')
      .select('id')
      .eq('is_central', true)
      .eq('active', true)
      .limit(1)
      .single();

    if (!centralStore) {
      setIsLoadingTransferBatches(false);
      return;
    }

    const { data } = await supabase
      .from('transfers')
      .select('id, transfer_code, deposit_id, product_name, quantity, notes, photo_url, created_at')
      .eq('from_store_id', currentStoreId)
      .eq('to_store_id', centralStore.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!data) {
      setIsLoadingTransferBatches(false);
      return;
    }

    // Resolve deposit info
    const depositIds = data.map((t) => t.deposit_id).filter(Boolean) as string[];
    let depositMap = new Map<string, { customer_name: string; deposit_code: string }>();
    if (depositIds.length > 0) {
      const { data: deps } = await supabase
        .from('deposits')
        .select('id, customer_name, deposit_code')
        .in('id', depositIds);
      if (deps) {
        depositMap = new Map(deps.map((d) => [d.id, { customer_name: d.customer_name, deposit_code: d.deposit_code }]));
      }
    }

    // Group by transfer_code
    const map = new Map<string, TransferBatchItem[]>();
    for (const t of data) {
      const info = t.deposit_id ? depositMap.get(t.deposit_id) : null;
      const code = t.transfer_code || t.id.slice(0, 8).toUpperCase();
      const item: TransferBatchItem = {
        id: t.id,
        transfer_code: t.transfer_code,
        deposit_id: t.deposit_id,
        deposit_code: info?.deposit_code || null,
        product_name: t.product_name,
        customer_name: info?.customer_name || null,
        quantity: t.quantity,
        notes: t.notes,
        photo_url: t.photo_url,
        created_at: t.created_at,
      };
      const existing = map.get(code);
      if (existing) existing.push(item);
      else map.set(code, [item]);
    }

    const batches: TransferBatchGroup[] = [];
    for (const [code, items] of map) {
      batches.push({ transfer_code: code, items, created_at: items[0].created_at });
    }
    batches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setTransferBatches(batches);
    setIsLoadingTransferBatches(false);
  }, [currentStoreId]);

  const loadDeposits = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();

    // Load active deposits (no limit — these are the important ones)
    const { data, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('store_id', currentStoreId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ type: 'error', title: t('loadError'), message: t('loadDepositError') });
    }
    if (data) {
      setDeposits(data as Deposit[]);
    }

    // Load stats in parallel (respecting date filter)
    await loadStats(supabase, currentStoreId, dateFilterEnabled, dateFrom, dateTo);

    setIsLoading(false);
    setHasMore(true);
  }, [currentStoreId, loadStats]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel a transfer batch (revert deposits to expired)
  const handleCancelTransferBatch = async () => {
    if (!user || !cancellingTransferBatch) return;
    setIsCancellingBatch(true);
    const supabase = createClient();

    try {
      const transferIds = cancellingTransferBatch.items.map((t) => t.id);
      const depositIds = cancellingTransferBatch.items.map((t) => t.deposit_id).filter(Boolean) as string[];

      const { error } = await supabase
        .from('transfers')
        .update({ status: 'rejected' })
        .in('id', transferIds);

      if (error) throw error;

      if (depositIds.length > 0) {
        await supabase
          .from('deposits')
          .update({ status: 'expired' })
          .in('id', depositIds);
      }

      toast({ type: 'success', title: t('transfer.cancelSuccess'), message: t('transfer.cancelSuccessMessage', { count: cancellingTransferBatch.items.length }) });
      setShowCancelBatchModal(false);
      setCancellingTransferBatch(null);
      loadTransferBatches();
      loadDeposits();
    } catch (err) {
      toast({ type: 'error', title: t('loadError'), message: err instanceof Error ? err.message : t('transfer.cancelError') });
    } finally {
      setIsCancellingBatch(false);
    }
  };

  // Load inactive deposits (withdrawn, expired) with pagination
  const loadInactiveDeposits = useCallback(async (offset: number) => {
    if (!currentStoreId) return;
    setIsLoadingMore(true);
    const supabase = createClient();

    const inactiveStatuses = ['withdrawn', 'transferred_out'];
    const { data, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('store_id', currentStoreId)
      .in('status', inactiveStatuses)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (!error && data) {
      setDeposits((prev) => {
        const existingIds = new Set(prev.map((d) => d.id));
        const newItems = (data as Deposit[]).filter((d) => !existingIds.has(d.id));
        return [...prev, ...newItems];
      });
      setHasMore(data.length === PAGE_SIZE);
    } else {
      setHasMore(false);
    }
    setIsLoadingMore(false);
  }, [currentStoreId]);

  useEffect(() => {
    loadDeposits();
  }, [loadDeposits]);

  // Refresh stats when date filter changes
  useEffect(() => {
    if (!currentStoreId) return;
    const supabase = createClient();
    loadStats(supabase, currentStoreId, dateFilterEnabled, dateFrom, dateTo);
  }, [currentStoreId, dateFilterEnabled, dateFrom, dateTo, loadStats]);

  // Clear batch selection when tab changes, load transfer batches when needed
  useEffect(() => {
    setBatchSelectedIds(new Set());
    if (activeTab === 'transfer_pending') {
      loadTransferBatches();
    }
  }, [activeTab, loadTransferBatches]);

  // Batch transfer expired deposits to HQ (called from modal confirmation)
  const handleBatchTransferToHq = async () => {
    if (!currentStoreId || !user || batchSelectedIds.size === 0) return;
    setIsBatchTransferring(true);
    const supabase = createClient();

    try {
      // Find central store
      const { data: centralStore } = await supabase
        .from('stores')
        .select('id')
        .eq('is_central', true)
        .eq('active', true)
        .limit(1)
        .single();

      if (!centralStore) {
        toast({ type: 'error', title: t('transfer.noHQ'), message: t('transfer.noHQMessage') });
        return;
      }

      const { data: storeData } = await supabase
        .from('stores')
        .select('store_name')
        .eq('id', currentStoreId)
        .single();
      const storeName = storeData?.store_name || 'สาขา';

      const transferCode = await generateTransferCode(supabase);
      const selected = deposits.filter((d) => batchSelectedIds.has(d.id));
      const transfers = selected.map((d) => ({
        from_store_id: currentStoreId,
        to_store_id: centralStore.id,
        deposit_id: d.id,
        product_name: d.product_name,
        quantity: d.remaining_qty || d.quantity,
        notes: transferNote || null,
        photo_url: transferPhoto,
        requested_by: user.id,
        transfer_code: transferCode,
      }));

      const { data: insertedTransfers, error } = await supabase
        .from('transfers')
        .insert(transfers)
        .select('id, deposit_id, product_name, quantity');

      if (error) throw error;

      await supabase
        .from('deposits')
        .update({ status: 'transfer_pending' })
        .in('id', [...batchSelectedIds]);

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.TRANSFER_CREATED,
        table_name: 'transfers',
        record_id: transferCode,
        new_value: {
          transfer_code: transferCode,
          to: 'central_warehouse',
          deposit_count: selected.length,
          deposit_codes: selected.map((d) => d.deposit_code),
        },
        changed_by: user.id,
      });

      const submitterName = user.displayName || user.username || 'พนักงาน';

      // Auto-print transfer receipt
      printTransferReceipt({
        transfer_code: transferCode,
        store_name: storeName,
        created_at: new Date().toISOString(),
        submitted_by_name: submitterName,
        notes: transferNote || null,
        items: selected.map((d) => ({
          product_name: d.product_name,
          customer_name: d.customer_name,
          deposit_code: d.deposit_code,
          quantity: d.remaining_qty || d.quantity,
          category: d.category,
        })),
      });

      notifyChatTransferSubmitted(currentStoreId, {
        transfer_code: transferCode,
        deposit_count: selected.length,
        submitted_by_name: submitterName,
      });

      if (insertedTransfers) {
        const cardItems: TransferCardItem[] = insertedTransfers.map((t, idx) => ({
          transfer_id: t.id,
          deposit_id: t.deposit_id,
          deposit_code: selected[idx]?.deposit_code || null,
          product_name: t.product_name || selected[idx]?.product_name || '',
          customer_name: selected[idx]?.customer_name || null,
          quantity: t.quantity || selected[idx]?.quantity || 0,
          category: selected[idx]?.category || null,
        }));
        notifyChatTransferBatch(centralStore.id, {
          transfer_code: transferCode,
          from_store_id: currentStoreId,
          from_store_name: storeName,
          items: cardItems,
          submitted_by: user.id,
          submitted_by_name: submitterName,
          photo_url: transferPhoto,
          notes: transferNote || null,
        });
      }

      toast({ type: 'success', title: t('transfer.success'), message: t('transfer.successMessage', { count: selected.length, code: transferCode }) });
      setShowTransferModal(false);
      setBatchSelectedIds(new Set());
      setTransferNote('');
      setTransferPhoto(null);
      loadDeposits();
    } catch (err) {
      toast({ type: 'error', title: t('loadError'), message: err instanceof Error ? err.message : t('transfer.error') });
    } finally {
      setIsBatchTransferring(false);
    }
  };

  // Count inactive deposits already loaded
  const loadedInactiveCount = useMemo(
    () => deposits.filter((d) => !ACTIVE_STATUSES.includes(d.status)).length,
    [deposits]
  );

  // When switching to "all" tab, ensure inactive deposits (withdrawn, transferred_out) are loaded
  useEffect(() => {
    if (activeTab === 'all' && hasMore && loadedInactiveCount === 0 && !isLoadingMore) {
      loadInactiveDeposits(0);
    }
  }, [activeTab, hasMore, loadedInactiveCount, isLoadingMore, loadInactiveDeposits]);

  // Validate and correct date range
  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    if (dateTo && value > dateTo) setDateTo(value);
  };
  const handleDateToChange = (value: string) => {
    if (value >= dateFrom) setDateTo(value);
  };

  const filteredDeposits = useMemo(() => {
    let result = deposits;

    // Filter by date range
    if (dateFilterEnabled && dateFrom && dateTo) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((d) => {
        const created = new Date(d.created_at);
        return created >= from && created <= to;
      });
    }

    // Filter by tab
    if (activeTab === 'vip') {
      result = result.filter((d) => d.is_vip);
    } else if (activeTab !== 'all') {
      result = result.filter((d) => d.status === activeTab);
    }

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.deposit_code?.toLowerCase().includes(q) ||
          d.customer_name?.toLowerCase().includes(q) ||
          d.product_name?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [deposits, activeTab, searchQuery, dateFilterEnabled, dateFrom, dateTo]);

  const depositTabs = DEPOSIT_TAB_IDS.map((id) => ({ id, label: t(DEPOSIT_TAB_KEYS[id]) }));
  const tabsWithCounts = depositTabs.map((tab) => {
    if (tab.id === 'in_store') return { ...tab, count: stats.activeCount };
    if (tab.id === 'pending_confirm') return { ...tab, count: stats.pendingCount };
    if (tab.id === 'expired') return { ...tab, count: stats.expiredCount };
    if (tab.id === 'transfer_pending') return { ...tab, count: stats.transferPendingCount };
    if (tab.id === 'vip') return { ...tab, count: stats.vipCount };
    return tab;
  });

  // Show new deposit form
  if (showNewForm) {
    return (
      <DepositForm
        onBack={() => setShowNewForm(false)}
        onSuccess={() => {
          setShowNewForm(false);
          loadDeposits();
        }}
      />
    );
  }

  // Show deposit detail
  if (selectedDeposit) {
    return (
      <DepositDetail
        deposit={selectedDeposit}
        onBack={() => {
          setSelectedDeposit(null);
          loadDeposits();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/deposit/withdrawals">
            <Button variant="danger" icon={<Minus className="h-4 w-4" />} className="w-full sm:w-auto">
              {t('withdrawButton')}
            </Button>
          </Link>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewForm(true)}>
            {t('newDeposit')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <Wine className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activeCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('inStore')}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('pendingConfirm')}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.expiredCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('expired')}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
              <Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingWithdrawalCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('withdrawalRequests')}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs + Search + Date Filter */}
      <div className="space-y-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={setActiveTab} />
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {/* Date range filter */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            onClick={() => setDateFilterEnabled(!dateFilterEnabled)}
            className={cn(
              'flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all sm:w-auto sm:justify-start',
              dateFilterEnabled
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                : 'border-gray-300 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {dateFilterEnabled ? t('dateFilterOn') : t('dateFilterOff')}
          </button>
          {dateFilterEnabled && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <span className="text-xs text-gray-400">{t('toDate')}</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => handleDateToChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* Deposits Table / List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        </div>
      ) : filteredDeposits.length === 0 ? (
        <EmptyState
          icon={Wine}
          title={t('noDeposits')}
          description={searchQuery ? t('noSearchResults') : t('noDepositsYet')}
          action={
            !searchQuery ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewForm(true)}>
                {t('newDeposit')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Batch action bar for expired tab */}
          {activeTab === 'expired' && filteredDeposits.length > 0 && user && user.role !== 'customer' && (
            <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200 dark:bg-amber-900/10 dark:ring-amber-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const expiredIds = filteredDeposits.filter((d) => d.status === 'expired').map((d) => d.id);
                    if (batchSelectedIds.size === expiredIds.length) {
                      setBatchSelectedIds(new Set());
                    } else {
                      setBatchSelectedIds(new Set(expiredIds));
                    }
                  }}
                  className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400"
                >
                  {batchSelectedIds.size === filteredDeposits.filter((d) => d.status === 'expired').length && batchSelectedIds.size > 0 ? (
                    <CheckSquare className="h-5 w-5" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                  {batchSelectedIds.size > 0
                    ? t('batch.selectedCount', { count: batchSelectedIds.size })
                    : t('batch.selectAll')}
                </button>
              </div>
              {batchSelectedIds.size > 0 && (
                <Button
                  size="sm"
                  icon={<Warehouse className="h-4 w-4" />}
                  className="bg-amber-600 hover:bg-amber-700"
                  isLoading={isBatchTransferring}
                  onClick={() => setShowTransferModal(true)}
                >
                  {t('batch.transferToHQ', { count: batchSelectedIds.size })}
                </Button>
              )}
            </div>
          )}

          {/* Transfer Pending Batch View — replaces default list when on transfer_pending tab */}
          {activeTab === 'transfer_pending' && (
            <>
              {isLoadingTransferBatches ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-amber-600" />
                </div>
              ) : transferBatches.length === 0 ? (
                <EmptyState
                  icon={Truck}
                  title={t('transfer.noPending')}
                  description={t('transfer.noPendingDesc')}
                />
              ) : (
                <div className="space-y-3">
                  {transferBatches.map((batch) => {
                    const isExpanded = expandedTransferBatches.has(batch.transfer_code);
                    return (
                      <Card key={batch.transfer_code} padding="none">
                        <div className="p-4 space-y-2.5">
                          {/* Row 1: Transfer code / Status / Count */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
                              {batch.transfer_code}
                            </span>
                            <Badge variant="warning" size="sm">{t('transfer.waitingHQ')}</Badge>
                            <Badge variant="default" size="sm">{t('transfer.itemsCount', { count: batch.items.length })}</Badge>
                          </div>

                          {/* Row 2: Buttons */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<Printer className="h-3.5 w-3.5" />}
                              onClick={() => {
                                setPrintingBatch(batch);
                                setShowPrintConfirm(true);
                              }}
                            >
                              {t('transfer.print')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              icon={isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              onClick={() => {
                                setExpandedTransferBatches((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(batch.transfer_code)) next.delete(batch.transfer_code);
                                  else next.add(batch.transfer_code);
                                  return next;
                                });
                              }}
                            >
                              {isExpanded ? t('transfer.hide') : t('transfer.detail')}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              icon={<XCircle className="h-3.5 w-3.5" />}
                              onClick={() => {
                                setCancellingTransferBatch(batch);
                                setShowCancelBatchModal(true);
                              }}
                            >
                              {t('cancel')}
                            </Button>
                          </div>

                          {/* Row 3: Date/time */}
                          <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Calendar className="h-3 w-3" />
                            {t('transfer.sentAt', { date: formatThaiDate(batch.created_at) })}
                          </p>
                        </div>

                        {/* Expanded items detail */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 dark:border-gray-700">
                            {batch.items.map((transfer) => (
                              <div
                                key={transfer.id}
                                className="border-b border-gray-50 px-4 py-3 last:border-b-0 dark:border-gray-800"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {transfer.product_name || t('transfer.unspecified')}
                                  </p>
                                  {transfer.quantity && (
                                    <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
                                      x{transfer.quantity}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                                  {transfer.customer_name && (
                                    <p className="flex items-center gap-1">
                                      <Wine className="h-3 w-3" />
                                      {transfer.customer_name}
                                      {transfer.deposit_code && (
                                        <span className="ml-1 font-mono text-gray-400">{transfer.deposit_code}</span>
                                      )}
                                    </p>
                                  )}
                                  {transfer.notes && <p>{t('transfer.notesLabel', { notes: transfer.notes })}</p>}
                                </div>
                                {transfer.photo_url && (
                                  <button
                                    onClick={() => setViewingPhoto(transfer.photo_url)}
                                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400"
                                  >
                                    <ImageIcon className="h-3.5 w-3.5" /> {t('transfer.viewPhoto')}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Desktop Table */}
          {activeTab !== 'transfer_pending' && <div className="hidden md:block">
            <Card padding="none">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('table.depositCode')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('table.customer')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('table.product')}
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('table.remaining')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('table.status')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('table.expiryDate')}
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('table.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {filteredDeposits.map((deposit) => {
                      const expiryDays = deposit.expiry_date ? daysUntil(deposit.expiry_date) : null;
                      const isExpiringSoon = expiryDays !== null && expiryDays <= 7 && expiryDays > 0 && deposit.status === 'in_store';

                      return (
                        <tr
                          key={deposit.id}
                          className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30"
                          onClick={() => setSelectedDeposit(deposit)}
                        >
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className="font-mono text-sm font-medium text-indigo-600 dark:text-indigo-400">
                              {deposit.deposit_code}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {deposit.customer_name}
                            </p>
                            {deposit.customer_phone && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {deposit.customer_phone}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm text-gray-900 dark:text-white">
                              {deposit.product_name}
                            </p>
                            {deposit.category && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {deposit.category}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatNumber(deposit.remaining_qty)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {' / '}{formatNumber(deposit.quantity)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={statusVariantMap[deposit.status] || 'default'}>
                                {DEPOSIT_STATUS_LABELS[deposit.status] || deposit.status}
                              </Badge>
                              {deposit.is_vip && (
                                <Badge variant="warning" size="sm">
                                  <Crown className="mr-0.5 h-3 w-3" />
                                  VIP
                                </Badge>
                              )}
                              {deposit.is_no_deposit && (
                                <Badge variant="warning" size="sm">
                                  <Truck className="mr-0.5 h-3 w-3" />
                                  {t('mobile.noDeposit')}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            {deposit.is_vip ? (
                              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('mobile.noExpiry')}</span>
                            ) : deposit.expiry_date ? (
                              <div>
                                <p className={cn(
                                  'text-sm',
                                  isExpiringSoon ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'
                                )}>
                                  {formatThaiDate(deposit.expiry_date)}
                                </p>
                                {isExpiringSoon && (
                                  <p className="text-xs text-red-500 dark:text-red-400">
                                    {t('mobile.daysLeft', { days: expiryDays })}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Eye className="h-4 w-4" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDeposit(deposit);
                              }}
                            >
                              {t('table.viewDetail')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>}

          {/* Mobile Card List */}
          {activeTab !== 'transfer_pending' && <div className="space-y-3 md:hidden">
            {filteredDeposits.map((deposit) => {
              const expiryDays = deposit.expiry_date ? daysUntil(deposit.expiry_date) : null;
              const isExpiringSoon = expiryDays !== null && expiryDays <= 7 && expiryDays > 0 && deposit.status === 'in_store';

              const showCheckbox = activeTab === 'expired' && deposit.status === 'expired' && user && user.role !== 'customer';
              const isChecked = batchSelectedIds.has(deposit.id);

              return (
                <Card
                  key={deposit.id}
                  padding="none"
                  className={cn(
                    'cursor-pointer transition-colors active:bg-gray-50 dark:active:bg-gray-700/30',
                    isChecked && 'ring-2 ring-amber-400 dark:ring-amber-600'
                  )}
                >
                  <div className="flex">
                    {showCheckbox && (
                      <button
                        type="button"
                        className="flex items-center justify-center px-3 text-amber-600 dark:text-amber-400"
                        onClick={() => {
                          setBatchSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(deposit.id)) next.delete(deposit.id);
                            else next.add(deposit.id);
                            return next;
                          });
                        }}
                      >
                        {isChecked ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                      </button>
                    )}
                  <button
                    className="w-full p-4 text-left flex-1"
                    onClick={() => setSelectedDeposit(deposit)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-indigo-600 dark:text-indigo-400">
                            {deposit.deposit_code}
                          </span>
                          <Badge variant={statusVariantMap[deposit.status] || 'default'} size="sm">
                            {DEPOSIT_STATUS_LABELS[deposit.status] || deposit.status}
                          </Badge>
                          {deposit.is_vip && (
                            <Badge variant="warning" size="sm">
                              <Crown className="mr-0.5 h-3 w-3" />
                              VIP
                            </Badge>
                          )}
                          {deposit.is_no_deposit && (
                            <Badge variant="warning" size="sm">
                              <Truck className="mr-0.5 h-3 w-3" />
                              {t('mobile.noDeposit')}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                          {deposit.product_name}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                          {deposit.customer_name}
                        </p>
                      </div>
                      <ChevronRight className="ml-2 h-5 w-5 shrink-0 text-gray-400" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {t('mobile.remaining', { remaining: formatNumber(deposit.remaining_qty), total: formatNumber(deposit.quantity) })}
                      </span>
                      {deposit.is_vip ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">{t('mobile.noExpiry')}</span>
                      ) : deposit.expiry_date ? (
                        <span className={cn(isExpiringSoon && 'font-medium text-red-500 dark:text-red-400')}>
                          {isExpiringSoon
                            ? t('mobile.expiresIn', { days: expiryDays })
                            : t('mobile.expiryLabel', { date: formatThaiDate(deposit.expiry_date) })
                          }
                        </span>
                      ) : null}
                    </div>
                  </button>
                  </div>
                </Card>
              );
            })}
          </div>}

          {/* Load More */}
          {hasMore && !searchQuery && activeTab === 'all' && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                isLoading={isLoadingMore}
                onClick={() => loadInactiveDeposits(loadedInactiveCount)}
              >
                {t('loadMoreOld')}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Transfer to HQ Modal */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => {
          if (!isBatchTransferring) {
            setShowTransferModal(false);
            setTransferNote('');
            setTransferPhoto(null);
          }
        }}
        title={t('transfer.title')}
        description={t('transfer.selectedItems', { count: batchSelectedIds.size })}
        size="lg"
      >
        <div className="space-y-4">
          {/* Selected items summary */}
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
            {deposits
              .filter((d) => batchSelectedIds.has(d.id))
              .map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    {d.product_name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {d.customer_name} · {d.deposit_code}
                  </span>
                </div>
              ))}
          </div>

          {/* Photo */}
          <PhotoUpload
            label={t('transfer.attachPhoto')}
            value={transferPhoto}
            onChange={setTransferPhoto}
            folder="transfers"
            compact
          />

          {/* Notes */}
          <Textarea
            label={t('transfer.notes')}
            value={transferNote}
            onChange={(e) => setTransferNote(e.target.value)}
            placeholder={t('transfer.notesPlaceholder')}
            rows={3}
          />
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowTransferModal(false);
              setTransferNote('');
              setTransferPhoto(null);
            }}
            disabled={isBatchTransferring}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleBatchTransferToHq}
            isLoading={isBatchTransferring}
            icon={<Truck className="h-4 w-4" />}
          >
            {t('transfer.confirm')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Print Confirmation Modal */}
      <Modal
        isOpen={showPrintConfirm}
        onClose={() => {
          setShowPrintConfirm(false);
          setPrintingBatch(null);
        }}
        title={t('print.confirmTitle')}
        description={printingBatch ? t('print.confirmDesc', { code: printingBatch.transfer_code }) : ''}
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('print.confirmMessage', { code: printingBatch?.transfer_code ?? '', count: printingBatch?.items.length ?? 0 })}
        </p>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowPrintConfirm(false);
              setPrintingBatch(null);
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            icon={<Printer className="h-4 w-4" />}
            onClick={() => {
              if (printingBatch) {
                printTransferReceipt({
                  transfer_code: printingBatch.transfer_code,
                  store_name: '',
                  created_at: printingBatch.created_at,
                  submitted_by_name: user?.displayName || user?.username || '',
                  notes: printingBatch.items[0]?.notes || null,
                  items: printingBatch.items.map((t) => ({
                    product_name: t.product_name || '',
                    customer_name: t.customer_name,
                    deposit_code: t.deposit_code,
                    quantity: t.quantity || 0,
                    category: null,
                  })),
                });
              }
              setShowPrintConfirm(false);
              setPrintingBatch(null);
            }}
          >
            {t('print.confirm')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Cancel Transfer Batch Modal */}
      <Modal
        isOpen={showCancelBatchModal}
        onClose={() => {
          if (!isCancellingBatch) {
            setShowCancelBatchModal(false);
            setCancellingTransferBatch(null);
          }
        }}
        title={t('cancelBatch.title')}
        description={cancellingTransferBatch ? t('cancelBatch.desc', { count: cancellingTransferBatch.items.length, code: cancellingTransferBatch.transfer_code }) : ''}
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('cancelBatch.message')}
          </p>
          {cancellingTransferBatch && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
              {cancellingTransferBatch.items.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{t.product_name}</span>
                  <span className="text-xs text-gray-500">{t.customer_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowCancelBatchModal(false);
              setCancellingTransferBatch(null);
            }}
            disabled={isCancellingBatch}
          >
            {t('cancelBatch.keep')}
          </Button>
          <Button
            variant="danger"
            onClick={handleCancelTransferBatch}
            isLoading={isCancellingBatch}
            icon={<XCircle className="h-4 w-4" />}
          >
            {t('cancelBatch.confirm')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Photo Viewer Modal */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewingPhoto(null)}
        >
          <div className="relative max-h-full max-w-full">
            <button
              onClick={() => setViewingPhoto(null)}
              className="absolute -top-10 right-0 text-white/80 transition hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewingPhoto}
              alt="Photo"
              className="max-h-[80vh] max-w-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
