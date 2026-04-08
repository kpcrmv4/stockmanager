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
  Tabs,
  toast,
} from '@/components/ui';
import {
  formatThaiShortDate,
  formatNumber,
} from '@/lib/utils/format';
import { todayBangkok, nowBangkok } from '@/lib/utils/date';
import {
  Loader2,
  RefreshCw,
  Users,
  Crown,
  AlertTriangle,
  BarChart3,
  Repeat,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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

interface CustomerStats {
  customerId: string | null;
  customerName: string;
  phone: string | null;
  totalDeposits: number;
  activeDeposits: number;
  totalWithdrawals: number;
  expiredDeposits: number;
  isVip: boolean;
  firstDepositDate: string;
  lastDepositDate: string;
  topProducts: string[];
}

interface ProductPopularity {
  productName: string;
  count: number;
}

interface TimeDistribution {
  hour: string;
  deposits: number;
  withdrawals: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6'];

function getDefaultDateRange(): { start: string; end: string } {
  const endStr = todayBangkok();
  const d = nowBangkok();
  d.setDate(d.getDate() - 90);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { start: `${y}-${m}-${day}`, end: endStr };
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
  const t = useTranslations('performance.customers');
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
// Component
// ---------------------------------------------------------------------------

export default function CustomerAnalyticsPage() {
  const t = useTranslations('performance.customers');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(currentStoreId || '');
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerStats[]>([]);
  const [topProducts, setTopProducts] = useState<ProductPopularity[]>([]);
  const [timeDistribution, setTimeDistribution] = useState<TimeDistribution[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

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

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);

    try {
      const supabase = createClient();

      // Get all deposits for the store in date range
      const { data: deposits } = await supabase
        .from('deposits')
        .select('id, customer_id, customer_name, customer_phone, product_name, status, expiry_date, is_vip, created_at')
        .eq('store_id', selectedStoreId)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59')
        .order('created_at', { ascending: false });

      // Get withdrawals
      const { data: withdrawals } = await supabase
        .from('withdrawals')
        .select('id, deposit_id, customer_name, created_at')
        .eq('store_id', selectedStoreId)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59');

      // Build customer stats
      const customerMap: Record<string, CustomerStats> = {};
      const productMap: Record<string, number> = {};
      const hourMap: Record<string, { deposits: number; withdrawals: number }> = {};

      // Initialize 24 hours
      for (let i = 0; i < 24; i++) {
        const h = String(i).padStart(2, '0');
        hourMap[h] = { deposits: 0, withdrawals: 0 };
      }

      (deposits || []).forEach((d) => {
        const key = d.customer_name || 'Unknown';
        if (!customerMap[key]) {
          customerMap[key] = {
            customerId: d.customer_id,
            customerName: d.customer_name || 'Unknown',
            phone: d.customer_phone,
            totalDeposits: 0,
            activeDeposits: 0,
            totalWithdrawals: 0,
            expiredDeposits: 0,
            isVip: d.is_vip || false,
            firstDepositDate: d.created_at,
            lastDepositDate: d.created_at,
            topProducts: [],
          };
        }

        const cust = customerMap[key];
        cust.totalDeposits += 1;
        if (d.is_vip) cust.isVip = true;
        if (d.status === 'in_store') cust.activeDeposits += 1;
        if (d.status === 'expired') cust.expiredDeposits += 1;
        if (d.created_at < cust.firstDepositDate) cust.firstDepositDate = d.created_at;
        if (d.created_at > cust.lastDepositDate) cust.lastDepositDate = d.created_at;

        // Track products per customer
        if (d.product_name) {
          if (!cust.topProducts.includes(d.product_name)) {
            cust.topProducts.push(d.product_name);
          }
          productMap[d.product_name] = (productMap[d.product_name] || 0) + 1;
        }

        // Time distribution
        const hour = new Date(d.created_at).getHours();
        const hourKey = String(hour).padStart(2, '0');
        if (hourMap[hourKey]) hourMap[hourKey].deposits += 1;
      });

      // Count withdrawals per customer
      (withdrawals || []).forEach((w) => {
        const key = w.customer_name || 'Unknown';
        if (customerMap[key]) {
          customerMap[key].totalWithdrawals += 1;
        }

        const hour = new Date(w.created_at).getHours();
        const hourKey = String(hour).padStart(2, '0');
        if (hourMap[hourKey]) hourMap[hourKey].withdrawals += 1;
      });

      // Sort customers by total deposits
      const sorted = Object.values(customerMap).sort(
        (a, b) => b.totalDeposits - a.totalDeposits
      );
      setCustomers(sorted);

      // Top products
      const sortedProducts = Object.entries(productMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ productName: name, count }));
      setTopProducts(sortedProducts);

      // Time distribution
      const timeArr = Object.entries(hourMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hour, data]) => ({
          hour: `${hour}:00`,
          deposits: data.deposits,
          withdrawals: data.withdrawals,
        }));
      setTimeDistribution(timeArr);
    } catch (err) {
      console.error('Failed to fetch customer analytics:', err);
      toast({ type: 'error', title: t('loadError') });
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Summary stats
  const totalCustomers = customers.length;
  const vipCount = customers.filter((c) => c.isVip).length;
  const repeatCustomers = customers.filter((c) => c.totalDeposits >= 2).length;
  const totalExpired = customers.reduce((s, c) => s + c.expiredDeposits, 0);

  const tabs = [
    { id: 'overview', label: t('tabOverview') },
    { id: 'ranking', label: t('tabRanking') },
    { id: 'products', label: t('tabProducts') },
    { id: 'behavior', label: t('tabBehavior') },
  ];

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
        <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
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
                    <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatNumber(totalCustomers)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('totalCustomers')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatNumber(vipCount)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">VIP</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Repeat className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatNumber(repeatCustomers)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('regulars')}</p>
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
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('expiredForfeited')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
          />

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top Products Pie Chart */}
              <Card>
                <CardHeader title={t('topProducts')} description={t('topProductsDesc')} />
                <CardContent>
                  {topProducts.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={topProducts.slice(0, 8)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius="70%"
                          dataKey="count"
                          nameKey="productName"
                        >
                          {topProducts.slice(0, 8).map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                          layout="horizontal"
                          verticalAlign="bottom"
                          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                          formatter={(value: string) => {
                            const item = topProducts.find((p) => p.productName === value);
                            const total = topProducts.slice(0, 8).reduce((s, p) => s + p.count, 0);
                            const pct = item && total > 0 ? ((item.count / total) * 100).toFixed(0) : '0';
                            return `${value} (${pct}%)`;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmptyState message={t('noProductData')} />
                  )}
                </CardContent>
              </Card>

              {/* Time Distribution */}
              <Card>
                <CardHeader title={t('serviceHours')} description={t('serviceHoursDesc')} />
                <CardContent>
                  {timeDistribution.some((t) => t.deposits > 0 || t.withdrawals > 0) ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={timeDistribution} margin={{ left: -10, right: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={5} tickFormatter={(v: string) => v.replace(':00', '')} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="deposits" name={t('depositShort')} fill="#6366f1" />
                        <Bar dataKey="withdrawals" name={t('withdrawalShort')} fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmptyState />
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Ranking tab */}
          {activeTab === 'ranking' && (
            <Card>
              <CardHeader
                title={t('allCustomers', { count: customers.length })}
                description={t('sortedByDeposit')}
              />
              <CardContent>
                {customers.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                    {t('noCustomerData')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">{t('colCustomer')}</th>
                          <th className="px-4 py-3 text-center">{t('colTotalDeposits')}</th>
                          <th className="px-4 py-3 text-center">{t('colActiveDeposits')}</th>
                          <th className="px-4 py-3 text-center">{t('colWithdrawn')}</th>
                          <th className="px-4 py-3 text-center">{t('colExpired')}</th>
                          <th className="px-4 py-3">{t('colProducts')}</th>
                          <th className="px-4 py-3">{t('colLastVisit')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {customers.slice(0, 50).map((cust, idx) => (
                          <tr
                            key={cust.customerName + idx}
                            className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-400">{idx + 1}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {cust.isVip && (
                                  <Crown className="h-4 w-4 text-amber-500" />
                                )}
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {cust.customerName}
                                  </p>
                                  {cust.phone && (
                                    <p className="text-xs text-gray-400">{cust.phone}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                              {cust.totalDeposits}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {cust.activeDeposits > 0 ? (
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                  {cust.activeDeposits}
                                </span>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {cust.totalWithdrawals}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {cust.expiredDeposits > 0 ? (
                                <span className="text-red-500">{cust.expiredDeposits}</span>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {cust.topProducts.slice(0, 3).map((p) => (
                                  <span
                                    key={p}
                                    className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                  >
                                    {p}
                                  </span>
                                ))}
                                {cust.topProducts.length > 3 && (
                                  <span className="text-xs text-gray-400">
                                    +{cust.topProducts.length - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {formatThaiShortDate(cust.lastDepositDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Products tab */}
          {activeTab === 'products' && (
            <Card>
              <CardHeader
                title={t('topProductsTop10')}
                description={t('topProductsTop10Desc')}
              />
              <CardContent>
                {topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={topProducts} layout="vertical" margin={{ left: 0, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="productName"
                        tick={{ fontSize: 10 }}
                        width={120}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name={t('timesCount')} fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmptyState message={t('noProductData')} />
                )}
              </CardContent>
            </Card>
          )}

          {/* Behavior tab */}
          {activeTab === 'behavior' && (
            <div className="space-y-6">
              {/* Time distribution full width */}
              <Card>
                <CardHeader
                  title={t('serviceHours24')}
                  description={t('serviceHours24Desc')}
                />
                <CardContent>
                  {timeDistribution.some((t) => t.deposits > 0 || t.withdrawals > 0) ? (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={timeDistribution} margin={{ left: -10, right: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={5} tickFormatter={(v: string) => v.replace(':00', '')} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="deposits" name={t('depositShort')} fill="#6366f1" />
                        <Bar dataKey="withdrawals" name={t('withdrawalShort')} fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmptyState />
                  )}
                </CardContent>
              </Card>

              {/* Customer segments */}
              <div className="grid gap-6 lg:grid-cols-3">
                <Card>
                  <CardHeader title={t('newCustomers')} />
                  <CardContent>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                        {customers.filter((c) => c.totalDeposits === 1).length}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {totalCustomers > 0
                          ? t('percentOfTotal', { pct: ((customers.filter((c) => c.totalDeposits === 1).length / totalCustomers) * 100).toFixed(0) })
                          : '-'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader title={t('regularCustomers')} />
                  <CardContent>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                        {customers.filter((c) => c.totalDeposits >= 2 && c.totalDeposits <= 5).length}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {totalCustomers > 0
                          ? t('percentOfTotal', { pct: ((customers.filter((c) => c.totalDeposits >= 2 && c.totalDeposits <= 5).length / totalCustomers) * 100).toFixed(0) })
                          : '-'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader title={t('heavyUsers')} />
                  <CardContent>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-amber-600 dark:text-amber-400">
                        {customers.filter((c) => c.totalDeposits >= 6).length}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {totalCustomers > 0
                          ? t('percentOfTotal', { pct: ((customers.filter((c) => c.totalDeposits >= 6).length / totalCustomers) * 100).toFixed(0) })
                          : '-'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
