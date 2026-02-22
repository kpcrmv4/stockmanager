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
  Users,
  AlertTriangle,
  Package,
  Eye,
  ChevronRight,
  Crown,
  Minus,
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

export default function DepositPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const searchParams = useSearchParams();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);

  // Handle action query parameter (e.g. ?action=new or ?action=withdraw)
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'new') {
      setShowNewForm(true);
    } else if (action === 'withdraw') {
      setActiveTab('in_store');
    }
  }, [searchParams]);

  const loadDeposits = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถโหลดข้อมูลฝากเหล้าได้' });
    }
    if (data) {
      setDeposits(data as Deposit[]);
    }
    setIsLoading(false);
  }, [currentStoreId]);

  useEffect(() => {
    loadDeposits();
  }, [loadDeposits]);

  const filteredDeposits = useMemo(() => {
    let result = deposits;

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
  }, [deposits, activeTab, searchQuery]);

  const activeCount = deposits.filter((d) => d.status === 'in_store').length;
  const pendingCount = deposits.filter((d) => d.status === 'pending_confirm').length;
  const expiredCount = deposits.filter((d) => d.status === 'expired').length;
  const vipCount = deposits.filter((d) => d.is_vip).length;
  const expiringSoonCount = deposits.filter(
    (d) => d.expiry_date && d.status === 'in_store' && daysUntil(d.expiry_date) <= 7 && daysUntil(d.expiry_date) > 0
  ).length;
  const uniqueCustomers = new Set(deposits.filter((d) => d.status === 'in_store').map((d) => d.customer_name)).size;

  const tabsWithCounts = depositTabs.map((t) => {
    if (t.id === 'in_store') return { ...t, count: activeCount };
    if (t.id === 'pending_confirm') return { ...t, count: pendingCount };
    if (t.id === 'expired') return { ...t, count: expiredCount };
    if (t.id === 'vip') return { ...t, count: vipCount };
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
            <Button variant="outline" icon={<Minus className="h-4 w-4" />} className="w-full sm:w-auto">
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
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</p>
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
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingCount}</p>
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
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{expiringSoonCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ใกล้หมดอายุ</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{uniqueCustomers}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ลูกค้าทั้งหมด</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={setActiveTab} />
        <div className="relative w-full max-w-xs">
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
        </>
      )}
    </div>
  );
}
