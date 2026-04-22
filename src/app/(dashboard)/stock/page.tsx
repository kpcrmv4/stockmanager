'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Badge, Card, CardHeader, CardContent, EmptyState, toast } from '@/components/ui';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import { yesterdayBangkok } from '@/lib/utils/date';
import { useTranslations } from 'next-intl';
import {
  Package,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  BarChart3,
  FileText,
  ScanLine,
  ArrowRight,
  ArrowLeft,
  Clock,
  Loader2,
  RefreshCw,
  Inbox,
  Upload,
  Store,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface CrossStoreItem {
  storeId: string;
  storeName: string;
  manualCounted: boolean;
  posUploaded: boolean;
  compared: boolean;
  matchCount: number;
  totalCount: number;
  pendingCount: number;
  missingCount: number;
  surplusCount: number;
}

interface TrendDataItem {
  date: string;
  label: string;
  missing: number;
  surplus: number;
  total: number;
}

interface StockSummary {
  totalProducts: number;
  lastCheckDate: string | null;
  pendingExplanations: number;
  pendingApprovals: number;
}

interface RecentCheck {
  id: string;
  comp_date: string;
  totalItems: number;
  matchCount: number;
  discrepancyCount: number;
  status: string;
}

export default function StockOverviewPage() {
  const t = useTranslations('stock');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StockSummary>({
    totalProducts: 0,
    lastCheckDate: null,
    pendingExplanations: 0,
    pendingApprovals: 0,
  });
  const [recentChecks, setRecentChecks] = useState<RecentCheck[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendData, setTrendData] = useState<TrendDataItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Today's business date status card
  const businessDate = yesterdayBangkok();
  const [todayStatus, setTodayStatus] = useState<{
    manualCount: number;
    totalProducts: number;
    posUploaded: boolean;
    compared: boolean;
    overTolerance: number;
    missingCount: number;
    surplusCount: number;
  }>({
    manualCount: 0,
    totalProducts: 0,
    posUploaded: false,
    compared: false,
    overTolerance: 0,
    missingCount: 0,
    surplusCount: 0,
  });

  const fetchData = useCallback(async () => {
    if (!currentStoreId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      // Fetch total active products
      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', currentStoreId)
        .eq('active', true);

      // Fetch latest manual count date
      const { data: latestCount } = await supabase
        .from('manual_counts')
        .select('count_date')
        .eq('store_id', currentStoreId)
        .order('count_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fetch pending explanations
      const { count: pendingExplanations } = await supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', currentStoreId)
        .eq('status', 'pending');

      // Fetch pending approvals
      const { count: pendingApprovals } = await supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', currentStoreId)
        .eq('status', 'explained');

      setSummary({
        totalProducts: productCount || 0,
        lastCheckDate: latestCount?.count_date || null,
        pendingExplanations: pendingExplanations || 0,
        pendingApprovals: pendingApprovals || 0,
      });

      // ── Fetch today's business date status ──
      const { count: manualCountToday } = await supabase
        .from('manual_counts')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', currentStoreId)
        .eq('count_date', businessDate);

      const { count: countableProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', currentStoreId)
        .eq('active', true)
        .eq('count_status', 'active');

      const { data: posLogs } = await supabase
        .from('ocr_logs')
        .select('id')
        .eq('store_id', currentStoreId)
        .eq('upload_date', businessDate)
        .limit(1);

      const { data: compData } = await supabase
        .from('comparisons')
        .select('status, difference')
        .eq('store_id', currentStoreId)
        .eq('comp_date', businessDate);

      const hasComparisons = (compData?.length || 0) > 0;
      const overTol =
        compData?.filter((c) => c.status === 'pending').length || 0;
      const missingCount =
        compData?.filter((c) => (c.difference || 0) < 0).length || 0;
      const surplusCount =
        compData?.filter((c) => (c.difference || 0) > 0).length || 0;

      setTodayStatus({
        manualCount: manualCountToday || 0,
        totalProducts: countableProducts || 0,
        posUploaded: (posLogs?.length || 0) > 0,
        compared: hasComparisons,
        overTolerance: overTol,
        missingCount,
        surplusCount,
      });

      // Fetch recent comparison dates (grouped)
      const { data: recentComparisons } = await supabase
        .from('comparisons')
        .select('id, comp_date, product_code, difference, status')
        .eq('store_id', currentStoreId)
        .order('comp_date', { ascending: false })
        .limit(100);

      if (recentComparisons && recentComparisons.length > 0) {
        // Group by comp_date
        const grouped = recentComparisons.reduce<
          Record<string, { items: typeof recentComparisons }>
        >((acc, item) => {
          if (!acc[item.comp_date]) {
            acc[item.comp_date] = { items: [] };
          }
          acc[item.comp_date].items.push(item);
          return acc;
        }, {});

        const checks: RecentCheck[] = Object.entries(grouped)
          .slice(0, 5)
          .map(([date, group]) => {
            const matchCount = group.items.filter(
              (i) => i.difference === 0 || i.difference === null
            ).length;
            const discrepancyCount = group.items.filter(
              (i) => i.difference !== 0 && i.difference !== null
            ).length;
            const hasAllApproved = group.items.every(
              (i) => i.status === 'approved'
            );
            const hasPending = group.items.some(
              (i) => i.status === 'pending'
            );

            return {
              id: date,
              comp_date: date,
              totalItems: group.items.length,
              matchCount,
              discrepancyCount,
              status: hasAllApproved
                ? 'approved'
                : hasPending
                  ? 'pending'
                  : 'in_progress',
            };
          });

        setRecentChecks(checks);
      }

    } catch (error) {
      console.error('Error fetching stock overview:', error);
      toast({
        type: 'error',
        title: t('errorOccurred'),
        message: t('errorLoadOverview'),
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, user?.role, user?.storeIds, businessDate, t]);

  const fetchTrendData = useCallback(async () => {
    const _isStaffOrBar = user?.role === 'staff' || user?.role === 'bar';
    if (_isStaffOrBar || !user?.storeIds || user.storeIds.length === 0) return;

    setTrendLoading(true);
    try {
      const supabase = createClient();
      const startOfMonth = `${selectedMonth}-01`;
      const endOfMonth = `${selectedMonth}-31`;

      const { data: trendComparisons } = await supabase
        .from('comparisons')
        .select('comp_date, difference')
        .in('store_id', user.storeIds)
        .gte('comp_date', startOfMonth)
        .lte('comp_date', endOfMonth)
        .order('comp_date', { ascending: true });

      if (trendComparisons) {
        const trendMap = trendComparisons.reduce<Record<string, TrendDataItem>>((acc, item) => {
          const date = item.comp_date;
          if (!acc[date]) {
            acc[date] = { date, label: date.slice(8, 10), missing: 0, surplus: 0, total: 0 };
          }
          acc[date].total++;
          if (item.difference < 0) acc[date].missing++;
          else if (item.difference > 0) acc[date].surplus++;
          return acc;
        }, {});

        setTrendData(Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date)));
      } else {
        setTrendData([]);
      }
    } catch (error) {
      console.error('Error fetching trend data:', error);
    } finally {
      setTrendLoading(false);
    }
  }, [selectedMonth, user?.role, user?.storeIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  const summaryCards = [
    {
      label: t('totalProducts'),
      value: formatNumber(summary.totalProducts),
      icon: Package,
      lightBg: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: t('lastStockCheck'),
      value: summary.lastCheckDate
        ? formatThaiDate(summary.lastCheckDate)
        : t('neverCounted'),
      icon: CalendarCheck,
      lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      isDate: true,
    },
    {
      label: t('pendingExplanation'),
      value: formatNumber(summary.pendingExplanations),
      icon: AlertTriangle,
      lightBg: 'bg-amber-50 dark:bg-amber-900/20',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: t('pendingApproval'),
      value: formatNumber(summary.pendingApprovals),
      icon: CheckCircle2,
      lightBg: 'bg-violet-50 dark:bg-violet-900/20',
      textColor: 'text-violet-600 dark:text-violet-400',
    },
  ];

  const isStaffOrBar = user?.role === 'staff' || user?.role === 'bar';

  const allQuickActions = [
    {
      label: t('countStock'),
      description: t('dailyStockCount'),
      icon: ScanLine,
      href: '/stock/daily-check',
      gradient: 'from-blue-500 to-indigo-600',
      shadow: 'shadow-blue-500/25',
      staffVisible: true,
    },
    {
      label: t('uploadPOS'),
      description: t('importFromTxt'),
      icon: Upload,
      href: '/stock/txt-upload',
      gradient: 'from-cyan-500 to-teal-600',
      shadow: 'shadow-cyan-500/25',
      staffVisible: false,
    },
    {
      label: t('viewComparison'),
      description: t('posVsManual'),
      icon: BarChart3,
      href: '/stock/comparison',
      gradient: 'from-emerald-500 to-green-600',
      shadow: 'shadow-emerald-500/25',
      staffVisible: true,
    },
    {
      label: t('explainDiscrepancy'),
      description: t('explainDiscrepancyDesc'),
      icon: FileText,
      href: '/stock/explanation',
      gradient: 'from-amber-500 to-orange-600',
      shadow: 'shadow-amber-500/25',
      staffVisible: true,
    },
    {
      label: t('approve'),
      description: t('approveDesc'),
      icon: ClipboardList,
      href: '/stock/approval',
      gradient: 'from-violet-500 to-purple-600',
      shadow: 'shadow-violet-500/25',
      staffVisible: false,
    },
  ];

  const quickActions = isStaffOrBar
    ? allQuickActions.filter((a) => a.staffVisible)
    : allQuickActions;

  function getCheckStatusBadge(status: string) {
    switch (status) {
      case 'approved':
        return { label: t('statusApproved'), variant: 'success' as const };
      case 'pending':
        return { label: t('statusPendingExplanation'), variant: 'warning' as const };
      case 'in_progress':
        return { label: t('statusInProgress'), variant: 'info' as const };
      default:
        return { label: status, variant: 'default' as const };
    }
  }

  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 15);
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'long',
    }).format(d);
  }, [selectedMonth]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!currentStoreId) {
    return (
      <EmptyState
        icon={Package}
        title={t('noStoreTitle')}
        description={t('noStoreDesc')}
        action={
          <Button
            size="sm"
            onClick={() => { window.location.href = '/settings'; }}
          >
            {t('goToSettings')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">
            {t('title')}
          </h1>
          <p className="mt-0.5 text-xs text-gray-500 sm:mt-1 sm:text-sm dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/stock/products"
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors sm:px-3 sm:py-2 sm:text-sm hover:bg-cyan-700 active:bg-cyan-800"
          >
            <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {t('manageProducts')}
          </Link>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            onClick={fetchData}
          >
            {t('refresh')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {card.label}
                  </p>
                  <p
                    className={cn(
                      'mt-1 font-bold text-gray-900 dark:text-white',
                      card.isDate ? 'text-sm' : 'text-2xl'
                    )}
                  >
                    {card.value}
                  </p>
                </div>
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    card.lightBg
                  )}
                >
                  <Icon className={cn('h-5 w-5', card.textColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Today's Stock Status Card */}
      <Card>
        <CardHeader
          title={`${t('stockStatusTitle')} — ${formatThaiDate(businessDate)}`}
        />
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Manual Count */}
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl p-3',
                todayStatus.manualCount > 0
                  ? 'bg-emerald-50 dark:bg-emerald-900/20'
                  : 'bg-gray-50 dark:bg-gray-700/50',
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  todayStatus.manualCount > 0
                    ? 'bg-emerald-100 dark:bg-emerald-900/40'
                    : 'bg-gray-200 dark:bg-gray-600',
                )}
              >
                {todayStatus.manualCount > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('manualCount')}
                </p>
                <p
                  className={cn(
                    'text-sm font-medium',
                    todayStatus.manualCount > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                >
                  {todayStatus.manualCount > 0
                    ? `${todayStatus.manualCount}/${todayStatus.totalProducts}`
                    : t('notCounted')}
                </p>
              </div>
            </div>

            {/* POS Upload */}
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl p-3',
                todayStatus.posUploaded
                  ? 'bg-emerald-50 dark:bg-emerald-900/20'
                  : 'bg-gray-50 dark:bg-gray-700/50',
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  todayStatus.posUploaded
                    ? 'bg-emerald-100 dark:bg-emerald-900/40'
                    : 'bg-gray-200 dark:bg-gray-600',
                )}
              >
                {todayStatus.posUploaded ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Upload className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('uploadPOS')}
                </p>
                <p
                  className={cn(
                    'text-sm font-medium',
                    todayStatus.posUploaded
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                >
                  {todayStatus.posUploaded ? t('uploaded') : t('notUploaded')}
                </p>
              </div>
            </div>

            {/* Comparison */}
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl p-3',
                todayStatus.compared
                  ? todayStatus.overTolerance > 0
                    ? 'bg-amber-50 dark:bg-amber-900/20'
                    : 'bg-emerald-50 dark:bg-emerald-900/20'
                  : 'bg-gray-50 dark:bg-gray-700/50',
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  todayStatus.compared
                    ? todayStatus.overTolerance > 0
                      ? 'bg-amber-100 dark:bg-amber-900/40'
                      : 'bg-emerald-100 dark:bg-emerald-900/40'
                    : 'bg-gray-200 dark:bg-gray-600',
                )}
              >
                {todayStatus.compared ? (
                  todayStatus.overTolerance > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  )
                ) : (
                  <BarChart3 className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('comparisonLabel')}
                </p>
                <div className="flex flex-col">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      todayStatus.compared
                        ? todayStatus.overTolerance > 0
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                        : 'text-gray-500 dark:text-gray-400',
                    )}
                  >
                    {todayStatus.compared
                      ? todayStatus.overTolerance > 0
                        ? t('overToleranceCount', { count: todayStatus.overTolerance })
                        : t('allPassed')
                      : t('notCompared')}
                  </p>
                  {todayStatus.compared && (
                    <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                      <span className="text-red-500">{t('shortage')}: {todayStatus.missingCount}</span>
                      <span className="text-amber-600 dark:text-amber-500">{t('excess')}: {todayStatus.surplusCount}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Overall status */}
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl p-3',
                todayStatus.manualCount > 0 &&
                  todayStatus.posUploaded &&
                  todayStatus.compared
                  ? todayStatus.overTolerance === 0
                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                    : 'bg-amber-50 dark:bg-amber-900/20'
                  : 'bg-blue-50 dark:bg-blue-900/20',
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  todayStatus.manualCount > 0 &&
                    todayStatus.posUploaded &&
                    todayStatus.compared
                    ? todayStatus.overTolerance === 0
                      ? 'bg-emerald-100 dark:bg-emerald-900/40'
                      : 'bg-amber-100 dark:bg-amber-900/40'
                    : 'bg-blue-100 dark:bg-blue-900/40',
                )}
              >
                {todayStatus.manualCount > 0 &&
                todayStatus.posUploaded &&
                todayStatus.compared ? (
                  todayStatus.overTolerance === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )
                ) : (
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('overallStatus')}
                </p>
                <p
                  className={cn(
                    'text-sm font-medium',
                    todayStatus.manualCount > 0 &&
                      todayStatus.posUploaded &&
                      todayStatus.compared
                      ? todayStatus.overTolerance === 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                      : 'text-blue-700 dark:text-blue-400',
                  )}
                >
                  {todayStatus.manualCount > 0 &&
                  todayStatus.posUploaded &&
                  todayStatus.compared
                    ? todayStatus.overTolerance === 0
                      ? t('statusComplete')
                      : t('statusPendingExplanation')
                    : t('statusInProgress')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Prominent Comparison Result Card ── */}
      {todayStatus.compared && (
        <Card>
          <CardHeader
            title={t('comparisonResultTitle')}
            action={
              <Link
                href="/stock/comparison"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                {t('viewDetails')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-900/20">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {t('match')}
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-300">
                  {formatNumber(
                    Math.max(
                      0,
                      todayStatus.manualCount -
                        todayStatus.missingCount -
                        todayStatus.surplusCount,
                    ),
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-red-50 p-4 dark:bg-red-900/20">
                <p className="text-xs text-red-700 dark:text-red-400">
                  {t('shortage')}
                </p>
                <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">
                  {formatNumber(todayStatus.missingCount)}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-900/20">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t('excess')}
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {formatNumber(todayStatus.surplusCount)}
                </p>
              </div>
              <div
                className={cn(
                  'rounded-xl p-4',
                  todayStatus.overTolerance > 0
                    ? 'bg-rose-50 dark:bg-rose-900/20'
                    : 'bg-gray-50 dark:bg-gray-700/40',
                )}
              >
                <p
                  className={cn(
                    'text-xs',
                    todayStatus.overTolerance > 0
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-gray-600 dark:text-gray-400',
                  )}
                >
                  {t('overToleranceLabel')}
                </p>
                <p
                  className={cn(
                    'mt-1 text-2xl font-bold',
                    todayStatus.overTolerance > 0
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-gray-700 dark:text-gray-300',
                  )}
                >
                  {formatNumber(todayStatus.overTolerance)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>
                {todayStatus.overTolerance === 0
                  ? t('comparisonResultAllPass')
                  : t('comparisonResultNeedAttention')}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Discrepancy Trend Graph */}
      {!isStaffOrBar && (
        <Card>
          <CardHeader
            title={t('discrepancyTrend')}
            className="flex-col items-center text-center space-y-3 sm:flex-row sm:items-center sm:text-left sm:space-y-0"
            action={
              <div className="flex items-center justify-center gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateMonth(-1)}
                  className="h-8 w-8 p-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[100px] sm:min-w-[120px] text-center text-xs sm:text-sm font-medium">
                  {monthLabel}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateMonth(1)}
                  className="h-8 w-8 p-0"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            }
          />
          <CardContent className="px-1 sm:px-5">
            {trendLoading ? (
              <div className="flex h-[300px] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : trendData.length > 0 ? (
              <div className="h-[250px] sm:h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={trendData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E5E7EB"
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#9CA3AF', fontSize: 10 }}
                      dy={5}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#9CA3AF', fontSize: 10 }}
                    />
                    <Tooltip
                      cursor={{ fill: '#F3F4F6' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const dateStr = trendData.find(d => d.label === label)?.date || '';
                          return (
                            <div className="rounded-lg bg-white p-3 shadow-xl ring-1 ring-black/5 dark:bg-gray-800">
                              <p className="mb-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                                {formatThaiDate(dateStr)}
                              </p>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-8">
                                  <span className="flex items-center gap-1.5 text-xs text-red-600">
                                    <div className="h-2 w-2 rounded-full bg-red-500" />
                                    {t('shortage')}
                                  </span>
                                  <span className="text-xs font-bold text-red-700 dark:text-red-400">
                                    {payload[0].value}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-8">
                                  <span className="flex items-center gap-1.5 text-xs text-amber-600">
                                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                                    {t('excess')}
                                  </span>
                                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                    {payload[1].value}
                                  </span>
                                </div>
                                <div className="mt-2 border-t pt-2 flex items-center justify-between gap-8">
                                  <span className="text-xs text-gray-600 dark:text-gray-400">
                                    {t('common.total')}
                                  </span>
                                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                                    {(payload[0].value as number) + (payload[1].value as number)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      iconType="circle"
                      wrapperStyle={{ paddingBottom: '10px' }}
                      formatter={(value) => (
                        <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
                          {value === 'missing' ? t('shortage') : t('excess')}
                        </span>
                      )}
                    />
                    <Bar
                      dataKey="missing"
                      fill="#EF4444"
                      radius={[4, 4, 0, 0]}
                      barSize={12}
                    />
                    <Bar
                      dataKey="surplus"
                      fill="#F59E0B"
                      radius={[4, 4, 0, 0]}
                      barSize={12}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[300px] flex-col items-center justify-center text-gray-400">
                <BarChart3 className="mb-2 h-10 w-10 opacity-20" />
                <p className="text-sm">{t('noData')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className={cn(
        'grid gap-3',
        quickActions.length <= 3
          ? 'grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
      )}>
        {quickActions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <a
              key={action.label}
              href={action.href}
              className={cn(
                'group relative flex flex-col items-center gap-2.5 rounded-2xl bg-gradient-to-br px-3 py-6 text-white',
                'shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:shadow-md',
                action.gradient,
                action.shadow
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
                <ActionIcon className="h-6 w-6" />
              </div>
              <span className="text-sm font-semibold">{action.label}</span>
              <span className="text-center text-[11px] leading-tight text-white/75">
                {action.description}
              </span>
            </a>
          );
        })}
      </div>

      {/* Recent Stock Checks */}
      <Card padding="none">
        <CardHeader
          title={t('recentStockChecks')}
          action={
            <a
              href="/stock/comparison"
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {t('viewAll')}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          }
        />
        {recentChecks.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('noStockCheckTitle')}
            description={t('noStockCheckDesc')}
            action={
              <Button
                size="sm"
                icon={<ScanLine className="h-4 w-4" />}
                onClick={() => {
                  window.location.href = '/stock/daily-check';
                }}
              >
                {t('startStockCount')}
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentChecks.map((check) => {
              const badge = getCheckStatusBadge(check.status);
              return (
                <a
                  key={check.id}
                  href={`/stock/comparison?date=${check.comp_date}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      check.discrepancyCount > 0
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        : 'bg-emerald-50 dark:bg-emerald-900/20'
                    )}
                  >
                    <ClipboardList
                      className={cn(
                        'h-5 w-5',
                        check.discrepancyCount > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {formatThaiDate(check.comp_date)}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      <span>{t('totalItems')}: {check.totalItems}</span>
                      <span className="h-1 w-1 rounded-full bg-gray-300" />
                      <span className={cn(check.discrepancyCount > 0 ? "text-amber-600 font-medium" : "")}>
                        {t('comparison.difference')}: {check.discrepancyCount}
                      </span>
                    </div>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                </a>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
