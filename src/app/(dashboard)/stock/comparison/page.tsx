'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Input, Badge, Card, CardHeader, Tabs, EmptyState, toast } from '@/components/ui';
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

export default function ComparisonPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);

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
    </div>
  );
}
