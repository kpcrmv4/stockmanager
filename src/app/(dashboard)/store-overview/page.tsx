'use client';

import { useTranslations } from 'next-intl';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { toast } from '@/components/ui';
import {
  daysFromNowISO,
  startOfTodayBangkokISO,
} from '@/lib/utils/date';
import {
  Store,
  Users,
  Clock,
  ClipboardCheck,
  AlertTriangle,
  ChevronDown,
  Wine,
  Package,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Inbox,
  CalendarClock,
  BarChart3,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  store_code: string;
  store_name: string;
}

interface StoreStats {
  staffCount: number;
  activeDeposits: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  stockAlerts: number;
  expiringSoon: number;
  lastStockCheck: string | null;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  table_name: string | null;
  created_at: string;
  changed_by_name: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Relative-time string from an ISO timestamp — needs t() from component */
function relativeTime(isoDate: string, t: (key: string, values?: any) => string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return t('justNow');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t('minutesAgo', { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t('hoursAgo', { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return t('daysAgo', { count: diffDay });
  return formatThaiDate(isoDate);
}

/** Map audit_logs action to label + icon + color — needs t() from component */
function mapActivity(
  actionType: string,
  tableName: string | null,
  t: (key: string) => string
): { label: string; icon: LucideIcon; colorClass: string } {
  if (actionType === 'INSERT' && tableName === 'deposits') {
    return { label: t('actNewDeposit'), icon: Wine, colorClass: 'text-emerald-500' };
  }
  if (actionType === 'INSERT' && tableName === 'withdrawals') {
    return { label: t('actWithdrawal'), icon: Package, colorClass: 'text-blue-500' };
  }
  if (actionType === 'UPDATE' && tableName === 'comparisons') {
    return {
      label: t('actUpdateComparison'),
      icon: BarChart3,
      colorClass: 'text-amber-500',
    };
  }
  if (actionType === 'INSERT' && tableName === 'deposit_requests') {
    return {
      label: t('actNewDepositRequest'),
      icon: ClipboardCheck,
      colorClass: 'text-indigo-500',
    };
  }
  if (actionType === 'UPDATE' && tableName === 'deposits') {
    return {
      label: t('actUpdateDepositStatus'),
      icon: CheckCircle2,
      colorClass: 'text-teal-500',
    };
  }
  if (actionType === 'INSERT' && tableName === 'manual_counts') {
    return {
      label: t('actStockCount'),
      icon: ClipboardCheck,
      colorClass: 'text-violet-500',
    };
  }
  if (actionType === 'AUTO_DEACTIVATE') {
    return { label: t('actAutoDeactivate'), icon: XCircle, colorClass: 'text-red-500' };
  }
  if (actionType === 'AUTO_REACTIVATE') {
    return {
      label: t('actAutoReactivate'),
      icon: CheckCircle2,
      colorClass: 'text-emerald-500',
    };
  }
  return { label: actionType || t('actGeneric'), icon: Clock, colorClass: 'text-gray-400' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StoreOverviewPage() {
  const t = useTranslations('storeOverview');
  const { user } = useAuthStore();
  const { currentStoreId, setCurrentStoreId } = useAppStore();

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [activities, setActivities] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStoreSelector, setShowStoreSelector] = useState(false);

  // Determine the active store id (fall back to first store in list)
  const selectedStoreId = currentStoreId || stores[0]?.id || '';
  const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0];

  // -----------------------------------------------------------------------
  // Fetch stores list
  // -----------------------------------------------------------------------

  const fetchStores = useCallback(async () => {
    try {
      const supabase = createClient();

      if (!user) return;

      // If the user is an owner, load all active stores.
      // Otherwise load only stores assigned via user_stores.
      const isOwner = user.role === 'owner';

      if (isOwner) {
        const { data, error } = await supabase
          .from('stores')
          .select('id, store_code, store_name')
          .eq('active', true)
          .order('store_code');
        if (error) throw error;
        setStores(data || []);
      } else {
        // Get store IDs for this user, then fetch store details
        const { data: userStores, error: usError } = await supabase
          .from('user_stores')
          .select('store_id')
          .eq('user_id', user.id);
        if (usError) throw usError;

        const storeIds = (userStores || []).map((us) => us.store_id);
        if (storeIds.length === 0) {
          setStores([]);
          return;
        }

        const { data, error } = await supabase
          .from('stores')
          .select('id, store_code, store_name')
          .in('id', storeIds)
          .eq('active', true)
          .order('store_code');
        if (error) throw error;
        setStores(data || []);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      toast({
        type: 'error',
        title: t('errorOccurred'),
        message: t('cannotLoadStores'),
      });
    }
  }, [user]);

  // -----------------------------------------------------------------------
  // Fetch stats + activities for the selected store
  // -----------------------------------------------------------------------

  const fetchStoreData = useCallback(async () => {
    if (!selectedStoreId) {
      setStats(null);
      setActivities([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const storeId = selectedStoreId;

      // --- Staff count (users assigned to this store) ---
      const { count: staffCount } = await supabase
        .from('user_stores')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId);

      // --- Active deposits (status = 'in_store') ---
      const { count: activeDeposits } = await supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('status', 'in_store');

      // --- Pending deposit requests (status = 'pending') ---
      const { count: pendingDeposits } = await supabase
        .from('deposit_requests')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('status', 'pending');

      // --- Pending withdrawals (status IN 'pending', 'approved') ---
      const { count: pendingWithdrawals } = await supabase
        .from('withdrawals')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .in('status', ['pending', 'approved']);

      // --- Stock alerts (unexplained comparisons, status = 'pending') ---
      const { count: stockAlerts } = await supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('status', 'pending');

      // --- Expiring soon (in_store + expiry_date within 7 days) ---
      const { count: expiringSoon } = await supabase
        .from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('status', 'in_store')
        .gt('expiry_date', startOfTodayBangkokISO())
        .lt('expiry_date', daysFromNowISO(7));

      // --- Last stock check (latest manual_counts.count_date) ---
      const { data: latestCount } = await supabase
        .from('manual_counts')
        .select('count_date')
        .eq('store_id', storeId)
        .order('count_date', { ascending: false })
        .limit(1)
        .single();

      setStats({
        staffCount: staffCount || 0,
        activeDeposits: activeDeposits || 0,
        pendingDeposits: pendingDeposits || 0,
        pendingWithdrawals: pendingWithdrawals || 0,
        stockAlerts: stockAlerts || 0,
        expiringSoon: expiringSoon || 0,
        lastStockCheck: latestCount?.count_date || null,
      });

      // --- Recent activities (last 10 audit_logs for this store) ---
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('id, action_type, table_name, created_at, changed_by')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (logs && logs.length > 0) {
        // Resolve display names from profiles
        const userIds = [
          ...new Set(logs.map((l) => l.changed_by).filter(Boolean)),
        ] as string[];
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
      console.error('Error fetching store data:', error);
      toast({
        type: 'error',
        title: t('errorOccurred'),
        message: t('cannotLoadStoreData'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  // Load stores on mount (and when user changes)
  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // Load store data when selected store changes
  useEffect(() => {
    fetchStoreData();
  }, [fetchStoreData]);

  // -----------------------------------------------------------------------
  // Store selection handler
  // -----------------------------------------------------------------------

  const handleSelectStore = (storeId: string) => {
    setCurrentStoreId(storeId);
    setShowStoreSelector(false);
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading && stores.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // No stores available
  // -----------------------------------------------------------------------

  if (stores.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
            <Store className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('noStoresFound')}
          </h3>
          <p className="mt-1 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
            {t('noStoresAssigned')}
          </p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {t('subtitle')}
        </p>
      </div>

      {/* Store Selector */}
      <div className="relative">
        <button
          onClick={() => setShowStoreSelector(!showStoreSelector)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 transition-colors',
            'hover:bg-gray-50',
            'dark:bg-gray-800 dark:ring-gray-700 dark:hover:bg-gray-750'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {selectedStore?.store_name || t('selectStore')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('storeCode', { code: selectedStore?.store_code || '-' })}
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 text-gray-400 transition-transform',
              showStoreSelector && 'rotate-180'
            )}
          />
        </button>

        {/* Dropdown */}
        {showStoreSelector && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => handleSelectStore(store.id)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                  'hover:bg-gray-50 dark:hover:bg-gray-750',
                  store.id === selectedStoreId &&
                    'bg-indigo-50 dark:bg-indigo-900/10'
                )}
              >
                <Store
                  className={cn(
                    'h-4 w-4',
                    store.id === selectedStoreId
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-400'
                  )}
                />
                <div>
                  <p
                    className={cn(
                      'text-sm font-medium',
                      store.id === selectedStoreId
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-900 dark:text-white'
                    )}
                  >
                    {store.store_name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t('storeCode', { code: store.store_code })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading indicator for stats */}
      {loading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      )}

      {/* Stats Cards */}
      {!loading && stats && (
        <div className="grid grid-cols-2 gap-3">
          {/* Staff count */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('staffCount')}
              </span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {formatNumber(stats.staffCount)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('people')}</p>
          </div>

          {/* Active deposits */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <Wine className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('activeDeposits')}
              </span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {formatNumber(stats.activeDeposits)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('entries')}</p>
          </div>

          {/* Pending (deposits + withdrawals) */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('pendingAction')}
              </span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {formatNumber(stats.pendingDeposits + stats.pendingWithdrawals)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('depositSlashWithdraw', { deposits: formatNumber(stats.pendingDeposits), withdrawals: formatNumber(stats.pendingWithdrawals) })}
            </p>
          </div>

          {/* Stock alerts */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  'h-4 w-4',
                  stats.stockAlerts > 0 ? 'text-red-500' : 'text-gray-300'
                )}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('stockAlerts')}
              </span>
            </div>
            <p
              className={cn(
                'mt-1 text-xl font-bold',
                stats.stockAlerts > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-white'
              )}
            >
              {formatNumber(stats.stockAlerts)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('entries')}</p>
          </div>

          {/* Expiring soon */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <CalendarClock
                className={cn(
                  'h-4 w-4',
                  stats.expiringSoon > 0 ? 'text-orange-500' : 'text-gray-300'
                )}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('expiringSoon')}
              </span>
            </div>
            <p
              className={cn(
                'mt-1 text-xl font-bold',
                stats.expiringSoon > 0
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-gray-900 dark:text-white'
              )}
            >
              {formatNumber(stats.expiringSoon)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('within7Days')}
            </p>
          </div>

          {/* Last stock check */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-violet-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('lastStockCheck')}
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
              {stats.lastStockCheck
                ? formatThaiDate(stats.lastStockCheck)
                : t('neverCounted')}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {stats.lastStockCheck
                ? relativeTime(stats.lastStockCheck, t)
                : '-'}
            </p>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {!loading && (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {t('recentActivity')}
            </h2>
            <Link
              href="/activity"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {t('viewAll')}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
                <Inbox className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('noActivity')}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                {t('noActivityDesc')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {activities.map((activity) => {
                const mapped = mapActivity(
                  activity.action_type,
                  activity.table_name,
                  t
                );
                const ActivityIcon = mapped.icon;
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <div className={cn('mt-0.5', mapped.colorClass)}>
                      <ActivityIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {mapped.label}
                        {activity.changed_by_name && (
                          <span className="ml-1 text-gray-400 dark:text-gray-500">
                            &mdash; {activity.changed_by_name}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {relativeTime(activity.created_at, t)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
