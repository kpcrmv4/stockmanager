'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Input, Badge, Card, CardHeader, Tabs, EmptyState, toast, Modal } from '@/components/ui';
import { nowBangkok } from '@/lib/utils/date';
import { formatThaiDate, formatNumber, formatPercent } from '@/lib/utils/format';
import type { Comparison, ComparisonStatus } from '@/types/database';
import {
  ArrowLeft,
  Search,
  Calendar,
  Filter,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';

type FilterStatus = 'all' | ComparisonStatus;

function getStatusConfig(status: ComparisonStatus) {
  switch (status) {
    case 'pending':
      return {
        label: 'รอชี้แจง',
        variant: 'warning' as const,
        icon: Clock,
      };
    case 'explained':
      return {
        label: 'ชี้แจงแล้ว',
        variant: 'info' as const,
        icon: FileText,
      };
    case 'approved':
      return {
        label: 'อนุมัติ',
        variant: 'success' as const,
        icon: CheckCircle2,
      };
    case 'rejected':
      return {
        label: 'ปฏิเสธ',
        variant: 'danger' as const,
        icon: XCircle,
      };
  }
}

function getDiffColor(difference: number | null, diffPercent: number | null) {
  if (difference === null || difference === 0) {
    return {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-700 dark:text-emerald-400',
      ring: 'ring-emerald-200 dark:ring-emerald-800',
      label: 'ตรง',
    };
  }
  const absPct = Math.abs(diffPercent || 0);
  if (absPct <= 5) {
    return {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      text: 'text-yellow-700 dark:text-yellow-400',
      ring: 'ring-yellow-200 dark:ring-yellow-800',
      label: 'ภายในเกณฑ์',
    };
  }
  return {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    ring: 'ring-red-200 dark:ring-red-800',
    label: 'เกินเกณฑ์',
  };
}

interface DayStat {
  date: string;
  total: number;
  match: number;
  withinTolerance: number;
  overTolerance: number;
  pending: number;
  explained: number;
  approved: number;
}

export default function ComparisonPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = nowBangkok();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [detailDate, setDetailDate] = useState<string | null>(null);

  const fetchComparisons = useCallback(async () => {
    if (!currentStoreId) return;

    setLoading(true);
    try {
      const supabase = createClient();

      // Fetch all comparison dates
      const { data: dateData } = await supabase
        .from('comparisons')
        .select('comp_date')
        .eq('store_id', currentStoreId)
        .order('comp_date', { ascending: false });

      if (dateData) {
        const uniqueDates = [...new Set(dateData.map((d) => d.comp_date))];
        setAvailableDates(uniqueDates);

        // Auto-select date from URL params or latest
        const urlParams = new URLSearchParams(window.location.search);
        const dateParam = urlParams.get('date');
        const targetDate = dateParam && uniqueDates.includes(dateParam)
          ? dateParam
          : uniqueDates[0] || '';
        setSelectedDate(targetDate);
      }

      // Fetch comparisons
      let query = supabase
        .from('comparisons')
        .select('*')
        .eq('store_id', currentStoreId)
        .order('comp_date', { ascending: false })
        .order('product_name', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      setComparisons(data || []);
    } catch (error) {
      console.error('Error fetching comparisons:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดข้อมูลเปรียบเทียบได้',
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    fetchComparisons();
  }, [fetchComparisons]);

  // Status filter tabs
  const statusTabs = useMemo(() => {
    const dateComparisons = selectedDate
      ? comparisons.filter((c) => c.comp_date === selectedDate)
      : comparisons;

    return [
      { id: 'all', label: 'ทั้งหมด', count: dateComparisons.length },
      {
        id: 'pending',
        label: 'รอชี้แจง',
        count: dateComparisons.filter((c) => c.status === 'pending').length,
      },
      {
        id: 'explained',
        label: 'ชี้แจงแล้ว',
        count: dateComparisons.filter((c) => c.status === 'explained').length,
      },
      {
        id: 'approved',
        label: 'อนุมัติ',
        count: dateComparisons.filter((c) => c.status === 'approved').length,
      },
      {
        id: 'rejected',
        label: 'ปฏิเสธ',
        count: dateComparisons.filter((c) => c.status === 'rejected').length,
      },
    ];
  }, [comparisons, selectedDate]);

  // Filtered data
  const filteredComparisons = useMemo(() => {
    let filtered = comparisons;

    // Filter by date
    if (selectedDate) {
      filtered = filtered.filter((c) => c.comp_date === selectedDate);
    }

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter((c) => c.status === filterStatus);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          (c.product_name || '').toLowerCase().includes(query) ||
          c.product_code.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [comparisons, selectedDate, filterStatus, searchQuery]);

  // Summary stats for the selected date
  const stats = useMemo(() => {
    const dateItems = selectedDate
      ? comparisons.filter((c) => c.comp_date === selectedDate)
      : comparisons;

    const total = dateItems.length;
    const match = dateItems.filter(
      (c) => c.difference === 0 || c.difference === null
    ).length;
    const withinTolerance = dateItems.filter(
      (c) =>
        c.difference !== 0 &&
        c.difference !== null &&
        Math.abs(c.diff_percent || 0) <= 5
    ).length;
    const overTolerance = dateItems.filter(
      (c) =>
        c.difference !== 0 &&
        c.difference !== null &&
        Math.abs(c.diff_percent || 0) > 5
    ).length;

    return { total, match, withinTolerance, overTolerance };
  }, [comparisons, selectedDate]);

  // Monthly statistics
  const monthlyStats = useMemo(() => {
    const prefix = selectedMonth;
    const dateGroups = new Map<string, Comparison[]>();
    for (const c of comparisons) {
      if (c.comp_date.startsWith(prefix)) {
        const group = dateGroups.get(c.comp_date) || [];
        group.push(c);
        dateGroups.set(c.comp_date, group);
      }
    }

    const result: DayStat[] = [];
    for (const [date, items] of dateGroups) {
      result.push({
        date,
        total: items.length,
        match: items.filter(
          (i) => i.difference === 0 || i.difference === null,
        ).length,
        withinTolerance: items.filter(
          (i) =>
            i.difference !== 0 &&
            i.difference !== null &&
            Math.abs(i.diff_percent || 0) <= 5,
        ).length,
        overTolerance: items.filter(
          (i) =>
            i.difference !== 0 &&
            i.difference !== null &&
            Math.abs(i.diff_percent || 0) > 5,
        ).length,
        pending: items.filter((i) => i.status === 'pending').length,
        explained: items.filter((i) => i.status === 'explained').length,
        approved: items.filter((i) => i.status === 'approved').length,
      });
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [comparisons, selectedMonth]);

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 15);
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'long',
    }).format(d);
  }, [selectedMonth]);

  const navigateMonth = (delta: number) => {
    setSelectedMonth((prev) => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  const detailItems = useMemo(() => {
    if (!detailDate) return [];
    const items = comparisons.filter((c) => c.comp_date === detailDate);
    const order: Record<string, number> = {
      pending: 0,
      explained: 1,
      rejected: 2,
      approved: 3,
    };
    return items.sort(
      (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9),
    );
  }, [comparisons, detailDate]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <a
              href="/stock"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <ArrowLeft className="h-5 w-5" />
            </a>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              ผลเปรียบเทียบสต๊อก
            </h1>
          </div>
          <p className="mt-0.5 ml-9 text-sm text-gray-500 dark:text-gray-400">
            POS vs จำนวนนับจริง
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={fetchComparisons}
        >
          รีเฟรช
        </Button>
      </div>

      {/* Date selector */}
      {availableDates.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
          {availableDates.slice(0, 7).map((date) => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                selectedDate === date
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              )}
            >
              {formatThaiDate(date)}
            </button>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-xl bg-blue-50 px-3 py-3 text-center dark:bg-blue-900/20">
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
            {stats.total}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-500">ทั้งหมด</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-3 text-center dark:bg-emerald-900/20">
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {stats.match}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-500">ตรง</p>
        </div>
        <div className="rounded-xl bg-yellow-50 px-3 py-3 text-center dark:bg-yellow-900/20">
          <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">
            {stats.withinTolerance}
          </p>
          <p className="text-[10px] text-yellow-600 dark:text-yellow-500">
            ในเกณฑ์
          </p>
        </div>
        <div className="rounded-xl bg-red-50 px-3 py-3 text-center dark:bg-red-900/20">
          <p className="text-lg font-bold text-red-700 dark:text-red-400">
            {stats.overTolerance}
          </p>
          <p className="text-[10px] text-red-600 dark:text-red-500">เกินเกณฑ์</p>
        </div>
      </div>

      {/* Monthly Statistics */}
      <Card padding="none">
        <CardHeader
          title="สถิติรายวัน"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateMonth(-1)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[120px] text-center text-xs font-medium text-gray-600 dark:text-gray-300">
                {monthLabel}
              </span>
              <button
                onClick={() => navigateMonth(1)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          }
        />

        {monthlyStats.length === 0 ? (
          <div className="px-4 pb-4 text-center text-xs text-gray-400">
            ไม่มีข้อมูลเดือนนี้
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      วันที่
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      รายการ
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-emerald-600">
                      ตรง
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-yellow-600">
                      ในเกณฑ์
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-red-600">
                      เกินเกณฑ์
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-orange-600">
                      รอชี้แจง
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">
                      สถานะ
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {monthlyStats.map((stat) => {
                    const allResolved = stat.pending === 0;
                    return (
                      <tr
                        key={stat.date}
                        onClick={() => {
                          setDetailDate(stat.date);
                          setSelectedDate(stat.date);
                        }}
                        className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      >
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                          {formatThaiDate(stat.date)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                          {stat.total}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-600">
                          {stat.match}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-yellow-600">
                          {stat.withinTolerance}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-red-600">
                          {stat.overTolerance}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-orange-600">
                          {stat.pending}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {allResolved ? (
                            <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="mx-auto h-4 w-4 text-amber-500" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Eye className="mx-auto h-4 w-4 text-gray-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="space-y-2 px-4 pb-4 md:hidden">
              {monthlyStats.map((stat) => {
                const allResolved = stat.pending === 0;
                return (
                  <button
                    key={stat.date}
                    onClick={() => {
                      setDetailDate(stat.date);
                      setSelectedDate(stat.date);
                    }}
                    className="w-full rounded-lg border border-gray-100 p-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        {formatThaiDate(stat.date)}
                      </span>
                      {allResolved ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Badge variant="warning">
                          {stat.pending} รอชี้แจง
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                          {stat.total}
                        </p>
                        <p className="text-[9px] text-gray-400">รายการ</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-600">
                          {stat.match}
                        </p>
                        <p className="text-[9px] text-gray-400">ตรง</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-yellow-600">
                          {stat.withinTolerance}
                        </p>
                        <p className="text-[9px] text-gray-400">ในเกณฑ์</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-red-600">
                          {stat.overTolerance}
                        </p>
                        <p className="text-[9px] text-gray-400">เกินเกณฑ์</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Search */}
      <Input
        placeholder="ค้นหาสินค้า..."
        leftIcon={<Search className="h-4 w-4" />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Status Filter Tabs */}
      <Tabs
        tabs={statusTabs}
        activeTab={filterStatus}
        onChange={(id) => setFilterStatus(id as FilterStatus)}
      />

      {/* Comparison Table (mobile-friendly card list) */}
      {filteredComparisons.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="ไม่มีข้อมูลเปรียบเทียบ"
          description={
            selectedDate
              ? 'ไม่พบข้อมูลสำหรับวันที่เลือก'
              : 'ยังไม่มีข้อมูลการเปรียบเทียบสต๊อก'
          }
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      สินค้า
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      POS
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      นับจริง
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      ส่วนต่าง
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      %
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">
                      ระดับ
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">
                      สถานะ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredComparisons.map((item) => {
                    const diffColor = getDiffColor(
                      item.difference,
                      item.diff_percent
                    );
                    const statusConfig = getStatusConfig(item.status);
                    return (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {item.product_name || item.product_code}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.product_code}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                          {item.pos_quantity !== null
                            ? formatNumber(item.pos_quantity)
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                          {item.manual_quantity !== null
                            ? formatNumber(item.manual_quantity)
                            : '-'}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-right font-bold',
                            diffColor.text
                          )}
                        >
                          {item.difference !== null
                            ? (item.difference > 0 ? '+' : '') +
                              formatNumber(item.difference)
                            : '-'}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-right text-xs font-medium',
                            diffColor.text
                          )}
                        >
                          {item.diff_percent !== null
                            ? formatPercent(item.diff_percent)
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              diffColor.bg,
                              diffColor.text
                            )}
                          >
                            {diffColor.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusConfig.variant}>
                            {statusConfig.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="space-y-2 md:hidden">
            {filteredComparisons.map((item) => {
              const diffColor = getDiffColor(
                item.difference,
                item.diff_percent
              );
              const statusConfig = getStatusConfig(item.status);
              const DiffIcon =
                item.difference === null || item.difference === 0
                  ? Minus
                  : item.difference > 0
                    ? TrendingUp
                    : TrendingDown;

              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-xl bg-white p-4 shadow-sm ring-1 dark:bg-gray-800',
                    diffColor.ring
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.product_name || item.product_code}
                      </p>
                      <p className="text-xs text-gray-400">{item.product_code}</p>
                    </div>
                    <Badge variant={statusConfig.variant}>
                      {statusConfig.label}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        POS
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.pos_quantity !== null
                          ? formatNumber(item.pos_quantity)
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        นับจริง
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.manual_quantity !== null
                          ? formatNumber(item.manual_quantity)
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        ส่วนต่าง
                      </p>
                      <div className="flex items-center gap-1">
                        <DiffIcon
                          className={cn('h-3.5 w-3.5', diffColor.text)}
                        />
                        <p className={cn('text-sm font-bold', diffColor.text)}>
                          {item.difference !== null
                            ? (item.difference > 0 ? '+' : '') +
                              formatNumber(item.difference)
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        diffColor.bg,
                        diffColor.text
                      )}
                    >
                      {diffColor.label}
                      {item.diff_percent !== null &&
                        ` (${formatPercent(item.diff_percent)})`}
                    </span>
                    {item.explanation && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        มีคำชี้แจง
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={!!detailDate}
        onClose={() => setDetailDate(null)}
        title={detailDate ? `รายละเอียด ${formatThaiDate(detailDate)}` : ''}
        size="full"
      >
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Modal summary */}
          {detailDate &&
            (() => {
              const stat = monthlyStats.find((s) => s.date === detailDate);
              if (!stat) return null;
              return (
                <div className="mb-4 grid grid-cols-4 gap-2">
                  <div className="rounded-lg bg-blue-50 p-2 text-center dark:bg-blue-900/20">
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
                      {stat.total}
                    </p>
                    <p className="text-[9px] text-blue-600">ทั้งหมด</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2 text-center dark:bg-emerald-900/20">
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {stat.match}
                    </p>
                    <p className="text-[9px] text-emerald-600">ตรง</p>
                  </div>
                  <div className="rounded-lg bg-yellow-50 p-2 text-center dark:bg-yellow-900/20">
                    <p className="text-sm font-bold text-yellow-700 dark:text-yellow-400">
                      {stat.withinTolerance}
                    </p>
                    <p className="text-[9px] text-yellow-600">ในเกณฑ์</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-2 text-center dark:bg-red-900/20">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400">
                      {stat.overTolerance}
                    </p>
                    <p className="text-[9px] text-red-600">เกินเกณฑ์</p>
                  </div>
                </div>
              );
            })()}

          {/* Items list */}
          <div className="space-y-2">
            {detailItems.map((item) => {
              const diffColor = getDiffColor(item.difference, item.diff_percent);
              const statusConfig = getStatusConfig(item.status);
              return (
                <div
                  key={item.id}
                  className={cn('rounded-lg border p-3', diffColor.ring)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.product_name || item.product_code}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {item.product_code}
                      </p>
                    </div>
                    <Badge variant={statusConfig.variant}>
                      {statusConfig.label}
                    </Badge>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">POS: </span>
                      <span className="font-medium text-gray-700 dark:text-gray-200">
                        {item.pos_quantity !== null
                          ? formatNumber(item.pos_quantity)
                          : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">นับ: </span>
                      <span className="font-medium text-gray-700 dark:text-gray-200">
                        {item.manual_quantity !== null
                          ? formatNumber(item.manual_quantity)
                          : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">ต่าง: </span>
                      <span className={cn('font-bold', diffColor.text)}>
                        {item.difference !== null
                          ? (item.difference > 0 ? '+' : '') +
                            formatNumber(item.difference)
                          : '-'}
                      </span>
                    </div>
                    <div>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          diffColor.bg,
                          diffColor.text,
                        )}
                      >
                        {diffColor.label}
                      </span>
                    </div>
                  </div>

                  {/* Explanation */}
                  {item.explanation && (
                    <div className="mt-2 rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
                      <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                        คำชี้แจง:
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {item.explanation}
                      </p>
                    </div>
                  )}
                  {item.owner_notes && (
                    <div className="mt-1 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                      <p className="text-[10px] font-medium text-gray-500">
                        หมายเหตุเจ้าของ:
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        {item.owner_notes}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
