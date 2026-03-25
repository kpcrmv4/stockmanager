'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  toast,
} from '@/components/ui';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { todayBangkok, nowBangkok } from '@/lib/utils/date';
import {
  Loader2,
  RefreshCw,
  Store,
  TrendingUp,
  TrendingDown,
  Wine,
  ClipboardCheck,
  AlertTriangle,
  Users,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  GitCompare,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreKPI {
  storeId: string;
  storeName: string;
  deposits: number;
  withdrawals: number;
  stockChecks: number;
  discrepancies: number;
  staffCount: number;
  tasksCompleted: number;
  avgCompletionMin: number;
  completionRate: number;
  expiringSoon: number;
}

interface RadarDataPoint {
  metric: string;
  [storeName: string]: string | number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORE_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4',
];

function getDefaultDateRange(): { start: string; end: string } {
  const endStr = todayBangkok();
  const d = nowBangkok();
  d.setDate(d.getDate() - 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { start: `${y}-${m}-${day}`, end: endStr };
}

function normalize(value: number, max: number): number {
  if (max === 0) return 0;
  return Math.round((value / max) * 100);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatNumber(entry.value)}
        </p>
      ))}
    </div>
  );
}

function ChartEmptyState({ message }: { message?: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
      <div className="text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
          {message || 'ยังไม่มีข้อมูลในช่วงนี้'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StoreComparisonPage() {
  const { user } = useAuthStore();

  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [loading, setLoading] = useState(true);
  const [storeKPIs, setStoreKPIs] = useState<StoreKPI[]>([]);
  const [sortBy, setSortBy] = useState<keyof StoreKPI>('deposits');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Get all active stores
      const { data: stores } = await supabase
        .from('stores')
        .select('id, store_name')
        .eq('active', true)
        .order('store_name');

      if (!stores || stores.length === 0) {
        setStoreKPIs([]);
        setLoading(false);
        return;
      }

      // Fetch KPIs for each store in parallel
      const kpis = await Promise.all(
        stores.map(async (store) => {
          const [
            { count: deposits },
            { count: withdrawals },
            { count: stockChecks },
            { count: discrepancies },
            { count: staffCount },
            { count: expiringSoon },
          ] = await Promise.all([
            supabase
              .from('deposits')
              .select('*', { count: 'exact', head: true })
              .eq('store_id', store.id)
              .gte('created_at', startDate)
              .lte('created_at', endDate + 'T23:59:59'),
            supabase
              .from('withdrawals')
              .select('*', { count: 'exact', head: true })
              .eq('store_id', store.id)
              .gte('created_at', startDate)
              .lte('created_at', endDate + 'T23:59:59'),
            supabase
              .from('manual_counts')
              .select('*', { count: 'exact', head: true })
              .eq('store_id', store.id)
              .gte('count_date', startDate)
              .lte('count_date', endDate),
            supabase
              .from('comparisons')
              .select('*', { count: 'exact', head: true })
              .eq('store_id', store.id)
              .neq('difference', 0)
              .gte('comp_date', startDate)
              .lte('comp_date', endDate),
            supabase
              .from('user_stores')
              .select('*', { count: 'exact', head: true })
              .eq('store_id', store.id),
            supabase
              .from('deposits')
              .select('*', { count: 'exact', head: true })
              .eq('store_id', store.id)
              .eq('status', 'in_store')
              .lte('expiry_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
          ]);

          // Get action card performance for the store
          const { data: rooms } = await supabase
            .from('chat_rooms')
            .select('id')
            .eq('store_id', store.id)
            .eq('is_active', true);

          let tasksCompleted = 0;
          let totalClaimed = 0;
          let completionTimes: number[] = [];

          if (rooms && rooms.length > 0) {
            const { data: cards } = await supabase
              .from('chat_messages')
              .select('metadata')
              .in('room_id', rooms.map((r) => r.id))
              .eq('type', 'action_card')
              .gte('created_at', startDate)
              .lte('created_at', endDate + 'T23:59:59')
              .is('archived_at', null);

            (cards || []).forEach((msg) => {
              const meta = msg.metadata as any;
              if (!meta?.claimed_by) return;
              totalClaimed++;
              if (meta.status === 'completed' && meta.completed_at) {
                tasksCompleted++;
                if (meta.claimed_at) {
                  const diff =
                    (new Date(meta.completed_at).getTime() - new Date(meta.claimed_at).getTime()) /
                    (1000 * 60);
                  if (diff > 0 && diff < 1440) completionTimes.push(diff);
                }
              }
            });
          }

          const avgMin =
            completionTimes.length > 0
              ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
              : 0;

          return {
            storeId: store.id,
            storeName: store.store_name,
            deposits: deposits ?? 0,
            withdrawals: withdrawals ?? 0,
            stockChecks: stockChecks ?? 0,
            discrepancies: discrepancies ?? 0,
            staffCount: staffCount ?? 0,
            tasksCompleted,
            avgCompletionMin: avgMin,
            completionRate: totalClaimed > 0 ? (tasksCompleted / totalClaimed) * 100 : 0,
            expiringSoon: expiringSoon ?? 0,
          } as StoreKPI;
        })
      );

      setStoreKPIs(kpis);
    } catch (err) {
      console.error('Failed to fetch store comparison:', err);
      toast({ type: 'error', title: 'โหลดข้อมูลไม่สำเร็จ' });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sorted stores
  const sortedStores = useMemo(() => {
    const arr = [...storeKPIs];
    arr.sort((a, b) => {
      const aVal = a[sortBy] as number;
      const bVal = b[sortBy] as number;
      return bVal - aVal;
    });
    return arr;
  }, [storeKPIs, sortBy]);

  // Bar chart data
  const barChartData = useMemo(() => {
    return storeKPIs.map((s) => ({
      name: s.storeName,
      ฝากเหล้า: s.deposits,
      เบิกเหล้า: s.withdrawals,
      เช็คสต๊อก: s.stockChecks,
    }));
  }, [storeKPIs]);

  // Radar chart data
  const radarData = useMemo((): RadarDataPoint[] => {
    if (storeKPIs.length === 0) return [];

    const maxDeposits = Math.max(...storeKPIs.map((s) => s.deposits), 1);
    const maxWithdrawals = Math.max(...storeKPIs.map((s) => s.withdrawals), 1);
    const maxStock = Math.max(...storeKPIs.map((s) => s.stockChecks), 1);
    const maxTasks = Math.max(...storeKPIs.map((s) => s.tasksCompleted), 1);
    const maxRate = 100;

    const metrics = [
      { key: 'deposits', label: 'ฝากเหล้า', max: maxDeposits },
      { key: 'withdrawals', label: 'เบิกเหล้า', max: maxWithdrawals },
      { key: 'stockChecks', label: 'เช็คสต๊อก', max: maxStock },
      { key: 'tasksCompleted', label: 'งานสำเร็จ', max: maxTasks },
      { key: 'completionRate', label: 'Completion %', max: maxRate },
    ];

    return metrics.map((m) => {
      const point: RadarDataPoint = { metric: m.label };
      storeKPIs.forEach((s) => {
        point[s.storeName] = normalize(s[m.key as keyof StoreKPI] as number, m.max);
      });
      return point;
    });
  }, [storeKPIs]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            เปรียบเทียบสาขา
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            เปรียบเทียบ KPI ทุกสาขา side-by-side
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
          รีเฟรช
        </Button>
      </div>

      {/* Date filter */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                ตั้งแต่
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                ถึง
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : storeKPIs.length === 0 ? (
        <ChartEmptyState message="ไม่พบข้อมูลสาขา" />
      ) : (
        <>
          {/* Radar Chart */}
          <Card>
            <CardHeader
              title="Radar เปรียบเทียบหลายมิติ"
              description="คะแนนเทียบเป็น % ของค่าสูงสุดในแต่ละมิติ"
            />
            <CardContent>
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    {storeKPIs.map((s, i) => (
                      <Radar
                        key={s.storeId}
                        name={s.storeName}
                        dataKey={s.storeName}
                        stroke={STORE_COLORS[i % STORE_COLORS.length]}
                        fill={STORE_COLORS[i % STORE_COLORS.length]}
                        fillOpacity={0.15}
                      />
                    ))}
                    <Legend />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmptyState />
              )}
            </CardContent>
          </Card>

          {/* Bar Chart Comparison */}
          <Card>
            <CardHeader
              title="กิจกรรมรายสาขา"
              description="ฝากเหล้า, เบิกเหล้า, เช็คสต๊อก"
            />
            <CardContent>
              {barChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="ฝากเหล้า" fill="#6366f1" />
                    <Bar dataKey="เบิกเหล้า" fill="#10b981" />
                    <Bar dataKey="เช็คสต๊อก" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmptyState />
              )}
            </CardContent>
          </Card>

          {/* KPI Table */}
          <Card>
            <CardHeader
              title="Ranking สาขา"
              action={
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'deposits' as const, label: 'ฝาก' },
                    { key: 'withdrawals' as const, label: 'เบิก' },
                    { key: 'stockChecks' as const, label: 'สต๊อก' },
                    { key: 'tasksCompleted' as const, label: 'งานสำเร็จ' },
                    { key: 'completionRate' as const, label: 'Rate' },
                  ].map((opt) => (
                    <Button
                      key={opt.key}
                      variant={sortBy === opt.key ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setSortBy(opt.key)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              }
            />
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">สาขา</th>
                      <th className="px-4 py-3 text-center">พนักงาน</th>
                      <th className="px-4 py-3 text-center">ฝาก</th>
                      <th className="px-4 py-3 text-center">เบิก</th>
                      <th className="px-4 py-3 text-center">เช็คสต๊อก</th>
                      <th className="px-4 py-3 text-center">ผลต่าง</th>
                      <th className="px-4 py-3 text-center">งานสำเร็จ</th>
                      <th className="px-4 py-3 text-center">เวลาเฉลี่ย</th>
                      <th className="px-4 py-3 text-center">Rate</th>
                      <th className="px-4 py-3 text-center">ใกล้หมดอายุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {sortedStores.map((store, idx) => (
                      <tr
                        key={store.storeId}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                              idx === 0
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : idx === 1
                                  ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                  : idx === 2
                                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                    : 'bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                            )}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{
                                backgroundColor: STORE_COLORS[idx % STORE_COLORS.length],
                              }}
                            />
                            <span className="font-medium text-gray-900 dark:text-white">
                              {store.storeName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">{store.staffCount}</td>
                        <td className="px-4 py-3 text-center font-medium text-indigo-600 dark:text-indigo-400">
                          {formatNumber(store.deposits)}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-emerald-600 dark:text-emerald-400">
                          {formatNumber(store.withdrawals)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {formatNumber(store.stockChecks)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {store.discrepancies > 0 ? (
                            <span className="text-red-500">{formatNumber(store.discrepancies)}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-bold">
                          {formatNumber(store.tasksCompleted)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {store.avgCompletionMin > 0
                            ? `${Math.round(store.avgCompletionMin)} น.`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              'text-sm font-medium',
                              store.completionRate >= 80
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : store.completionRate >= 50
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {store.completionRate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {store.expiringSoon > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {store.expiringSoon}
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
