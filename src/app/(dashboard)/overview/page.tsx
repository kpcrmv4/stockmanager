'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, toast } from '@/components/ui';
import {
  Store,
  Wine,
  ClipboardCheck,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Users,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  Loader2,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverviewData {
  storeCount: number;
  totalDepositsInStore: number;
  pendingWithdrawals: number;
  expiringDeposits: number;
  pendingExplanations: number;
  pendingApprovals: number;
  pendingTransfers: number;
  totalUsers: number;
  totalProducts: number;
  lastCheckDate: string | null;
  depositsTrend: number;
  withdrawalsTrend: number;
  stockChecksTrend: number;
  penaltiesTrend: number;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  table_name: string | null;
  created_at: string;
  changed_by_name: string | null;
}

interface ModuleCardConfig {
  id: string;
  name: string;
  icon: LucideIcon;
  href: string;
  color: string;         // tailwind color name (indigo, emerald, ...)
  metrics: string[];      // computed metric strings
  description?: string;   // fallback if no metrics
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Thai relative-time string from an ISO timestamp */
function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'เมื่อสักครู่';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
  return formatThaiDate(isoDate);
}

/** Map audit_logs action to Thai label + icon + color */
function mapActivity(actionType: string, tableName: string | null): {
  label: string;
  icon: LucideIcon;
  colorClass: string;
} {
  if (actionType === 'INSERT' && tableName === 'deposits') {
    return { label: 'ฝากเหล้าใหม่', icon: Wine, colorClass: 'text-emerald-500' };
  }
  if (actionType === 'INSERT' && tableName === 'withdrawals') {
    return { label: 'เบิกเหล้า', icon: Package, colorClass: 'text-blue-500' };
  }
  if (actionType === 'UPDATE' && tableName === 'comparisons') {
    return { label: 'อัพเดตผลเปรียบเทียบ', icon: BarChart3, colorClass: 'text-amber-500' };
  }
  if (actionType === 'AUTO_DEACTIVATE') {
    return { label: 'ปิดสินค้าอัตโนมัติ', icon: XCircle, colorClass: 'text-red-500' };
  }
  if (actionType === 'AUTO_REACTIVATE') {
    return { label: 'เปิดสินค้าอัตโนมัติ', icon: CheckCircle2, colorClass: 'text-emerald-500' };
  }
  return { label: actionType || 'กิจกรรม', icon: Clock, colorClass: 'text-gray-400' };
}

/** Calculate percentage trend between two periods */
function calcTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
}

/** Badge showing trend percentage with directional arrow */
function TrendBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        isPositive
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-red-600 dark:text-red-400'
      )}
    >
      {isPositive ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : (
        <ArrowDownRight className="h-3.5 w-3.5" />
      )}
      {Math.abs(value)}%
    </span>
  );
}

/** Color utility maps keyed by module color name */
const COLOR_MAP: Record<
  string,
  { lightBg: string; text: string; border: string; iconBg: string }
