'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { formatNumber } from '@/lib/utils/format';
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  User,
  Zap,
  Timer,
  AlertCircle,
  Play,
  Pause,
  Radio,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  name: string;
}

interface LiveTask {
  id: string;
  actionType: string;
  status: 'pending' | 'claimed' | 'completed' | 'expired';
  priority: string;
  referenceId: string;
  summary: string;
  claimedBy: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  createdAt: string;
  timeoutMinutes: number;
  isOverdue: boolean;
  minutesElapsed: number;
}

interface StaffWorkload {
  userId: string;
  displayName: string;
  activeTasks: number;
  completedToday: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Helper functions moved inside component to access translations

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OperationsPage() {
  const t = useTranslations('performance.operations');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  function getActionTypeLabel(type: string): string {
    const map: Record<string, string> = {
      deposit_claim: t('actionDeposit'),
      withdrawal_claim: t('actionWithdrawal'),
      stock_explain: t('actionStockExplain'),
      borrow_approve: t('actionBorrowApprove'),
      generic: t('actionGeneric'),
    };
    return map[type] || type;
  }

  function getPriorityConfig(priority: string) {
    if (priority === 'urgent')
      return {
        label: t('priorityUrgent'),
        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      };
    if (priority === 'low')
      return {
        label: t('priorityLow'),
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
      };
    return {
      label: t('priorityNormal'),
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    };
  }

  function relativeTime(isoDate: string): string {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMin = Math.floor((now - then) / (1000 * 60));
    if (diffMin < 1) return t('justNow');
    if (diffMin < 60) return t('minutesAgo', { count: diffMin });
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return t('hoursAgo', { count: diffHour });
    return t('daysAgo', { count: Math.floor(diffHour / 24) });
  }

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(currentStoreId || '');
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<LiveTask[]>([]);
  const [workloads, setWorkloads] = useState<StaffWorkload[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'claimed' | 'overdue'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

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

  // Fetch live data
  const fetchData = useCallback(async () => {
    if (!selectedStoreId) return;
    if (!loading) {
      // Don't show loading spinner for auto-refresh
    } else {
      setLoading(true);
    }

    try {
      const supabase = createClient();

      // Get chat rooms for store
      const { data: rooms } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('store_id', selectedStoreId)
        .eq('is_active', true);

      if (!rooms || rooms.length === 0) {
        setTasks([]);
        setWorkloads([]);
        setLoading(false);
        return;
      }

      const roomIds = rooms.map((r) => r.id);

      // Get recent action cards (last 7 days for active, today for completed)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: actionCards } = await supabase
        .from('chat_messages')
        .select('id, metadata, created_at')
        .in('room_id', roomIds)
        .eq('type', 'action_card')
        .gte('created_at', sevenDaysAgo)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      const now = Date.now();
      const liveTasks: LiveTask[] = [];
      const staffMap: Record<string, StaffWorkload> = {};

      (actionCards || []).forEach((msg) => {
        const meta = msg.metadata as any;
        if (!meta) return;

        const claimedAt = meta.claimed_at ? new Date(meta.claimed_at).getTime() : null;
        const minutesElapsed = claimedAt ? (now - claimedAt) / (1000 * 60) : 0;
        const isOverdue =
          meta.status === 'claimed' &&
          claimedAt != null &&
          minutesElapsed > (meta.timeout_minutes || 15);

        // Only show pending/claimed tasks, or tasks completed today
        const isPendingOrClaimed = meta.status === 'pending' || meta.status === 'claimed';
        const isCompletedToday =
          meta.status === 'completed' &&
          meta.completed_at &&
          new Date(meta.completed_at).getTime() > todayStart.getTime();

        if (!isPendingOrClaimed && !isCompletedToday) return;

        const summary = meta.summary
          ? [meta.summary.customer, meta.summary.items, meta.summary.note]
              .filter(Boolean)
              .join(' — ')
          : '';

        liveTasks.push({
          id: msg.id,
          actionType: meta.action_type || 'generic',
          status: isOverdue ? 'expired' : meta.status,
          priority: meta.priority || 'normal',
          referenceId: meta.reference_id || '',
          summary,
          claimedBy: meta.claimed_by,
          claimedByName: meta.claimed_by_name,
          claimedAt: meta.claimed_at,
          createdAt: msg.created_at,
          timeoutMinutes: meta.timeout_minutes || 15,
          isOverdue,
          minutesElapsed: Math.round(minutesElapsed),
        });

        // Track workload
        if (meta.claimed_by) {
          if (!staffMap[meta.claimed_by]) {
            staffMap[meta.claimed_by] = {
              userId: meta.claimed_by,
              displayName: meta.claimed_by_name || 'Unknown',
              activeTasks: 0,
              completedToday: 0,
            };
          }
          if (meta.status === 'claimed') {
            staffMap[meta.claimed_by].activeTasks += 1;
          }
          if (isCompletedToday) {
            staffMap[meta.claimed_by].completedToday += 1;
          }
        }
      });

      setTasks(liveTasks);
      setWorkloads(
        Object.values(staffMap).sort((a, b) => b.activeTasks - a.activeTasks || b.completedToday - a.completedToday)
      );
    } catch (err) {
      console.error('Failed to fetch operations data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, loading]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [selectedStoreId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Filtered tasks
  const filteredTasks = tasks.filter((t) => {
    if (filter === 'all') return t.status !== 'completed';
    if (filter === 'pending') return t.status === 'pending';
    if (filter === 'claimed') return t.status === 'claimed';
    if (filter === 'overdue') return t.isOverdue || t.status === 'expired';
    return true;
  });

  // Counts
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const claimedCount = tasks.filter((t) => t.status === 'claimed' && !t.isOverdue).length;
  const overdueCount = tasks.filter((t) => t.isOverdue || t.status === 'expired').length;
  const completedTodayCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('subtitle')}
            </p>
          </div>
          {autoRefresh && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
              <Radio className="h-3 w-3 animate-pulse" />
              Live
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? (
              <>
                <Pause className="mr-1.5 h-4 w-4" /> {t('stopAuto')}
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-4 w-4" /> {t('startAuto')}
              </>
            )}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setLoading(true); fetchData(); }} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            {t('refresh')}
          </Button>
        </div>
      </div>

      {/* Store selector */}
      {isOwner && stores.length > 0 && (
        <Card>
          <CardContent>
            <div className="w-full sm:min-w-[180px] sm:max-w-xs">
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                {t('branch')}
              </label>
              <Select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                options={stores.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <button
              onClick={() => setFilter('pending')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                filter === 'pending'
                  ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200 dark:border-amber-600 dark:bg-amber-900/20 dark:ring-amber-800'
                  : 'border-gray-200 bg-white hover:border-amber-200 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-amber-700'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {pendingCount}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('waitingForTask')}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setFilter('claimed')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                filter === 'claimed'
                  ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200 dark:border-blue-600 dark:bg-blue-900/20 dark:ring-blue-800'
                  : 'border-gray-200 bg-white hover:border-blue-200 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {claimedCount}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('inProgress')}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setFilter('overdue')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                filter === 'overdue'
                  ? 'border-red-300 bg-red-50 ring-2 ring-red-200 dark:border-red-600 dark:bg-red-900/20 dark:ring-red-800'
                  : 'border-gray-200 bg-white hover:border-red-200 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-red-700'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {overdueCount}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('overdue')}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setFilter('all')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                filter === 'all'
                  ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200 dark:border-emerald-600 dark:bg-emerald-900/20 dark:ring-emerald-800'
                  : 'border-gray-200 bg-white hover:border-emerald-200 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-emerald-700'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {completedTodayCount}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('completedToday')}</p>
                </div>
              </div>
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Task List */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader
                  title={t('allTasks', { count: filteredTasks.length })}
                  description={
                    filter === 'all'
                      ? t('descAll')
                      : filter === 'pending'
                        ? t('descPending')
                        : filter === 'claimed'
                          ? t('descClaimed')
                          : t('descOverdue')
                  }
                />
                <CardContent>
                  {filteredTasks.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                      {filter === 'overdue'
                        ? t('noOverdue')
                        : t('noPending')}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredTasks.map((task) => {
                        const priorityConfig = getPriorityConfig(task.priority);
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              'px-4 py-3 transition-colors',
                              task.isOverdue && 'bg-red-50/50 dark:bg-red-900/10'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {getActionTypeLabel(task.actionType)}
                                  </span>
                                  <span
                                    className={cn(
                                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                      priorityConfig.className
                                    )}
                                  >
                                    {priorityConfig.label}
                                  </span>
                                  {task.referenceId && (
                                    <span className="text-xs text-gray-400">
                                      {task.referenceId}
                                    </span>
                                  )}
                                </div>
                                {task.summary && (
                                  <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                                    {task.summary}
                                  </p>
                                )}
                                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                  <span>{t('created', { time: relativeTime(task.createdAt) })}</span>
                                  {task.claimedByName && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {task.claimedByName}
                                    </span>
                                  )}
                                  {task.status === 'claimed' && (
                                    <span className="flex items-center gap-1">
                                      <Timer className="h-3 w-3" />
                                      {task.minutesElapsed} / {task.timeoutMinutes} {t('minutesUnit')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                {task.status === 'pending' && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    <Clock className="h-3 w-3" /> {t('statusWaiting')}
                                  </span>
                                )}
                                {task.status === 'claimed' && !task.isOverdue && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                    <Zap className="h-3 w-3" /> {t('statusInProgress')}
                                  </span>
                                )}
                                {(task.isOverdue || task.status === 'expired') && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                    <AlertCircle className="h-3 w-3" /> {t('statusOverdue')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Staff Workload */}
            <div>
              <Card>
                <CardHeader
                  title={t('workloadTitle')}
                  description={t('workloadDesc')}
                />
                <CardContent>
                  {workloads.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                      {t('noData')}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {workloads.map((w) => (
                        <div
                          key={w.userId}
                          className="flex items-center justify-between px-4 py-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                              {w.displayName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {w.displayName}
                              </p>
                              <p className="text-xs text-gray-400">
                                {t('completedTodayLabel', { count: w.completedToday })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            {w.activeTasks > 0 ? (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
                                  w.activeTasks >= 3
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                )}
                              >
                                <Zap className="h-3 w-3" />
                                {w.activeTasks} {t('tasksUnit')}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">{t('available')}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
