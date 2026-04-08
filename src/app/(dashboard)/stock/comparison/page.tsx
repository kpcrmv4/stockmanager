'use client';

import { useTranslations } from 'next-intl';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Input, Badge, Card, CardHeader, Tabs, EmptyState, toast, Modal } from '@/components/ui';
import { nowBangkok } from '@/lib/utils/date';
import { formatThaiDate, formatThaiShortDate, formatNumber, formatPercent } from '@/lib/utils/format';
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
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

type FilterStatus = 'all' | ComparisonStatus;

function getStatusConfig(status: ComparisonStatus, t?: (key: string) => string) {
  switch (status) {
    case 'pending':
      return {
        label: t?.('comparison.statusPending') ?? 'Pending',
        variant: 'warning' as const,
        icon: Clock,
      };
    case 'explained':
      return {
        label: t?.('comparison.statusExplained') ?? 'Explained',
        variant: 'info' as const,
        icon: FileText,
      };
    case 'approved':
      return {
        label: t?.('comparison.statusApproved') ?? 'Approved',
        variant: 'success' as const,
        icon: CheckCircle2,
      };
    case 'rejected':
      return {
        label: t?.('comparison.statusRejected') ?? 'Rejected',
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
      labelKey: 'comparison.match',
    };
  }
  const absPct = Math.abs(diffPercent || 0);
  if (absPct <= 5) {
    return {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      text: 'text-yellow-700 dark:text-yellow-400',
      ring: 'ring-yellow-200 dark:ring-yellow-800',
      labelKey: 'comparison.withinTolerance',
    };
  }
  return {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    ring: 'ring-red-200 dark:ring-red-800',
    labelKey: 'comparison.overTolerance',
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
  const t = useTranslations('stock');
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
  const [posFileUrl, setPosFileUrl] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<'week' | 'month'>('week');
  const [productViewSearch, setProductViewSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

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
        title: t('comparison.errorTitle'),
        message: t('comparison.errorLoadData'),
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    fetchComparisons();
  }, [fetchComparisons]);

  // Fetch POS file URL for the selected date
  useEffect(() => {
    if (!currentStoreId || !selectedDate) {
      setPosFileUrl(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from('ocr_logs')
      .select('file_urls')
      .eq('store_id', currentStoreId)
      .eq('upload_method', 'txt')
      .gte('upload_date', `${selectedDate}T00:00:00`)
      .lt('upload_date', `${selectedDate}T23:59:59`)
      .order('upload_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setPosFileUrl(data?.file_urls?.[0] || null);
      });
  }, [currentStoreId, selectedDate]);

  // Status filter tabs
  const statusTabs = useMemo(() => {
    const dateComparisons = selectedDate
      ? comparisons.filter((c) => c.comp_date === selectedDate)
      : comparisons;

    return [
      { id: 'all', label: t('comparison.all'), count: dateComparisons.length },
      {
        id: 'pending',
        label: t('comparison.statusPending'),
        count: dateComparisons.filter((c) => c.status === 'pending').length,
      },
      {
        id: 'explained',
        label: t('comparison.statusExplained'),
        count: dateComparisons.filter((c) => c.status === 'explained').length,
      },
      {
        id: 'approved',
        label: t('comparison.statusApproved'),
        count: dateComparisons.filter((c) => c.status === 'approved').length,
      },
      {
        id: 'rejected',
        label: t('comparison.statusRejected'),
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

  // ── Trend chart data (week / month) ──
  const trendChartData = useMemo(() => {
    const now = nowBangkok();
    let startDate: string;

    if (trendRange === 'week') {
      // Current week: Monday to Sunday
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday = 0
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      startDate = monday.toISOString().slice(0, 10);
    } else {
      // Current month
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    const endDate = now.toISOString().slice(0, 10);

    const dateGroups = new Map<string, Comparison[]>();
    for (const c of comparisons) {
      if (c.comp_date >= startDate && c.comp_date <= endDate) {
        const group = dateGroups.get(c.comp_date) || [];
        group.push(c);
        dateGroups.set(c.comp_date, group);
      }
    }

    const result: Array<{
      date: string;
      label: string;
      total: number;
      match: number;
      withinTolerance: number;
      overTolerance: number;
    }> = [];

    for (const [date, items] of dateGroups) {
      const dayOfWeek = new Date(date).toLocaleDateString('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' });
      result.push({
        date,
        label: trendRange === 'week' ? dayOfWeek : date.slice(8, 10),
        total: items.length,
        match: items.filter((i) => i.difference === 0 || i.difference === null).length,
        withinTolerance: items.filter(
          (i) => i.difference !== 0 && i.difference !== null && Math.abs(i.diff_percent || 0) <= 5,
        ).length,
        overTolerance: items.filter(
          (i) => i.difference !== 0 && i.difference !== null && Math.abs(i.diff_percent || 0) > 5,
        ).length,
      });
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [comparisons, trendRange]);

  // ── Per-product cross-day view ──
  const productCrossDayData = useMemo(() => {
    // Use same date range as trend
    const now = nowBangkok();
    let startDate: string;

    if (trendRange === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      startDate = monday.toISOString().slice(0, 10);
    } else {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    const endDate = now.toISOString().slice(0, 10);
    const rangeComps = comparisons.filter((c) => c.comp_date >= startDate && c.comp_date <= endDate);

    // Group by product
    const productMap = new Map<
      string,
      {
        product_code: string;
        product_name: string;
        days: Map<string, { difference: number | null; pos_qty: number | null; manual_qty: number | null; status: string }>;
        totalOverTolerance: number;
        avgDiff: number;
      }
    >();

    const allDates = [...new Set(rangeComps.map((c) => c.comp_date))].sort();

    for (const c of rangeComps) {
      if (!productMap.has(c.product_code)) {
        productMap.set(c.product_code, {
          product_code: c.product_code,
          product_name: c.product_name || c.product_code,
          days: new Map(),
          totalOverTolerance: 0,
          avgDiff: 0,
        });
      }
      const p = productMap.get(c.product_code)!;
      p.days.set(c.comp_date, {
        difference: c.difference,
        pos_qty: c.pos_quantity,
        manual_qty: c.manual_quantity,
        status: c.status,
      });
      if (c.difference !== null && c.difference !== 0 && Math.abs(c.diff_percent || 0) > 5) {
        p.totalOverTolerance++;
      }
    }

    // Calculate avgDiff
    for (const p of productMap.values()) {
      const diffs = [...p.days.values()].filter((d) => d.difference !== null).map((d) => d.difference!);
      p.avgDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    }

    // Sort: most problematic first
    let products = [...productMap.values()].sort((a, b) => b.totalOverTolerance - a.totalOverTolerance || Math.abs(b.avgDiff) - Math.abs(a.avgDiff));

    // Filter by search
    if (productViewSearch.trim()) {
      const q = productViewSearch.toLowerCase();
      products = products.filter(
        (p) => p.product_name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q),
      );
    }

    return { products: products.slice(0, 50), allDates };
  }, [comparisons, trendRange, productViewSearch]);

  // ── Selected product history (for modal) ──
  const selectedProductHistory = useMemo(() => {
    if (!selectedProduct) return [];
    return comparisons
      .filter((c) => c.product_code === selectedProduct)
      .sort((a, b) => a.comp_date.localeCompare(b.comp_date))
      .slice(-30); // last 30 entries
  }, [comparisons, selectedProduct]);

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
              {t('comparison.title')}
            </h1>
          </div>
          <p className="mt-0.5 ml-9 text-sm text-gray-500 dark:text-gray-400">
            {t('comparison.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {posFileUrl && (
            <a href={posFileUrl} target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                size="sm"
                icon={<FileText className="h-4 w-4" />}
              >
                {t('comparison.posFile')}
              </Button>
            </a>
          )}
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={fetchComparisons}
          >
            {t('comparison.refresh')}
          </Button>
        </div>
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
          <p className="text-[10px] text-blue-600 dark:text-blue-500">{t('comparison.all')}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-3 text-center dark:bg-emerald-900/20">
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {stats.match}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{t('comparison.match')}</p>
        </div>
        <div className="rounded-xl bg-yellow-50 px-3 py-3 text-center dark:bg-yellow-900/20">
          <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">
            {stats.withinTolerance}
          </p>
          <p className="text-[10px] text-yellow-600 dark:text-yellow-500">
            {t('comparison.withinTolerance')}
          </p>
        </div>
        <div className="rounded-xl bg-red-50 px-3 py-3 text-center dark:bg-red-900/20">
          <p className="text-lg font-bold text-red-700 dark:text-red-400">
            {stats.overTolerance}
          </p>
          <p className="text-[10px] text-red-600 dark:text-red-500">{t('comparison.overTolerance')}</p>
        </div>
      </div>

      {/* Monthly Statistics */}
      <Card padding="none">
        <CardHeader
          title={t('comparison.dailyStats')}
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
            {t('comparison.noDataThisMonth')}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      {t('comparison.dateCol')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      {t('comparison.itemsCol')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-emerald-600">
                      {t('comparison.match')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-yellow-600">
                      {t('comparison.withinTolerance')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-red-600">
                      {t('comparison.overTolerance')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-orange-600">
                      {t('comparison.statusPending')}
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">
                      {t('comparison.statusCol')}
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
                          {stat.pending} {t('comparison.statusPending')}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                          {stat.total}
                        </p>
                        <p className="text-[9px] text-gray-400">{t('comparison.itemsCol')}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-600">
                          {stat.match}
                        </p>
                        <p className="text-[9px] text-gray-400">{t('comparison.match')}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-yellow-600">
                          {stat.withinTolerance}
                        </p>
                        <p className="text-[9px] text-gray-400">{t('comparison.withinTolerance')}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-red-600">
                          {stat.overTolerance}
                        </p>
                        <p className="text-[9px] text-gray-400">{t('comparison.overTolerance')}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* ── Trend Chart ── */}
      <Card padding="none">
        <CardHeader
          title={t('comparison.trendTitle')}
          action={
            <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-700">
              <button
                onClick={() => setTrendRange('week')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  trendRange === 'week'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400',
                )}
              >
                {t('comparison.thisWeek')}
              </button>
              <button
                onClick={() => setTrendRange('month')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  trendRange === 'month'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400',
                )}
              >
                {t('comparison.thisMonth')}
              </button>
            </div>
          }
        />
        {trendChartData.length === 0 ? (
          <div className="px-4 pb-4 text-center text-xs text-gray-400">
            {t('comparison.noDataThisPeriod')}
          </div>
        ) : (
          <div className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendChartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: any, name: any) => {
                    const labels: Record<string, string> = {
                      match: t('comparison.match'),
                      withinTolerance: t('comparison.withinTolerance'),
                      overTolerance: t('comparison.overTolerance'),
                    };
                    return [value, labels[name] || name];
                  }}
                  labelFormatter={(label: any, payload: any) => {
                    const item = payload?.[0]?.payload;
                    return item?.date ? formatThaiDate(item.date) : label;
                  }}
                />
                <Legend
                  formatter={(value: any) => {
                    const labels: Record<string, string> = {
                      match: t('comparison.match'),
                      withinTolerance: t('comparison.withinTolerance'),
                      overTolerance: t('comparison.overTolerance'),
                    };
                    return <span className="text-[10px]">{labels[value] || value}</span>;
                  }}
                />
                <Bar dataKey="match" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="withinTolerance" stackId="a" fill="#f59e0b" />
                <Bar dataKey="overTolerance" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ── Per-Product Cross-Day View ── */}
      <Card padding="none">
        <CardHeader
          title={t('comparison.productView')}
          description={t('comparison.productViewDesc', { range: trendRange === 'week' ? t('comparison.thisWeek') : t('comparison.thisMonth') })}
        />
        <div className="px-4 pb-2">
          <Input
            placeholder={t('comparison.searchProduct')}
            leftIcon={<Search className="h-4 w-4" />}
            value={productViewSearch}
            onChange={(e) => setProductViewSearch(e.target.value)}
          />
        </div>

        {productCrossDayData.products.length === 0 ? (
          <div className="px-4 pb-4 text-center text-xs text-gray-400">
            {t('comparison.noDataThisPeriod')}
          </div>
        ) : (
          <>
            {/* Date header row */}
            <div className="overflow-x-auto px-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="sticky left-0 bg-white py-2 pr-2 text-left font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400" style={{ minWidth: 140 }}>
                      {t('comparison.product')}
                    </th>
                    {productCrossDayData.allDates.map((date) => {
                      const d = new Date(date);
                      const dayName = d.toLocaleDateString('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' });
                      const dayNum = date.slice(8, 10);
                      return (
                        <th key={date} className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400" style={{ minWidth: 56 }}>
                          <div>{dayName}</div>
                          <div className="text-[10px] text-gray-400">{dayNum}</div>
                        </th>
                      );
                    })}
                    <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400" style={{ minWidth: 50 }}>
                      {t('comparison.times')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {productCrossDayData.products.map((product) => (
                    <tr
                      key={product.product_code}
                      onClick={() => setSelectedProduct(product.product_code)}
                      className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="sticky left-0 bg-white py-2 pr-2 dark:bg-gray-800" style={{ minWidth: 140 }}>
                        <p className="truncate text-xs font-medium text-gray-900 dark:text-white">
                          {product.product_name}
                        </p>
                        <p className="truncate text-[10px] text-gray-400">{product.product_code}</p>
                      </td>
                      {productCrossDayData.allDates.map((date) => {
                        const day = product.days.get(date);
                        if (!day) {
                          return (
                            <td key={date} className="px-2 py-2 text-center text-gray-300 dark:text-gray-600">
                              —
                            </td>
                          );
                        }
                        const diff = day.difference;
                        let cellBg = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
                        if (diff !== null && diff !== 0) {
                          const absDiff = Math.abs(diff);
                          if (absDiff > 5) {
                            cellBg = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
                          } else {
                            cellBg = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400';
                          }
                        }
                        return (
                          <td key={date} className="px-2 py-2 text-center">
                            <span className={cn('inline-block min-w-[32px] rounded-md px-1.5 py-0.5 text-[11px] font-bold', cellBg)}>
                              {diff === null ? '✓' : diff === 0 ? '✓' : (diff > 0 ? '+' : '') + diff}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center">
                        {product.totalOverTolerance > 0 ? (
                          <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                            {product.totalOverTolerance}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-3 pt-1 text-right text-[10px] text-gray-400">
              {t('comparison.showingProducts', { count: productCrossDayData.products.length })}
            </div>
          </>
        )}
      </Card>

      {/* ── Product History Modal ── */}
      <Modal
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        title={
          selectedProduct
            ? t('comparison.historyTitle', { name: comparisons.find((c) => c.product_code === selectedProduct)?.product_name || selectedProduct })
            : ''
        }
        size="full"
      >
        <div className="max-h-[60vh] overflow-y-auto">
          {selectedProductHistory.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{t('comparison.noData')}</p>
          ) : (
            <>
              {/* Mini line chart */}
              <div className="mb-4">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={selectedProductHistory.map((h) => ({
                    date: h.comp_date,
                    label: formatThaiShortDate(h.comp_date),
                    difference: h.difference ?? 0,
                    pos: h.pos_quantity ?? 0,
                    manual: h.manual_quantity ?? 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={30} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      formatter={(value: any, name: any) => {
                        const labels: Record<string, string> = { difference: t('comparison.difference'), pos: 'POS', manual: t('comparison.manualCount') };
                        return [value, labels[name] || name];
                      }}
                    />
                    <Legend formatter={(value: any) => {
                      const labels: Record<string, string> = { difference: t('comparison.difference'), pos: 'POS', manual: t('comparison.manualCount') };
                      return <span className="text-[10px]">{labels[value] || value}</span>;
                    }} />
                    <Line type="monotone" dataKey="pos" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="manual" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="difference" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* History table */}
              <div className="space-y-2">
                {selectedProductHistory.map((item) => {
                  const diffColor = getDiffColor(item.difference, item.diff_percent);
                  const statusConfig = getStatusConfig(item.status, t);
                  return (
                    <div key={item.id} className={cn('rounded-lg border p-3', diffColor.ring)}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                          {formatThaiDate(item.comp_date)}
                        </span>
                        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">POS: </span>
                          <span className="font-medium">{item.pos_quantity !== null ? formatNumber(item.pos_quantity) : '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">{t('comparison.countShort')}: </span>
                          <span className="font-medium">{item.manual_quantity !== null ? formatNumber(item.manual_quantity) : '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">{t('comparison.diffShort')}: </span>
                          <span className={cn('font-bold', diffColor.text)}>
                            {item.difference !== null ? (item.difference > 0 ? '+' : '') + formatNumber(item.difference) : '-'}
                          </span>
                        </div>
                        <div>
                          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', diffColor.bg, diffColor.text)}>
                            {t(diffColor.labelKey)}
                          </span>
                        </div>
                      </div>
                      {item.explanation && (
                        <div className="mt-2 rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
                          <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400">{t('comparison.explanationLabel')}:</p>
                          <p className="text-xs text-blue-700 dark:text-blue-300">{item.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Search */}
      <Input
        placeholder={t('comparison.searchProduct')}
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
          title={t('comparison.noData')}
          description={
            selectedDate
              ? t('comparison.noDataForDate')
              : t('comparison.noComparisonData')
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
                      {t('comparison.product')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      POS
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      {t('comparison.manualCount')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      {t('comparison.difference')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      %
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">
                      {t('comparison.level')}
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">
                      {t('comparison.statusCol')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredComparisons.map((item) => {
                    const diffColor = getDiffColor(
                      item.difference,
                      item.diff_percent
                    );
                    const statusConfig = getStatusConfig(item.status, t);
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
                            {t(diffColor.labelKey)}
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
              const statusConfig = getStatusConfig(item.status, t);
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
                        {t('comparison.manualCount')}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.manual_quantity !== null
                          ? formatNumber(item.manual_quantity)
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {t('comparison.difference')}
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
                      {t(diffColor.labelKey)}
                      {item.diff_percent !== null &&
                        ` (${formatPercent(item.diff_percent)})`}
                    </span>
                    {item.explanation && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {t('comparison.hasExplanation')}
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
        title={detailDate ? t('comparison.detailTitle', { date: formatThaiDate(detailDate) }) : ''}
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
                    <p className="text-[9px] text-blue-600">{t('comparison.all')}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2 text-center dark:bg-emerald-900/20">
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {stat.match}
                    </p>
                    <p className="text-[9px] text-emerald-600">{t('comparison.match')}</p>
                  </div>
                  <div className="rounded-lg bg-yellow-50 p-2 text-center dark:bg-yellow-900/20">
                    <p className="text-sm font-bold text-yellow-700 dark:text-yellow-400">
                      {stat.withinTolerance}
                    </p>
                    <p className="text-[9px] text-yellow-600">{t('comparison.withinTolerance')}</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-2 text-center dark:bg-red-900/20">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400">
                      {stat.overTolerance}
                    </p>
                    <p className="text-[9px] text-red-600">{t('comparison.overTolerance')}</p>
                  </div>
                </div>
              );
            })()}

          {/* Items list */}
          <div className="space-y-2">
            {detailItems.map((item) => {
              const diffColor = getDiffColor(item.difference, item.diff_percent);
              const statusConfig = getStatusConfig(item.status, t);
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
                      <span className="text-gray-400">{t('comparison.countShort')}: </span>
                      <span className="font-medium text-gray-700 dark:text-gray-200">
                        {item.manual_quantity !== null
                          ? formatNumber(item.manual_quantity)
                          : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">{t('comparison.diffShort')}: </span>
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
                        {t(diffColor.labelKey)}
                      </span>
                    </div>
                  </div>

                  {/* Explanation */}
                  {item.explanation && (
                    <div className="mt-2 rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
                      <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                        {t('comparison.explanationLabel')}:
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {item.explanation}
                      </p>
                    </div>
                  )}
                  {item.owner_notes && (
                    <div className="mt-1 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                      <p className="text-[10px] font-medium text-gray-500">
                        {t('comparison.ownerNotes')}:
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
