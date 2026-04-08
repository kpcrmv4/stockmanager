'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Select,
  toast,
} from '@/components/ui';
import {
  formatThaiShortDate,
  formatNumber,
} from '@/lib/utils/format';
import { todayBangkok, nowBangkok } from '@/lib/utils/date';
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Timer,
  Target,
  BarChart3,
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
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  name: string;
}

interface StaffPerformance {
  userId: string;
  displayName: string;
  role: string;
  tasksCompleted: number;
  tasksClaimed: number;
  tasksExpired: number;
  avgCompletionMinutes: number;
  completionRate: number;
  rank: number;
}

interface DailyStaffActivity {
  date: string;
  [staffName: string]: string | number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHART_COLORS = [
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

// formatMinutes is defined inside the component to access translations

function extractDate(dt: string): string {
  return dt.split('T')[0];
}

function CustomTooltip({ active, payload, label }: any) {
  const t = useTranslations('performance.staff');
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatNumber(entry.value)} {t('tasks')}
        </p>
      ))}
    </div>
  );
}

function ChartEmptyState({ message }: { message?: string }) {
  const t = useTranslations('performance.staff');
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
      <div className="text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
          {message || t('noDataInRange')}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rank badge component
// ---------------------------------------------------------------------------

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-sm font-bold text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        🥇 #1
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        🥈 #2
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-sm font-bold text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
        🥉 #3
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      #{rank}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StaffPerformancePage() {
  const t = useTranslations('performance.staff');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  function formatMinutes(mins: number): string {
    if (mins < 1) return t('lessThanOneMin');
    if (mins < 60) return t('minutes', { count: Math.round(mins) });
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? t('hoursMinutes', { h, m }) : t('hours', { h });
  }

  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(currentStoreId || '');
  const [loading, setLoading] = useState(true);
  const [staffData, setStaffData] = useState<StaffPerformance[]>([]);
  const [dailyData, setDailyData] = useState<DailyStaffActivity[]>([]);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'completed' | 'avgTime' | 'rate'>('completed');

  const isOwner = user?.role === 'owner' || user?.role === 'accountant';

  // Load stores
  useEffect(() => {
    async function loadStores() {
      if (!isOwner) return;
      try {
        const supabase = createClient();
        const { data } = await supabase.from('stores').select('id, store_name').eq('active', true).order('store_name');
        if (data && data.length > 0) {
          const mapped = data.map((s) => ({ id: s.id, name: s.store_name }));
          setStores(mapped);
          if (!selectedStoreId) setSelectedStoreId(data[0].id);
        }
      } catch (err) {
        console.error('Failed to load stores:', err);
      }
    }
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  // Fetch performance data
  const fetchData = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);

    try {
      const supabase = createClient();

      // Get action card messages for the store's chat room
      const { data: rooms } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('store_id', selectedStoreId)
        .eq('is_active', true);

      if (!rooms || rooms.length === 0) {
        setStaffData([]);
        setDailyData([]);
        setLoading(false);
        return;
      }

      const roomIds = rooms.map((r) => r.id);

      // Get all action card messages in date range
      const { data: actionCards } = await supabase
        .from('chat_messages')
        .select('id, metadata, created_at')
        .in('room_id', roomIds)
        .eq('type', 'action_card')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59')
        .is('archived_at', null);

      // Get staff profiles for the store
      const { data: storeUsers } = await supabase
        .from('user_stores')
        .select('user_id')
        .eq('store_id', selectedStoreId);

      const userIds = (storeUsers || []).map((u) => u.user_id);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, role')
        .in('id', userIds.length > 0 ? userIds : ['__none__'])
        .eq('active', true);

      // Build staff performance map
      const staffMap: Record<string, StaffPerformance> = {};
      const dailyMap: Record<string, Record<string, number>> = {};

      // Initialize all staff
      (profiles || []).forEach((p) => {
        staffMap[p.id] = {
          userId: p.id,
          displayName: p.display_name || p.username,
          role: p.role,
          tasksCompleted: 0,
          tasksClaimed: 0,
          tasksExpired: 0,
          avgCompletionMinutes: 0,
          completionRate: 0,
          rank: 0,
        };
      });

      // Process action cards
      const completionTimes: Record<string, number[]> = {};

      (actionCards || []).forEach((msg) => {
        const meta = msg.metadata as any;
        if (!meta) return;

        const claimedBy = meta.claimed_by;
        if (!claimedBy) return;

        // Ensure staff exists in map (could be from another store)
        if (!staffMap[claimedBy]) {
          staffMap[claimedBy] = {
            userId: claimedBy,
            displayName: meta.claimed_by_name || 'Unknown',
            role: 'staff',
            tasksCompleted: 0,
            tasksClaimed: 0,
            tasksExpired: 0,
            avgCompletionMinutes: 0,
            completionRate: 0,
            rank: 0,
          };
        }

        staffMap[claimedBy].tasksClaimed += 1;

        if (meta.status === 'completed' && meta.completed_at) {
          staffMap[claimedBy].tasksCompleted += 1;

          // Calculate completion time
          if (meta.claimed_at) {
            const claimedAt = new Date(meta.claimed_at).getTime();
            const completedAt = new Date(meta.completed_at).getTime();
            const diffMin = (completedAt - claimedAt) / (1000 * 60);
            if (diffMin > 0 && diffMin < 1440) {
              if (!completionTimes[claimedBy]) completionTimes[claimedBy] = [];
              completionTimes[claimedBy].push(diffMin);
            }
          }

          // Daily data
          const dateKey = extractDate(meta.completed_at);
          const name = staffMap[claimedBy].displayName;
          if (!dailyMap[dateKey]) dailyMap[dateKey] = {};
          dailyMap[dateKey][name] = (dailyMap[dateKey][name] || 0) + 1;
        }

        if (meta.status === 'expired' || meta.auto_released) {
          staffMap[claimedBy].tasksExpired += 1;
        }
      });

      // Calculate averages and rates
      Object.keys(staffMap).forEach((id) => {
        const s = staffMap[id];
        if (completionTimes[id] && completionTimes[id].length > 0) {
          s.avgCompletionMinutes =
            completionTimes[id].reduce((a, b) => a + b, 0) / completionTimes[id].length;
        }
        s.completionRate = s.tasksClaimed > 0 ? (s.tasksCompleted / s.tasksClaimed) * 100 : 0;
      });

      // Filter out staff with no activity and rank
      const activeStaff = Object.values(staffMap).filter(
        (s) => s.tasksClaimed > 0 || s.tasksCompleted > 0
      );
      activeStaff.sort((a, b) => b.tasksCompleted - a.tasksCompleted);
      activeStaff.forEach((s, i) => (s.rank = i + 1));

      setStaffData(activeStaff);

      // Build daily chart data
      const allStaffNames = activeStaff.slice(0, 10).map((s) => s.displayName);
      const dailyArr = Object.keys(dailyMap)
        .sort()
        .map((dateKey) => {
          const entry: DailyStaffActivity = { date: formatThaiShortDate(dateKey) };
          allStaffNames.forEach((name) => {
            entry[name] = dailyMap[dateKey]?.[name] || 0;
          });
          return entry;
        });
      setDailyData(dailyArr);
    } catch (err) {
      console.error('Failed to fetch staff performance:', err);
      toast({ type: 'error', title: t('loadError') });
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sorted staff list
  const sortedStaff = useMemo(() => {
    const arr = [...staffData];
    if (sortBy === 'completed') arr.sort((a, b) => b.tasksCompleted - a.tasksCompleted);
    else if (sortBy === 'avgTime') arr.sort((a, b) => (a.avgCompletionMinutes || 999) - (b.avgCompletionMinutes || 999));
    else if (sortBy === 'rate') arr.sort((a, b) => b.completionRate - a.completionRate);
    arr.forEach((s, i) => (s.rank = i + 1));
    return arr;
  }, [staffData, sortBy]);

  // Top 10 staff names for chart
  const topStaffNames = useMemo(
    () => staffData.slice(0, 10).map((s) => s.displayName),
    [staffData]
  );

  // Summary stats
  const totalTasks = staffData.reduce((s, d) => s + d.tasksCompleted, 0);
  const avgTime =
    staffData.filter((s) => s.avgCompletionMinutes > 0).length > 0
      ? staffData
          .filter((s) => s.avgCompletionMinutes > 0)
          .reduce((s, d) => s + d.avgCompletionMinutes, 0) /
        staffData.filter((s) => s.avgCompletionMinutes > 0).length
      : 0;
  const totalExpired = staffData.reduce((s, d) => s + d.tasksExpired, 0);
  const overallRate =
    staffData.reduce((s, d) => s + d.tasksClaimed, 0) > 0
      ? (totalTasks / staffData.reduce((s, d) => s + d.tasksClaimed, 0)) * 100
      : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
          {t('refresh')}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
            {isOwner && stores.length > 0 && (
              <div className="w-full sm:w-auto sm:min-w-[180px]">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('branch')}
                </label>
                <Select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  options={stores.map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('dateFrom')}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('dateTo')}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                    <CheckCircle2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatNumber(totalTasks)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('totalCompleted')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Timer className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatMinutes(avgTime)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('avgTimePerTask')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Target className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {overallRate.toFixed(0)}%
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('completionRate')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatNumber(totalExpired)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('timeoutExpired')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Trend Chart */}
          <Card>
            <CardHeader
              title={t('dailyChartTitle')}
              description={t('dailyChartDesc')}
            />
            <CardContent>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {topStaffNames.map((name, i) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="a"
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmptyState message={t('noCompletedInRange')} />
              )}
            </CardContent>
          </Card>

          {/* Staff Ranking Table */}
          <Card>
            <CardHeader
              title={t('rankingTitle')}
              action={
                <div className="flex gap-2">
                  <Button
                    variant={sortBy === 'completed' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setSortBy('completed')}
                  >
                    {t('sortCompleted')}
                  </Button>
                  <Button
                    variant={sortBy === 'avgTime' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setSortBy('avgTime')}
                  >
                    {t('sortFastest')}
                  </Button>
                  <Button
                    variant={sortBy === 'rate' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setSortBy('rate')}
                  >
                    {t('sortRate')}
                  </Button>
                </div>
              }
            />
            <CardContent>
              {sortedStaff.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                  {t('noStaffInRange')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-3">{t('colRank')}</th>
                        <th className="px-4 py-3">{t('colStaff')}</th>
                        <th className="px-4 py-3 text-center">{t('colClaimed')}</th>
                        <th className="px-4 py-3 text-center">{t('colCompleted')}</th>
                        <th className="px-4 py-3 text-center">{t('colExpired')}</th>
                        <th className="px-4 py-3 text-center">{t('colAvgTime')}</th>
                        <th className="px-4 py-3 text-center">{t('colRate')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {sortedStaff.map((staff) => (
                        <tr
                          key={staff.userId}
                          className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="px-4 py-3">
                            <RankBadge rank={staff.rank} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                {staff.displayName.charAt(0)}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {staff.displayName}
                                </p>
                                <p className="text-xs text-gray-400">{staff.role}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-medium">
                            {formatNumber(staff.tasksClaimed)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {formatNumber(staff.tasksCompleted)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {staff.tasksExpired > 0 ? (
                              <span className="font-medium text-red-500">
                                {formatNumber(staff.tasksExpired)}
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {staff.avgCompletionMinutes > 0 ? (
                              <span
                                className={cn(
                                  'font-medium',
                                  staff.avgCompletionMinutes < 10
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : staff.avgCompletionMinutes < 30
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-red-600 dark:text-red-400'
                                )}
                              >
                                {formatMinutes(staff.avgCompletionMinutes)}
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <div className="h-2 w-16 rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                  className={cn(
                                    'h-2 rounded-full',
                                    staff.completionRate >= 80
                                      ? 'bg-emerald-500'
                                      : staff.completionRate >= 50
                                        ? 'bg-amber-500'
                                        : 'bg-red-500'
                                  )}
                                  style={{ width: `${Math.min(staff.completionRate, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                {staff.completionRate.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
