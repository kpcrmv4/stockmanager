'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Badge,
  Card,
  Tabs,
  EmptyState,
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
  Crown,
  Minus,
  Truck,
  CalendarDays,
} from 'lucide-react';
import Link from 'next/link';
import { DepositForm } from './_components/deposit-form';
import { DepositDetail } from './_components/deposit-detail';

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

const statusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending_confirm: 'warning',
  in_store: 'success',
  pending_withdrawal: 'info',
  withdrawn: 'default',
  expired: 'danger',
  transfer_pending: 'warning',
  transferred_out: 'info',
};

const depositTabs = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'in_store', label: 'ในร้าน' },
  { id: 'pending_confirm', label: 'รอยืนยัน' },
  { id: 'expired', label: 'หมดอายุ' },
  { id: 'vip', label: 'VIP' },
];

const PAGE_SIZE = 50;
const ACTIVE_STATUSES = ['in_store', 'pending_confirm', 'pending_withdrawal', 'transfer_pending'];

export default function DepositPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const searchParams = useSearchParams();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Date range filter (default: yesterday → today)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateFilterEnabled, setDateFilterEnabled] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
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

  // Load stats counts separately (lightweight queries)
  const loadStats = useCallback(async (supabase: ReturnType<typeof createClient>, storeId: string) => {
    const [
      { count: activeCount },
      { count: pendingCount },
      { count: expiredCount },
      { count: vipCount },
      { count: transferPendingCount },
      { count: pendingWithdrawalCount },
    ] = await Promise.all([
      supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'in_store'),
      supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'pending_confirm'),
      supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'expired'),
      supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('is_vip', true),
      supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'transfer_pending'),
      supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('store_id', storeId).in('status', ['pending', 'approved']),
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
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถโหลดข้อมูลฝากเหล้าได้' });
    }
    if (data) {
      setDeposits(data as Deposit[]);
    }

    // Load stats in parallel
    await loadStats(supabase, currentStoreId);

    setIsLoading(false);
    setHasMore(true);
  }, [currentStoreId, loadStats]);

  // Load inactive deposits (withdrawn, expired) with pagination
  const loadInactiveDeposits = useCallback(async (offset: number) => {
    if (!currentStoreId) return;
    setIsLoadingMore(true);
    const supabase = createClient();

    const inactiveStatuses = ['withdrawn', 'expired', 'transferred_out'];
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

  // Count inactive deposits already loaded
  const loadedInactiveCount = useMemo(
    () => deposits.filter((d) => !ACTIVE_STATUSES.includes(d.status)).length,
    [deposits]
  );

  // When switching to "all" or "expired" tab, ensure inactive deposits are loaded
  useEffect(() => {
    if ((activeTab === 'all' || activeTab === 'expired') && hasMore && loadedInactiveCount === 0 && !isLoadingMore) {
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
    } else if (activeTab === 'expired') {
      // "หมดอายุ" tab shows both expired and transfer_pending
      result = result.filter((d) => d.status === 'expired' || d.status === 'transfer_pending');
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

  const tabsWithCounts = depositTabs.map((t) => {
    if (t.id === 'in_store') return { ...t, count: stats.activeCount };
    if (t.id === 'pending_confirm') return { ...t, count: stats.pendingCount };
    if (t.id === 'expired') return { ...t, count: stats.expiredCount + stats.transferPendingCount };
    if (t.id === 'vip') return { ...t, count: stats.vipCount };
    return t;
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ฝากเหล้า</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            จัดการรายการฝากเหล้าและเบิกเหล้าของลูกค้า
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/deposit/withdrawals">
            <Button variant="danger" icon={<Minus className="h-4 w-4" />} className="w-full sm:w-auto">
              เบิกเหล้า
            </Button>
          </Link>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewForm(true)}>
            ฝากเหล้าใหม่
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
              <p className="text-xs text-gray-500 dark:text-gray-400">ฝากอยู่ในร้าน</p>
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
              <p className="text-xs text-gray-500 dark:text-gray-400">รอยืนยัน</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.expiredCount + stats.transferPendingCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">หมดอายุ</p>
              {(stats.expiredCount > 0 || stats.transferPendingCount > 0) && (
                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                  {stats.expiredCount > 0 && <span>รอดำเนินการ {stats.expiredCount}</span>}
                  {stats.expiredCount > 0 && stats.transferPendingCount > 0 && <span> · </span>}
                  {stats.transferPendingCount > 0 && <span>รอนำส่ง HQ {stats.transferPendingCount}</span>}
                </p>
              )}
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
              <p className="text-xs text-gray-500 dark:text-gray-400">คำขอเบิก</p>
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
              placeholder="ค้นหารหัส/ชื่อลูกค้า..."
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
            {dateFilterEnabled ? 'กรองวันที่' : 'กรองวันที่ (ปิด)'}
          </button>
          {dateFilterEnabled && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <span className="text-xs text-gray-400">ถึง</span>
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
          title="ไม่มีรายการฝากเหล้า"
          description={searchQuery ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีรายการฝากเหล้าในขณะนี้'}
          action={
            !searchQuery ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewForm(true)}>
                ฝากเหล้าใหม่
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Card padding="none">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        รหัสฝาก
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        ลูกค้า
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        สินค้า
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        คงเหลือ
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        สถานะ
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        วันหมดอายุ
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        จัดการ
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
                                  ไม่ฝาก
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            {deposit.is_vip ? (
                              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">ไม่มีวันหมดอายุ</span>
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
                                    เหลือ {expiryDays} วัน
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
                              ดูรายละเอียด
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile Card List */}
          <div className="space-y-3 md:hidden">
            {filteredDeposits.map((deposit) => {
              const expiryDays = deposit.expiry_date ? daysUntil(deposit.expiry_date) : null;
              const isExpiringSoon = expiryDays !== null && expiryDays <= 7 && expiryDays > 0 && deposit.status === 'in_store';

              return (
                <Card
                  key={deposit.id}
                  padding="none"
                  className="cursor-pointer transition-colors active:bg-gray-50 dark:active:bg-gray-700/30"
                >
                  <button
                    className="w-full p-4 text-left"
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
                              ไม่ฝาก
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
                        คงเหลือ: {formatNumber(deposit.remaining_qty)}/{formatNumber(deposit.quantity)}
                      </span>
                      {deposit.is_vip ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">ไม่มีวันหมดอายุ</span>
                      ) : deposit.expiry_date ? (
                        <span className={cn(isExpiringSoon && 'font-medium text-red-500 dark:text-red-400')}>
                          {isExpiringSoon
                            ? `หมดอายุใน ${expiryDays} วัน`
                            : `หมดอายุ: ${formatThaiDate(deposit.expiry_date)}`
                          }
                        </span>
                      ) : null}
                    </div>
                  </button>
                </Card>
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && !searchQuery && (activeTab === 'all' || activeTab === 'expired') && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                isLoading={isLoadingMore}
                onClick={() => loadInactiveDeposits(loadedInactiveCount)}
              >
                โหลดรายการเก่าเพิ่มเติม
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
