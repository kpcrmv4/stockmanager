'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Warehouse,
  Clock,
  Package,
  BoxSelect,
  Store as StoreIcon,
  ChevronDown,
  ChevronUp,
  Search,
  Eye,
  Check,
  X,
  Camera,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Calendar,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useRealtime } from '@/hooks/use-realtime';
import { formatThaiDateTime } from '@/lib/utils/format';
import { todayBangkok, startOfTodayBangkokISO, daysAgoBangkokISO } from '@/lib/utils/date';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { toast } from '@/components/ui';
import type { Store } from '@/types/database';

// ==========================================
// Types
// ==========================================

interface TransferWithItems {
  id: string;
  transfer_code: string;
  from_store_id: string;
  from_store_name: string;
  deposit_id: string | null;
  product_name: string | null;
  customer_name: string | null;
  deposit_code: string | null;
  quantity: number | null;
  status: string;
  requested_by: string | null;
  requested_by_name: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

interface HqDepositItem {
  id: string;
  transfer_id: string | null;
  deposit_id: string | null;
  from_store_id: string | null;
  from_store_name: string;
  product_name: string | null;
  customer_name: string | null;
  deposit_code: string | null;
  category: string | null;
  quantity: number | null;
  status: string;
  received_by: string | null;
  received_by_name: string | null;
  received_photo_url: string | null;
  received_at: string;
  withdrawn_by: string | null;
  withdrawn_by_name: string | null;
  withdrawal_notes: string | null;
  withdrawn_at: string | null;
  notes: string | null;
  created_at: string;
}

interface BranchSummary {
  storeId: string;
  storeName: string;
  pending: number;
  received: number;
  expired: number;
}

interface ExpiredDeposit {
  id: string;
  deposit_code: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  expiry_date: string;
  store_id: string;
  store_name: string;
  status: string;
}

type TabId = 'pending' | 'received' | 'withdrawn' | 'expired';

// ==========================================
// Main Component
// ==========================================

export default function HqWarehousePage() {
  const { user } = useAuthStore();
  const [stores, setStores] = useState<Store[]>([]);
  const mountedRef = useRef(true);

  // Data State
  const [pendingTransfers, setPendingTransfers] = useState<TransferWithItems[]>([]);
  const [receivedItems, setReceivedItems] = useState<HqDepositItem[]>([]);
  const [withdrawnItems, setWithdrawnItems] = useState<HqDepositItem[]>([]);
  const [expiredDeposits, setExpiredDeposits] = useState<ExpiredDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState<TabId>('pending');
  const [showBranchSummary, setShowBranchSummary] = useState(false);
  const [filterBranch, setFilterBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [withdrawnDateFilter, setWithdrawnDateFilter] = useState<'today' | 'week' | 'all'>('today');

  // Modal State
  const [selectedTransfer, setSelectedTransfer] = useState<TransferWithItems | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmStep, setConfirmStep] = useState(1);
  const [confirmPhotoUrl, setConfirmPhotoUrl] = useState<string | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Withdraw Modal State
  const [selectedHqDeposit, setSelectedHqDeposit] = useState<HqDepositItem | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  // Photo Modal State
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // Get central store(s) for filtering
  const centralStores = useMemo(
    () => stores.filter((s) => s.is_central),
    [stores]
  );
  const centralStoreIds = useMemo(
    () => centralStores.map((s) => s.id),
    [centralStores]
  );

  // Non-central stores for branch summary
  const branchStores = useMemo(
    () => stores.filter((s) => !s.is_central && s.active),
    [stores]
  );

  // ==========================================
  // Fetch Stores
  // ==========================================

  const fetchStores = useCallback(async () => {
    const supabase = createClient();
    // owner/hq/accountant see all stores
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('active', true)
      .order('store_name');
    if (data && mountedRef.current) setStores(data);
  }, []);

  // ==========================================
  // Data Loading
  // ==========================================

  const loadPendingTransfers = useCallback(async () => {
    if (centralStoreIds.length === 0) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('transfers')
      .select(`
        id, from_store_id, deposit_id, product_name, quantity,
        status, requested_by, notes, photo_url, created_at
      `)
      .in('to_store_id', centralStoreIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!data || !mountedRef.current) return;

    // Resolve store names and requester names
    const storeMap = new Map(stores.map((s) => [s.id, s.store_name]));
    const userIds = [...new Set(data.map((t) => t.requested_by).filter(Boolean))] as string[];
    let userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', userIds);
      if (profiles) {
        userMap = new Map(profiles.map((p) => [p.id, p.display_name || p.username]));
      }
    }

    // Resolve deposit info
    const depositIds = data.map((t) => t.deposit_id).filter(Boolean) as string[];
    let depositMap = new Map<string, { customer_name: string; deposit_code: string }>();
    if (depositIds.length > 0) {
      const { data: deposits } = await supabase
        .from('deposits')
        .select('id, customer_name, deposit_code')
        .in('id', depositIds);
      if (deposits) {
        depositMap = new Map(deposits.map((d) => [d.id, { customer_name: d.customer_name, deposit_code: d.deposit_code }]));
      }
    }

    const items: TransferWithItems[] = data.map((t) => {
      const depositInfo = t.deposit_id ? depositMap.get(t.deposit_id) : null;
      return {
        id: t.id,
        transfer_code: t.id.slice(0, 8).toUpperCase(),
        from_store_id: t.from_store_id,
        from_store_name: storeMap.get(t.from_store_id) || 'ไม่ทราบ',
        deposit_id: t.deposit_id,
        product_name: t.product_name,
        customer_name: depositInfo?.customer_name || null,
        deposit_code: depositInfo?.deposit_code || null,
        quantity: t.quantity,
        status: t.status,
        requested_by: t.requested_by,
        requested_by_name: t.requested_by ? (userMap.get(t.requested_by) || null) : null,
        notes: t.notes,
        photo_url: t.photo_url,
        created_at: t.created_at,
      };
    });

    if (mountedRef.current) setPendingTransfers(items);
  }, [centralStoreIds, stores]);