> = {
  indigo: {
    lightBg: 'bg-indigo-50 dark:bg-indigo-900/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-l-indigo-500',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  emerald: {
    lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  blue: {
    lightBg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-l-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  violet: {
    lightBg: 'bg-violet-50 dark:bg-violet-900/20',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-l-violet-500',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
  },
  amber: {
    lightBg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
  },
  gray: {
    lightBg: 'bg-gray-50 dark:bg-gray-700/30',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-l-gray-400',
    iconBg: 'bg-gray-100 dark:bg-gray-700/40',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewData>({
    storeCount: 0,
    totalDepositsInStore: 0,
    pendingWithdrawals: 0,
    expiringDeposits: 0,
    pendingExplanations: 0,
    pendingApprovals: 0,
    pendingTransfers: 0,
    totalUsers: 0,
    totalProducts: 0,
    lastCheckDate: null,
    depositsTrend: 0,
    withdrawalsTrend: 0,
    stockChecksTrend: 0,
    penaltiesTrend: 0,
  });
  const [activities, setActivities] = useState<AuditLogEntry[]>([]);

  const isOwner = user?.role === 'owner';

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // For owner: no store filter (see all). For manager: filter by currentStoreId.
      const storeFilter = isOwner ? null : currentStoreId;

      // --- Stores count ---
      const storesQuery = supabase
        .from('stores')
        .select('*', { count: 'exact', head: true })
        .eq('active', true);
      const { count: storeCount } = await storesQuery;

      // --- Deposits in_store ---
      const depositsInStoreQuery = supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_store');
      if (storeFilter) depositsInStoreQuery.eq('store_id', storeFilter);
      const { count: totalDepositsInStore } = await depositsInStoreQuery;

      // --- Pending withdrawals ---
      const pendingWithdrawalsQuery = supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_withdrawal');
      if (storeFilter) pendingWithdrawalsQuery.eq('store_id', storeFilter);
      const { count: pendingWithdrawals } = await pendingWithdrawalsQuery;

      // --- Expiring deposits (within 7 days) ---
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const expiringQuery = supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_store')
        .lt('expiry_date', sevenDaysFromNow.toISOString())
        .gt('expiry_date', new Date().toISOString());
      if (storeFilter) expiringQuery.eq('store_id', storeFilter);
      const { count: expiringDeposits } = await expiringQuery;

      // --- Pending explanations (comparisons status=pending) ---
      const pendingExplQuery = supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (storeFilter) pendingExplQuery.eq('store_id', storeFilter);
      const { count: pendingExplanations } = await pendingExplQuery;

      // --- Pending approvals (comparisons status=explained) ---
      const pendingApprQuery = supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'explained');
      if (storeFilter) pendingApprQuery.eq('store_id', storeFilter);
      const { count: pendingApprovals } = await pendingApprQuery;

      // --- Pending transfers ---
      const pendingTransfersQuery = supabase
        .from('transfers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (storeFilter) pendingTransfersQuery.eq('from_store_id', storeFilter);
      const { count: pendingTransfers } = await pendingTransfersQuery;

      // --- Total active users ---
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('active', true);

      // --- Total active products ---
      const productsQuery = supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('active', true);
      if (storeFilter) productsQuery.eq('store_id', storeFilter);
      const { count: totalProducts } = await productsQuery;

      // --- Latest manual count date ---
      const latestCountQuery = supabase
        .from('manual_counts')
        .select('count_date')
        .order('count_date', { ascending: false })
        .limit(1);
      if (storeFilter) latestCountQuery.eq('store_id', storeFilter);
      const { data: latestCount } = await latestCountQuery.single();

      // --- Trend calculations: current period (last 30 days) vs previous period (30-60 days ago) ---
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(now.getDate() - 60);

      // Current period queries (last 30 days)
      const curDepositsQ = supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_store')
        .gte('created_at', thirtyDaysAgo.toISOString());
      if (storeFilter) curDepositsQ.eq('store_id', storeFilter);

      const curWithdrawalsQ = supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'withdrawn')
        .gte('created_at', thirtyDaysAgo.toISOString());
      if (storeFilter) curWithdrawalsQ.eq('store_id', storeFilter);

      const curStockChecksQ = supabase
        .from('manual_counts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      if (storeFilter) curStockChecksQ.eq('store_id', storeFilter);

      const curPenaltiesQ = supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'penalty')
        .gte('created_at', thirtyDaysAgo.toISOString());
      if (storeFilter) curPenaltiesQ.eq('store_id', storeFilter);

      // Previous period queries (30-60 days ago)
      const prevDepositsQ = supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_store')
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString());
      if (storeFilter) prevDepositsQ.eq('store_id', storeFilter);

      const prevWithdrawalsQ = supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'withdrawn')
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString());
      if (storeFilter) prevWithdrawalsQ.eq('store_id', storeFilter);

      const prevStockChecksQ = supabase
        .from('manual_counts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString());
      if (storeFilter) prevStockChecksQ.eq('store_id', storeFilter);

      const prevPenaltiesQ = supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'penalty')
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString());
      if (storeFilter) prevPenaltiesQ.eq('store_id', storeFilter);

      // Execute all trend queries in parallel
      const [
        { count: curDepositsCount },
        { count: curWithdrawalsCount },
        { count: curStockChecksCount },
        { count: curPenaltiesCount },
        { count: prevDepositsCount },
        { count: prevWithdrawalsCount },
        { count: prevStockChecksCount },
        { count: prevPenaltiesCount },
      ] = await Promise.all([
        curDepositsQ,
        curWithdrawalsQ,
        curStockChecksQ,
        curPenaltiesQ,
        prevDepositsQ,
        prevWithdrawalsQ,
        prevStockChecksQ,
        prevPenaltiesQ,
      ]);

      const depositsTrend = calcTrend(curDepositsCount || 0, prevDepositsCount || 0);
      const withdrawalsTrend = calcTrend(curWithdrawalsCount || 0, prevWithdrawalsCount || 0);
      const stockChecksTrend = calcTrend(curStockChecksCount || 0, prevStockChecksCount || 0);
      const penaltiesTrend = calcTrend(curPenaltiesCount || 0, prevPenaltiesCount || 0);

      setData({
        storeCount: storeCount || 0,
        totalDepositsInStore: totalDepositsInStore || 0,
        pendingWithdrawals: pendingWithdrawals || 0,
        expiringDeposits: expiringDeposits || 0,
        pendingExplanations: pendingExplanations || 0,
        pendingApprovals: pendingApprovals || 0,
        pendingTransfers: pendingTransfers || 0,
        totalUsers: totalUsers || 0,
        totalProducts: totalProducts || 0,
        lastCheckDate: latestCount?.count_date || null,
        depositsTrend,
        withdrawalsTrend,
        stockChecksTrend,
        penaltiesTrend,
      });

      // --- Recent audit logs (latest 8) ---
      const logsQuery = supabase
        .from('audit_logs')
        .select('id, action_type, table_name, created_at, changed_by')
        .order('created_at', { ascending: false })
        .limit(8);
      if (storeFilter) logsQuery.eq('store_id', storeFilter);
      const { data: logs } = await logsQuery;

      if (logs && logs.length > 0) {
        // Resolve display names
        const userIds = [...new Set(logs.map((l) => l.changed_by).filter(Boolean))] as string[];
        let nameMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, username')
            .in('id', userIds);
          if (profiles) {
            nameMap = Object.fromEntries(
              profiles.map((p) => [p.id, p.display_name || p.username])
            );
          }
        }

        setActivities(
          logs.map((l) => ({
            id: l.id,
            action_type: l.action_type,
            table_name: l.table_name,
            created_at: l.created_at,
            changed_by_name: l.changed_by ? nameMap[l.changed_by] || null : null,
          }))
        );
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error('Error fetching overview data:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดข้อมูลภาพรวมได้',
      });
    } finally {
      setLoading(false);
    }
  }, [isOwner, currentStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Derived summary cards
  // -----------------------------------------------------------------------

  const summaryCards = [
    {
      label: 'จำนวนร้าน',
      value: formatNumber(data.storeCount),
      icon: Store,
      lightBg: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400',
      trend: data.depositsTrend,
    },
    {
      label: 'ฝากเหล้าทั้งหมด',
      value: formatNumber(data.totalDepositsInStore),
      icon: Wine,
      lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      trend: data.withdrawalsTrend,
    },
    {
      label: 'รออนุมัติ',
      value: formatNumber(data.pendingApprovals),
      icon: ClipboardCheck,
      lightBg: 'bg-amber-50 dark:bg-amber-900/20',
      textColor: 'text-amber-600 dark:text-amber-400',
      trend: data.stockChecksTrend,
    },
    {
      label: 'แจ้งเตือนสต๊อก',
      value: formatNumber(data.pendingExplanations),
      icon: AlertTriangle,
      lightBg: 'bg-red-50 dark:bg-red-900/20',
      textColor: 'text-red-600 dark:text-red-400',
      trend: data.penaltiesTrend,
    },
  ];

  // -----------------------------------------------------------------------
  // Module cards
  // -----------------------------------------------------------------------

  const moduleCards: ModuleCardConfig[] = [
    {
      id: 'stock',
      name: 'ระบบนับสต๊อก',
      icon: ClipboardCheck,
      href: '/stock',
      color: 'indigo',
      metrics: [
        `สินค้า ${formatNumber(data.totalProducts)} รายการ`,
        `นับล่าสุด: ${data.lastCheckDate ? formatThaiDate(data.lastCheckDate) : 'ยังไม่เคยนับ'}`,
        `รอชี้แจง: ${formatNumber(data.pendingExplanations)}`,
      ],
    },
    {
      id: 'deposit',
      name: 'ระบบฝากเหล้า',
      icon: Wine,
      href: '/deposit',
      color: 'emerald',
      metrics: [
        `ฝากอยู่ ${formatNumber(data.totalDepositsInStore)} ราย`,
        `รอเบิก: ${formatNumber(data.pendingWithdrawals)}`,
        `ใกล้หมดอายุ: ${formatNumber(data.expiringDeposits)}`,
      ],
    },
    {
      id: 'transfer',
      name: 'โอนสต๊อก',
      icon: ArrowRightLeft,
      href: '/transfer',
      color: 'blue',
      metrics: [`รอยืนยัน: ${formatNumber(data.pendingTransfers)}`],
    },
    {
      id: 'reports',
      name: 'รายงาน',
      icon: BarChart3,
      href: '/reports',
      color: 'violet',
      metrics: [],
      description: 'ดูรายงานสรุปภาพรวม',
    },
    {
      id: 'users',
      name: 'จัดการผู้ใช้',
      icon: Users,
      href: '/users',
      color: 'amber',
      metrics: [`ผู้ใช้ทั้งหมด: ${formatNumber(data.totalUsers)} คน`],
    },
    {
      id: 'settings',
      name: 'ตั้งค่าร้าน',
      icon: Settings,
      href: '/settings',
      color: 'gray',
      metrics: [],
      description: 'จัดการสาขาและการตั้งค่า',
    },
  ];

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const today = formatThaiDate(new Date());

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            ภาพรวม
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            สวัสดี, {user?.displayName || user?.username || 'เจ้าของร้าน'} &mdash; {today}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          รีเฟรช
        </button>
      </div>

      {/* ---- Summary Cards ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {card.value}
                    </p>
                    <TrendBadge value={card.trend} />
                  </div>
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

      {/* ---- Module Grid ---- */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          โมดูล
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moduleCards.map((mod) => {
            const Icon = mod.icon;
            const colors = COLOR_MAP[mod.color] || COLOR_MAP.gray;
            return (
              <Link
                key={mod.id}
                href={mod.href}
                className={cn(
                  'group relative rounded-xl border-l-4 bg-white p-5 shadow-sm ring-1 ring-gray-200 transition-shadow hover:shadow-md dark:bg-gray-800 dark:ring-gray-700',
                  colors.border
                )}
              >
                {/* Top row: icon + name + arrow */}
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      colors.iconBg
                    )}
                  >
                    <Icon className={cn('h-5 w-5', colors.text)} />
                  </div>
                  <h3 className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {mod.name}
                  </h3>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" />
                </div>

                {/* Metrics / description */}
                <div className="mt-3 space-y-1">
                  {mod.metrics.length > 0
                    ? mod.metrics.map((metric) => (
                        <p
                          key={metric}
                          className="text-xs text-gray-500 dark:text-gray-400"
                        >
                          {metric}
                        </p>
                      ))
                    : mod.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {mod.description}
                        </p>
                      )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ---- Recent Activity ---- */}
      <Card padding="none">
        <CardHeader
          title="กิจกรรมล่าสุด"
          action={
            activities.length > 0 ? (
              <button
                type="button"
                onClick={fetchData}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                รีเฟรช
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            ) : undefined
          }
        />
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
              <Inbox className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              ยังไม่มีกิจกรรม
            </h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
              กิจกรรมต่าง ๆ ของระบบจะปรากฏที่นี่
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {activities.map((activity) => {
              const mapped = mapActivity(activity.action_type, activity.table_name);
              const ActivityIcon = mapped.icon;
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 px-5 py-3.5"
                >
                  <div className={cn('mt-0.5', mapped.colorClass)}>
                    <ActivityIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {mapped.label}
                      {activity.changed_by_name && (
                        <span className="ml-1 text-gray-400 dark:text-gray-500">
                          &mdash; {activity.changed_by_name}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {relativeTime(activity.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