  const loadReceivedItems = useCallback(async () => {
    const supabase = createClient();

    const { data } = await supabase
      .from('hq_deposits')
      .select('*')
      .eq('status', 'awaiting_withdrawal')
      .order('received_at', { ascending: false });

    if (!data || !mountedRef.current) return;

    const storeMap = new Map(stores.map((s) => [s.id, s.store_name]));
    const userIds = [...new Set([
      ...data.map((d) => d.received_by),
    ].filter(Boolean))] as string[];
    let userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', userIds);
      if (profiles) {
        userMap = new Map(profiles.map((p) => [p.id, p.display_name || p.username]));
      }
    }

    const items: HqDepositItem[] = data.map((d) => ({
      ...d,
      from_store_name: storeMap.get(d.from_store_id || '') || 'ไม่ทราบ',
      received_by_name: d.received_by ? (userMap.get(d.received_by) || null) : null,
      withdrawn_by_name: null,
    }));

    if (mountedRef.current) setReceivedItems(items);
  }, [stores]);

  const loadWithdrawnItems = useCallback(async () => {
    const supabase = createClient();

    const { data } = await supabase
      .from('hq_deposits')
      .select('*')
      .eq('status', 'withdrawn')
      .order('withdrawn_at', { ascending: false });

    if (!data || !mountedRef.current) return;

    const storeMap = new Map(stores.map((s) => [s.id, s.store_name]));
    const userIds = [...new Set([
      ...data.map((d) => d.received_by),
      ...data.map((d) => d.withdrawn_by),
    ].filter(Boolean))] as string[];
    let userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', userIds);
      if (profiles) {
        userMap = new Map(profiles.map((p) => [p.id, p.display_name || p.username]));
      }
    }

    const items: HqDepositItem[] = data.map((d) => ({
      ...d,
      from_store_name: storeMap.get(d.from_store_id || '') || 'ไม่ทราบ',
      received_by_name: d.received_by ? (userMap.get(d.received_by) || null) : null,
      withdrawn_by_name: d.withdrawn_by ? (userMap.get(d.withdrawn_by) || null) : null,
    }));

    if (mountedRef.current) setWithdrawnItems(items);
  }, [stores]);

  const loadExpiredDeposits = useCallback(async () => {
    const supabase = createClient();

    const { data } = await supabase
      .from('deposits')
      .select('id, deposit_code, customer_name, product_name, quantity, expiry_date, store_id, status')
      .eq('status', 'expired')
      .order('expiry_date', { ascending: false });

    if (!data || !mountedRef.current) return;

    const storeMap = new Map(stores.map((s) => [s.id, s.store_name]));

    const items: ExpiredDeposit[] = data.map((d) => ({
      ...d,
      store_name: storeMap.get(d.store_id) || 'ไม่ทราบ',
    }));

    if (mountedRef.current) setExpiredDeposits(items);
  }, [stores]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPendingTransfers(),
        loadReceivedItems(),
        loadWithdrawnItems(),
        loadExpiredDeposits(),
      ]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loadPendingTransfers, loadReceivedItems, loadWithdrawnItems, loadExpiredDeposits]);

  useEffect(() => {
    mountedRef.current = true;
    fetchStores();
    return () => { mountedRef.current = false; };
  }, [fetchStores]);

  useEffect(() => {
    if (stores.length > 0) {
      loadAllData();
    }
  }, [stores.length, loadAllData]);

  // Realtime subscriptions
  const realtimeCallback = useCallback(() => {
    loadAllData();
  }, [loadAllData]);

  useRealtime({
    table: 'transfers',
    onInsert: realtimeCallback,
    onUpdate: realtimeCallback,
  });

  useRealtime({
    table: 'hq_deposits',
    onInsert: realtimeCallback,
    onUpdate: realtimeCallback,
  });

  // ==========================================
  // Branch Summary
  // ==========================================

  const branchSummaryData = useMemo<BranchSummary[]>(() => {
    return branchStores.map((store) => ({
      storeId: store.id,
      storeName: store.store_name,
      pending: pendingTransfers.filter((t) => t.from_store_id === store.id).length,
      received: receivedItems.filter((r) => r.from_store_id === store.id).length,
      expired: expiredDeposits.filter((e) => e.store_id === store.id).length,
    })).filter((b) => b.pending > 0 || b.received > 0 || b.expired > 0);
  }, [branchStores, pendingTransfers, receivedItems, expiredDeposits]);

  // ==========================================
  // Summary Counts
  // ==========================================

  const summary = useMemo(() => ({
    pending: pendingTransfers.length,
    received: receivedItems.length,
    withdrawn: withdrawnItems.length,
    expired: expiredDeposits.length,
  }), [pendingTransfers, receivedItems, withdrawnItems, expiredDeposits]);

  // ==========================================
  // Filtered Lists
  // ==========================================

  const filteredPending = useMemo(() => {
    let result = pendingTransfers;
    if (filterBranch) result = result.filter((t) => t.from_store_id === filterBranch);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.transfer_code.toLowerCase().includes(q) ||
        t.from_store_name.toLowerCase().includes(q) ||
        t.product_name?.toLowerCase().includes(q) ||
        t.customer_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [pendingTransfers, filterBranch, searchQuery]);

  const filteredReceived = useMemo(() => {
    let result = receivedItems;
    if (filterBranch) result = result.filter((i) => i.from_store_id === filterBranch);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        i.product_name?.toLowerCase().includes(q) ||
        i.customer_name?.toLowerCase().includes(q) ||
        i.deposit_code?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [receivedItems, filterBranch, searchQuery]);

  const filteredWithdrawn = useMemo(() => {
    let result = withdrawnItems;
    if (filterBranch) result = result.filter((i) => i.from_store_id === filterBranch);

    if (withdrawnDateFilter === 'today') {
      const todayStr = todayBangkok(); // "YYYY-MM-DD"
      result = result.filter((i) => {
        if (!i.withdrawn_at) return false;
        // Format withdrawn_at in Bangkok timezone to compare date strings
        const dStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(i.withdrawn_at));
        return dStr === todayStr;
      });
    } else if (withdrawnDateFilter === 'week') {
      const weekAgoISO = daysAgoBangkokISO(7);
      result = result.filter((i) => i.withdrawn_at && new Date(i.withdrawn_at) >= new Date(weekAgoISO));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        i.product_name?.toLowerCase().includes(q) ||
        i.customer_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [withdrawnItems, filterBranch, withdrawnDateFilter, searchQuery]);

  const filteredExpired = useMemo(() => {
    let result = expiredDeposits;
    if (filterBranch) result = result.filter((e) => e.store_id === filterBranch);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) =>
        e.product_name.toLowerCase().includes(q) ||
        e.customer_name.toLowerCase().includes(q) ||
        e.deposit_code.toLowerCase().includes(q) ||
        e.store_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [expiredDeposits, filterBranch, searchQuery]);

  // ==========================================
  // Actions
  // ==========================================

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadAllData();
      toast({ type: 'success', title: 'โหลดข้อมูลใหม่แล้ว' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const openConfirmModal = (transfer: TransferWithItems) => {
    setSelectedTransfer(transfer);
    setConfirmStep(1);
    setConfirmPhotoUrl(null);
    setConfirmNotes('');
    setShowConfirmModal(true);
  };

  const submitConfirmTransfer = async () => {
    if (!selectedTransfer || !confirmPhotoUrl || !user) return;
    setConfirmSubmitting(true);

    try {
      const supabase = createClient();

      // 1. Update transfer status to confirmed
      const { error: transferError } = await supabase
        .from('transfers')
        .update({
          status: 'confirmed',
          confirmed_by: user.id,
          confirm_photo_url: confirmPhotoUrl,
        })
        .eq('id', selectedTransfer.id);

      if (transferError) throw transferError;

      // 2. Create hq_deposit record
      const { error: hqError } = await supabase
        .from('hq_deposits')
        .insert({
          transfer_id: selectedTransfer.id,
          deposit_id: selectedTransfer.deposit_id,
          from_store_id: selectedTransfer.from_store_id,
          product_name: selectedTransfer.product_name,
          customer_name: selectedTransfer.customer_name,
          deposit_code: selectedTransfer.deposit_code,
          quantity: selectedTransfer.quantity,
          status: 'awaiting_withdrawal',
          received_by: user.id,
          received_photo_url: confirmPhotoUrl,
          notes: confirmNotes || null,
        });

      if (hqError) throw hqError;

      // 3. Update original deposit status to transferred_out
      if (selectedTransfer.deposit_id) {
        await supabase
          .from('deposits')
          .update({ status: 'transferred_out' })
          .eq('id', selectedTransfer.deposit_id);
      }

      toast({ type: 'success', title: 'รับสินค้าเข้าคลังเรียบร้อย' });
      setShowConfirmModal(false);
      setSelectedTransfer(null);
      await loadAllData();
    } catch (err) {
      console.error('Confirm error:', err);
      toast({ type: 'error', title: 'เกิดข้อผิดพลาดในการรับสินค้า' });
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const rejectTransfer = async (transfer: TransferWithItems) => {
    if (!confirm(`ต้องการปฏิเสธการโอนจาก ${transfer.from_store_name} หรือไม่?`)) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('transfers')
        .update({ status: 'rejected' })
        .eq('id', transfer.id);

      if (error) throw error;

      toast({ type: 'success', title: 'ปฏิเสธการโอนเรียบร้อย' });
      await loadAllData();
    } catch {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาดในการปฏิเสธ' });
    }
  };

  const openWithdrawModal = (item: HqDepositItem) => {
    setSelectedHqDeposit(item);
    setWithdrawNotes('');
    setShowWithdrawModal(true);
  };

  const submitWithdraw = async () => {
    if (!selectedHqDeposit || !user) return;
    setWithdrawSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('hq_deposits')
        .update({
          status: 'withdrawn',
          withdrawn_by: user.id,
          withdrawal_notes: withdrawNotes || null,
          withdrawn_at: new Date().toISOString(),
        })
        .eq('id', selectedHqDeposit.id);

      if (error) throw error;

      toast({ type: 'success', title: 'จำหน่ายออกเรียบร้อย' });
      setShowWithdrawModal(false);
      setSelectedHqDeposit(null);
      await loadAllData();
    } catch {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาดในการจำหน่ายออก' });
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  // ==========================================
  // Tabs Config
  // ==========================================

  const tabs: { id: TabId; label: string; icon: typeof Clock; count: number; color: string }[] = [
    { id: 'pending', label: 'รอรับ', icon: Clock, count: summary.pending, color: 'yellow' },
    { id: 'received', label: 'รับแล้ว', icon: Package, count: summary.received, color: 'green' },
    { id: 'withdrawn', label: 'จำหน่ายออก', icon: BoxSelect, count: summary.withdrawn, color: 'gray' },
    { id: 'expired', label: 'หมดอายุ', icon: AlertTriangle, count: summary.expired, color: 'red' },
  ];

  // ==========================================
  // No central store check
  // ==========================================

  if (stores.length > 0 && centralStores.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg dark:bg-gray-900">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Warehouse className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">ยังไม่มีคลังกลาง</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            กรุณาตั้งค่าสาขาคลังกลาง (is_central) ในหน้าตั้งค่าร้านค้าก่อน
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // Render
  // ==========================================

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 px-4 py-5 text-white shadow-xl">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur-sm">
                <Warehouse className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Headquarters Inventory</h1>
                <p className="text-sm text-orange-100">
                  คลังกลาง — {centralStores.map((s) => s.store_name).join(', ')}
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium backdrop-blur-sm transition hover:bg-white/30"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </button>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="border-b bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-900">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tabs.map((tab) => {
              const colorMap: Record<string, string> = {
                yellow: 'border-yellow-200 dark:border-yellow-800',
                green: 'border-green-200 dark:border-green-800',
                gray: 'border-gray-200 dark:border-gray-700',
                red: 'border-red-200 dark:border-red-800',
              };
              const iconBgMap: Record<string, string> = {
                yellow: 'bg-yellow-100 dark:bg-yellow-900/30',
                green: 'bg-green-100 dark:bg-green-900/30',
                gray: 'bg-gray-100 dark:bg-gray-800',
                red: 'bg-red-100 dark:bg-red-900/30',
              };
              const textColorMap: Record<string, string> = {
                yellow: 'text-yellow-600 dark:text-yellow-400',
                green: 'text-green-600 dark:text-green-400',
                gray: 'text-gray-600 dark:text-gray-400',
                red: 'text-red-600 dark:text-red-400',
              };
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900',
                    colorMap[tab.color],
                    activeTab === tab.id && 'ring-2 ring-orange-400'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('rounded-lg p-2.5', iconBgMap[tab.color])}>
                      <TabIcon className={cn('h-5 w-5', textColorMap[tab.color])} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{tab.label}</p>
                      <p className={cn('text-2xl font-bold', textColorMap[tab.color])}>{tab.count}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Branch Summary */}
          <div className="mt-3">
            <button
              onClick={() => setShowBranchSummary(!showBranchSummary)}
              className="flex w-full items-center justify-between rounded-lg bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <span className="flex items-center gap-2">
                <StoreIcon className="h-4 w-4" />
                สรุปรายสาขา
              </span>
              {showBranchSummary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showBranchSummary && (
              <div className="mt-2 rounded-lg bg-white p-3 shadow-sm dark:bg-gray-900">
                {branchSummaryData.length === 0 ? (
                  <p className="py-2 text-center text-sm text-gray-400">ไม่มีข้อมูลสาขา</p>
                ) : (
                  <div className="space-y-2">
                    {branchSummaryData.map((branch) => (
                      <div key={branch.storeId} className="flex items-center justify-between border-b py-2 last:border-0 dark:border-gray-800">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{branch.storeName}</span>
                        <div className="flex gap-2 text-xs">
                          {branch.pending > 0 && (
                            <span className="rounded-full bg-yellow-100 px-2 py-1 font-bold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                              รอรับ: {branch.pending}
                            </span>
                          )}
                          {branch.received > 0 && (
                            <span className="rounded-full bg-green-100 px-2 py-1 font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              รับแล้ว: {branch.received}
                            </span>
                          )}
                          {branch.expired > 0 && (
                            <span className="rounded-full bg-red-100 px-2 py-1 font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              หมดอายุ: {branch.expired}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="sticky top-0 z-40 bg-white shadow-sm dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-2">
          <nav className="flex gap-2 overflow-x-auto py-3">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition',
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  )}
                >
                  <TabIcon className="h-4 w-4" />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={cn(
                      'ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold',
                      activeTab === tab.id
                        ? 'bg-white/20 text-white'
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Filters */}
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <div className="flex flex-col gap-2 rounded-lg bg-white p-3 shadow-sm sm:flex-row dark:bg-gray-900">
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className="flex-1 rounded-lg border px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">ทุกสาขา</option>
            {branchStores.map((store) => (
              <option key={store.id} value={store.id}>{store.store_name}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อเหล้า, ลูกค้า..."
              className="w-full rounded-lg border py-2 pl-9 pr-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl p-4 pb-24">
        {loading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow dark:bg-gray-900">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-orange-500" />
            <p className="mt-4 text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูล...</p>
          </div>
        ) : (
          <>
            {/* Tab: Pending */}
            {activeTab === 'pending' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 p-4 text-white">
                  <div className="rounded-xl bg-white/20 p-3">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">รายการรอรับจากสาขา</h3>
                    <p className="text-sm text-yellow-100">กดยืนยันเพื่อรับสินค้าเข้าคลัง</p>
                  </div>
                </div>

                {filteredPending.length === 0 ? (
                  <EmptyState message="ไม่มีรายการรอรับ" />
                ) : (
                  filteredPending.map((transfer) => (
                    <div key={transfer.id} className="overflow-hidden rounded-xl border-l-4 border-yellow-500 bg-white shadow-md dark:bg-gray-900">
                      <div className="p-4">
                        <div className="mb-3 flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-orange-600">{transfer.transfer_code}</span>
                              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                รอรับ
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                              <StoreIcon className="mr-1 inline h-3.5 w-3.5" />
                              {transfer.from_store_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">{formatThaiDateTime(transfer.created_at)}</p>
                            <p className="mt-1 text-lg font-bold text-gray-700 dark:text-gray-200">
                              {transfer.quantity || 1} <span className="text-sm font-normal text-gray-500">ขวด</span>
                            </p>
                          </div>
                        </div>

                        {/* Item Info */}
                        <div className="mb-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                          <div className="flex flex-wrap gap-1 text-xs">
                            {transfer.product_name && (
                              <span className="rounded border bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
                                {transfer.product_name}
                              </span>
                            )}
                            {transfer.customer_name && (
                              <span className="rounded border bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
                                {transfer.customer_name}
                              </span>
                            )}
                            {transfer.requested_by_name && (
                              <span className="text-gray-400">โดย: {transfer.requested_by_name}</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setSelectedTransfer(transfer); setShowDetailModal(true); }}
                            className="flex-1 rounded-lg bg-blue-100 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                          >
                            <Eye className="mr-1 inline h-4 w-4" /> ดูรายละเอียด
                          </button>
                          <button
                            onClick={() => openConfirmModal(transfer)}
                            className="flex-1 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 py-2.5 text-sm font-bold text-white shadow-md transition hover:from-green-600 hover:to-emerald-700"
                          >
                            <Check className="mr-1 inline h-4 w-4" /> รับสินค้า
                          </button>
                          <button
                            onClick={() => rejectTransfer(transfer)}
                            className="rounded-lg bg-red-100 px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab: Received */}
            {activeTab === 'received' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 p-4 text-white">
                  <div className="rounded-xl bg-white/20 p-3">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">สินค้าในคลัง</h3>
                    <p className="text-sm text-green-100">รายการที่รับแล้ว (อยู่ในคลัง)</p>
                  </div>
                </div>

                {filteredReceived.length === 0 ? (
                  <EmptyState message="ไม่มีสินค้าในคลัง" />
                ) : (
                  filteredReceived.map((item) => (
                    <div key={item.id} className="rounded-xl border-l-4 border-green-500 bg-white p-4 shadow-md dark:bg-gray-900">
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <p className="font-bold text-gray-800 dark:text-gray-100">{item.product_name || 'ไม่ระบุ'}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{item.customer_name || '-'}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            จาก: {item.from_store_name}
                            {item.deposit_code && <> &bull; รหัส: {item.deposit_code}</>}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-green-600">{item.quantity || 1}</span>
                          <span className="ml-1 text-sm text-gray-500">ขวด</span>
                          <p className="mt-1 text-xs text-gray-400">
                            รับ: {formatThaiDateTime(item.received_at)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        {(user?.role === 'owner' || user?.role === 'hq') && (
                          <button
                            onClick={() => openWithdrawModal(item)}
                            className="flex-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 py-2 text-sm font-medium text-white shadow transition hover:from-orange-600 hover:to-amber-700"
                          >
                            <BoxSelect className="mr-1 inline h-4 w-4" /> จำหน่ายออก
                          </button>
                        )}
                        {item.received_photo_url && (
                          <button
                            onClick={() => setViewingPhoto(item.received_photo_url)}
                            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab: Withdrawn */}
            {activeTab === 'withdrawn' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-gray-500 to-gray-600 p-4 text-white">
                  <div className="rounded-xl bg-white/20 p-3">
                    <BoxSelect className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">ประวัติจำหน่ายออก</h3>
                    <p className="text-sm text-gray-200">รายการที่จำหน่ายออกแล้ว</p>
                  </div>
                </div>

                {/* Date filter */}
                <div className="flex gap-2 rounded-lg bg-white p-3 shadow-sm dark:bg-gray-900">
                  {(['today', 'week', 'all'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setWithdrawnDateFilter(filter)}
                      className={cn(
                        'flex-1 rounded-lg py-2 text-sm font-medium transition',
                        withdrawnDateFilter === filter
                          ? 'bg-gray-700 text-white dark:bg-gray-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                      )}
                    >
                      {filter === 'today' ? 'วันนี้' : filter === 'week' ? '7 วัน' : 'ทั้งหมด'}
                    </button>
                  ))}
                </div>

                {filteredWithdrawn.length === 0 ? (
                  <EmptyState message="ไม่มีประวัติจำหน่ายออก" />
                ) : (
                  filteredWithdrawn.map((item) => (
                    <div key={item.id} className="rounded-xl border-l-4 border-gray-400 bg-white p-4 shadow-sm dark:bg-gray-900">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">{item.product_name || 'ไม่ระบุ'}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{item.customer_name || '-'}</p>
                          <p className="mt-1 text-xs text-gray-400">จาก: {item.from_store_name}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-gray-600">{item.quantity || 1}</span>
                          <span className="ml-1 text-sm text-gray-400">ขวด</span>
                          {item.withdrawn_at && (
                            <p className="mt-1 text-xs text-gray-400">
                              จำหน่าย: {formatThaiDateTime(item.withdrawn_at)}
                            </p>
                          )}
                          {item.withdrawn_by_name && (
                            <p className="text-xs text-gray-400">โดย: {item.withdrawn_by_name}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab: Expired Deposits */}
            {activeTab === 'expired' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 p-4 text-white">
                  <div className="rounded-xl bg-white/20 p-3">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">เหล้าฝากหมดอายุ</h3>
                    <p className="text-sm text-red-100">รายการฝากที่เกินกำหนดแล้ว (ทุกสาขา)</p>
                  </div>
                </div>

                {filteredExpired.length === 0 ? (
                  <EmptyState message="ไม่มีรายการหมดอายุ" />
                ) : (
                  filteredExpired.map((item) => (
                    <div key={item.id} className="rounded-xl border-l-4 border-red-400 bg-white p-4 shadow-sm dark:bg-gray-900">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">{item.product_name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{item.customer_name}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            <StoreIcon className="mr-1 inline h-3 w-3" />
                            {item.store_name}
                            <span className="mx-1">&bull;</span>
                            รหัส: {item.deposit_code}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-red-600">{item.quantity}</span>
                          <span className="ml-1 text-sm text-gray-400">ขวด</span>
                          {item.expiry_date && (
                            <p className="mt-1 flex items-center justify-end gap-1 text-xs text-red-500">
                              <Calendar className="h-3 w-3" />
                              หมดอายุ: {formatThaiDateTime(item.expiry_date)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ==========================================
          MODALS
          ========================================== */}

      {/* Transfer Detail Modal */}
      {showDetailModal && selectedTransfer && (
        <Modal onClose={() => setShowDetailModal(false)}>
          <div className="rounded-t-2xl bg-gradient-to-r from-blue-500 to-indigo-600 p-5 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/20 p-2">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">รายละเอียดการโอน</h2>
                  <p className="text-sm text-blue-100">{selectedTransfer.transfer_code}</p>
                </div>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="rounded-xl p-2 transition hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800">
              <div>
                <span className="text-gray-500">สาขาต้นทาง:</span>
                <p className="font-medium dark:text-gray-200">{selectedTransfer.from_store_name}</p>
              </div>
              <div>
                <span className="text-gray-500">วันที่โอน:</span>
                <p className="font-medium dark:text-gray-200">{formatThaiDateTime(selectedTransfer.created_at)}</p>
              </div>
              <div>
                <span className="text-gray-500">ผู้นำส่ง:</span>
                <p className="font-medium dark:text-gray-200">{selectedTransfer.requested_by_name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">สถานะ:</span>
                <p className="font-medium text-yellow-600">รอรับ</p>
              </div>
              {selectedTransfer.product_name && (
                <div>
                  <span className="text-gray-500">ชื่อเหล้า:</span>
                  <p className="font-medium dark:text-gray-200">{selectedTransfer.product_name}</p>
                </div>
              )}
              {selectedTransfer.customer_name && (
                <div>
                  <span className="text-gray-500">ลูกค้า:</span>
                  <p className="font-medium dark:text-gray-200">{selectedTransfer.customer_name}</p>
                </div>
              )}
              {selectedTransfer.quantity && (
                <div>
                  <span className="text-gray-500">จำนวน:</span>
                  <p className="font-medium dark:text-gray-200">{selectedTransfer.quantity} ขวด</p>
                </div>
              )}
            </div>
            {selectedTransfer.notes && (
              <div className="mb-4 rounded-xl bg-gray-50 p-3 dark:bg-gray-800">
                <span className="text-sm text-gray-500">หมายเหตุ:</span>
                <p className="text-sm dark:text-gray-200">{selectedTransfer.notes}</p>
              </div>
            )}
            {selectedTransfer.photo_url && (
              <div className="mb-4">
                <button
                  onClick={() => setViewingPhoto(selectedTransfer.photo_url)}
                  className="w-full rounded-xl bg-blue-100 py-3 text-sm font-medium text-blue-700 transition hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                >
                  <ImageIcon className="mr-2 inline h-4 w-4" /> ดูรูปที่แนบ
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              >
                ปิด
              </button>
              <button
                onClick={() => { setShowDetailModal(false); rejectTransfer(selectedTransfer); }}
                className="rounded-xl bg-red-100 px-4 py-3 font-semibold text-red-600 transition hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
              >
                <X className="mr-1 inline h-4 w-4" /> ปฏิเสธ
              </button>
              <button
                onClick={() => { setShowDetailModal(false); openConfirmModal(selectedTransfer); }}
                className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-semibold text-white shadow-lg transition hover:from-green-600 hover:to-emerald-700"
              >
                <Check className="mr-1 inline h-4 w-4" /> รับสินค้า
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Transfer Modal */}
      {showConfirmModal && selectedTransfer && (
        <Modal onClose={() => setShowConfirmModal(false)}>
          {confirmStep === 1 ? (
            <>
              <div className="rounded-t-2xl bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/20 p-2">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">รับสินค้าเข้าคลัง</h2>
                    <p className="text-sm text-green-100">{selectedTransfer.transfer_code}</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800">
                  <div>
                    <span className="text-gray-500">สาขา:</span>
                    <p className="font-medium dark:text-gray-200">{selectedTransfer.from_store_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">ชื่อเหล้า:</span>
                    <p className="font-medium dark:text-gray-200">{selectedTransfer.product_name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">จำนวน:</span>
                    <p className="font-medium dark:text-gray-200">{selectedTransfer.quantity || 1} ขวด</p>
                  </div>
                  <div>
                    <span className="text-gray-500">ลูกค้า:</span>
                    <p className="font-medium dark:text-gray-200">{selectedTransfer.customer_name || '-'}</p>
                  </div>
                </div>

                {selectedTransfer.photo_url && (
                  <div className="mb-4">
                    <button
                      onClick={() => setViewingPhoto(selectedTransfer.photo_url)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 py-3 font-semibold text-white shadow-lg transition hover:from-blue-600 hover:to-indigo-700"
                    >
                      <ImageIcon className="h-4 w-4" /> ดูรูปจากสาขา
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => setConfirmStep(2)}
                    className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-semibold text-white shadow-lg transition hover:from-green-600 hover:to-emerald-700"
                  >
                    ถัดไป &rarr;
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-t-2xl bg-gradient-to-r from-blue-500 to-indigo-600 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/20 p-2">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">ถ่ายรูปยืนยัน</h2>
                    <p className="text-sm text-blue-100">ถ่ายรูปสินค้าที่ได้รับ</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <PhotoUpload
                  value={confirmPhotoUrl}
                  onChange={setConfirmPhotoUrl}
                  folder="hq-received"
                  label="แนบรูปยืนยันการรับ"
                  required
                  placeholder="ถ่ายรูปสินค้าที่ได้รับ"
                />

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">ผู้รับ</label>
                  <input
                    type="text"
                    readOnly
                    value={user?.displayName || user?.username || ''}
                    className="w-full rounded-xl border-2 border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">หมายเหตุ (ถ้ามี)</label>
                  <textarea
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    rows={2}
                    placeholder="ระบุหมายเหตุ..."
                    className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 transition focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setConfirmStep(1)}
                    className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  >
                    &larr; ย้อนกลับ
                  </button>
                  <button
                    onClick={submitConfirmTransfer}
                    disabled={!confirmPhotoUrl || confirmSubmitting}
                    className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-semibold text-white shadow-lg transition hover:from-green-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {confirmSubmitting ? (
                      <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> กำลังบันทึก...</>
                    ) : (
                      <><Check className="mr-1 inline h-4 w-4" /> ยืนยันรับ</>
                    )}
                  </button>
                </div>
                {!confirmPhotoUrl && (
                  <p className="mt-2 text-center text-sm text-red-500">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    กรุณาแนบรูปก่อนยืนยัน
                  </p>
                )}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && selectedHqDeposit && (
        <Modal onClose={() => setShowWithdrawModal(false)}>
          <div className="rounded-t-2xl bg-gradient-to-r from-orange-500 to-amber-600 p-5 text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2">
                <BoxSelect className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">จำหน่ายสินค้าออก</h2>
                <p className="text-sm text-orange-100">{selectedHqDeposit.product_name || ''}</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800">
              <div>
                <span className="text-gray-500">ชื่อเหล้า:</span>
                <p className="font-medium dark:text-gray-200">{selectedHqDeposit.product_name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">จำนวน:</span>
                <p className="font-medium dark:text-gray-200">{selectedHqDeposit.quantity || 1} ขวด</p>
              </div>
              <div>
                <span className="text-gray-500">ลูกค้า:</span>
                <p className="font-medium dark:text-gray-200">{selectedHqDeposit.customer_name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">จากสาขา:</span>
                <p className="font-medium dark:text-gray-200">{selectedHqDeposit.from_store_name}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">ผู้จำหน่าย</label>
              <input
                type="text"
                readOnly
                value={user?.displayName || user?.username || ''}
                className="w-full rounded-xl border-2 border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">หมายเหตุ (ถ้ามี)</label>
              <textarea
                value={withdrawNotes}
                onChange={(e) => setWithdrawNotes(e.target.value)}
                rows={2}
                placeholder="ระบุหมายเหตุ..."
                className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 transition focus:border-orange-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={submitWithdraw}
                disabled={withdrawSubmitting}
                className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 py-3 font-semibold text-white shadow-lg transition hover:from-orange-600 hover:to-amber-700 disabled:opacity-50"
              >
                {withdrawSubmitting ? (
                  <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> กำลังบันทึก...</>
                ) : (
                  <><Check className="mr-1 inline h-4 w-4" /> ยืนยันจำหน่ายออก</>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

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

// ==========================================
// Sub Components
// ==========================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-white p-8 text-center shadow dark:bg-gray-900">
      <Package className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
      <p className="mt-4 text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
