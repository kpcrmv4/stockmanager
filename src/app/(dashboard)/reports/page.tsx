'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Select,
  Tabs,
  toast,
} from '@/components/ui';
import {
  formatThaiDate,
  formatThaiShortDate,
  formatNumber,
  formatCurrency,
} from '@/lib/utils/format';
import {
  FileText,
  Download,
  Calendar,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Package,
  Wine,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  RefreshCw,
  Store,
  FileDown,
  ShieldAlert,
  Percent,
  Users,
  ClipboardCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  name: string;
}

interface OverviewData {
  totalDeposits: number;
  totalWithdrawals: number;
  totalStockChecks: number;
  totalPenalties: number;
  depositsTrend: number;
  withdrawalsTrend: number;
  stockChecksTrend: number;
  penaltiesTrend: number;
}

interface StockReportData {
  daysChecked: number;
  totalDaysInRange: number;
  avgDiffPercent: number;
  totalDiscrepancies: number;
  topDiscrepancies: {
    productName: string;
    productCode: string;
    totalDiff: number;
    occurrences: number;
  }[];
}

interface DepositReportData {
  totalActive: number;
  newDepositsInRange: number;
  withdrawalsInRange: number;
  expiringSoon: number;
  popularProducts: {
    productName: string;
    count: number;
  }[];
}

interface FinancialReportData {
  penaltyRevenue: number;
  depositFees: number;
  expiredForfeit: number;
  totalRevenue: number;
  revenueByMonth: {
    month: string;
    amount: number;
  }[];
}

// ---------------------------------------------------------------------------
// Chart data types
// ---------------------------------------------------------------------------

interface DailyActivity {
  date: string;
  deposits: number;
  withdrawals: number;
  stockChecks: number;
}

interface DailyDiff {
  date: string;
  avgDiff: number;
}

interface WeeklyDepositData {
  week: string;
  deposits: number;
  withdrawals: number;
}

interface MonthlyPenaltyData {
  month: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Chart colors & components
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  indigo: '#6366f1',
  emerald: '#10b981',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#ef4444',
};

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

function FinancialTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
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
// Report tabs config
// ---------------------------------------------------------------------------

const reportTabs = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'stock', label: 'สต๊อก' },
  { id: 'deposit', label: 'ฝากเหล้า' },
  { id: 'financial', label: 'การเงิน' },
];

// ---------------------------------------------------------------------------
// Helper: date to YYYY-MM-DD string
// ---------------------------------------------------------------------------

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDefaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: toDateString(start), end: toDateString(end) };
}

// Helper: compute trend percentage
function computeTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return parseFloat(((current - previous) / previous * 100).toFixed(1));
}

// Helper: get ISO week label from a date string
function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  // Get Monday of the week
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const dd = String(monday.getDate()).padStart(2, '0');
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// Helper: get Thai short month label from a date string
function getMonthLabel(dateStr: string): string {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const d = new Date(dateStr);
  return `${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// Helper: get YYYY-MM key from a date string
function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Helper: extract date (YYYY-MM-DD) from datetime string
function extractDate(dateTimeStr: string): string {
  return dateTimeStr.split('T')[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { user } = useAuthStore();
  const { currentStoreId, setCurrentStoreId } = useAppStore();

  // Date range
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);

  // Store selector
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(currentStoreId || '');

  // Active tab
  const [activeTab, setActiveTab] = useState('overview');

  // Loading
  const [loading, setLoading] = useState(true);

  // Report data
  const [overview, setOverview] = useState<OverviewData>({
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalStockChecks: 0,
    totalPenalties: 0,
    depositsTrend: 0,
    withdrawalsTrend: 0,
    stockChecksTrend: 0,
    penaltiesTrend: 0,
  });
  const [stockReport, setStockReport] = useState<StockReportData>({
    daysChecked: 0,
    totalDaysInRange: 0,
    avgDiffPercent: 0,
    totalDiscrepancies: 0,
    topDiscrepancies: [],
  });
  const [depositReport, setDepositReport] = useState<DepositReportData>({
    totalActive: 0,
    newDepositsInRange: 0,
    withdrawalsInRange: 0,
    expiringSoon: 0,
    popularProducts: [],
  });
  const [financialReport, setFinancialReport] = useState<FinancialReportData>({
    penaltyRevenue: 0,
    depositFees: 0,
    expiredForfeit: 0,
    totalRevenue: 0,
    revenueByMonth: [],
  });

  // Chart data
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [dailyDiffs, setDailyDiffs] = useState<DailyDiff[]>([]);
  const [weeklyDeposits, setWeeklyDeposits] = useState<WeeklyDepositData[]>([]);
  const [monthlyPenalties, setMonthlyPenalties] = useState<MonthlyPenaltyData[]>([]);

  // Whether the user can pick any store (owner / accountant)
  const canSelectStore = user?.role === 'owner' || user?.role === 'accountant';

  // ------------------------------------------------------------------
  // Load store list for owner/accountant
  // ------------------------------------------------------------------
  useEffect(() => {
    async function loadStores() {
      if (!canSelectStore) return;
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('stores')
          .select('id, name')
          .order('name');
        if (data && data.length > 0) {
          setStores(data as StoreOption[]);
          if (!selectedStoreId) {
            setSelectedStoreId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load stores:', err);
      }
    }
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSelectStore]);

  // Keep selectedStoreId in sync when currentStoreId changes externally
  useEffect(() => {
    if (currentStoreId && !canSelectStore) {
      setSelectedStoreId(currentStoreId);
    }
  }, [currentStoreId, canSelectStore]);

  // ------------------------------------------------------------------
  // Fetch report data
  // ------------------------------------------------------------------
  const fetchReportData = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);

    try {
      const supabase = createClient();

      // Compute previous period for trend comparison
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      const rangeDurationMs = endMs - startMs;
      const prevEnd = new Date(startMs - 1); // day before current start
      const prevStart = new Date(prevEnd.getTime() - rangeDurationMs);
      const prevStartStr = toDateString(prevStart);
      const prevEndStr = toDateString(prevEnd);

      // --- Overview: current period counts ---
      const [
        { count: depositsCount },
        { count: withdrawalsCount },
        { count: stockChecksCount },
        { count: penaltiesCount },
      ] = await Promise.all([
        supabase
          .from('deposits')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
        supabase
          .from('withdrawals')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
        supabase
          .from('manual_counts')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('count_date', startDate)
          .lte('count_date', endDate),
        supabase
          .from('penalties')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
      ]);

      // --- Overview: previous period counts for trends ---
      const [
        { count: prevDepositsCount },
        { count: prevWithdrawalsCount },
        { count: prevStockChecksCount },
        { count: prevPenaltiesCount },
      ] = await Promise.all([
        supabase
          .from('deposits')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('created_at', prevStartStr)
          .lte('created_at', prevEndStr + 'T23:59:59'),
        supabase
          .from('withdrawals')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('created_at', prevStartStr)
          .lte('created_at', prevEndStr + 'T23:59:59'),
        supabase
          .from('manual_counts')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('count_date', prevStartStr)
          .lte('count_date', prevEndStr),
        supabase
          .from('penalties')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('created_at', prevStartStr)
          .lte('created_at', prevEndStr + 'T23:59:59'),
      ]);

      const curDeposits = depositsCount ?? 0;
      const curWithdrawals = withdrawalsCount ?? 0;
      const curStockChecks = stockChecksCount ?? 0;
      const curPenalties = penaltiesCount ?? 0;

      setOverview({
        totalDeposits: curDeposits,
        totalWithdrawals: curWithdrawals,
        totalStockChecks: curStockChecks,
        totalPenalties: curPenalties,
        depositsTrend: computeTrend(curDeposits, prevDepositsCount ?? 0),
        withdrawalsTrend: computeTrend(curWithdrawals, prevWithdrawalsCount ?? 0),
        stockChecksTrend: computeTrend(curStockChecks, prevStockChecksCount ?? 0),
        penaltiesTrend: computeTrend(curPenalties, prevPenaltiesCount ?? 0),
      });

      // --- Overview: daily activity chart data ---
      const [
        { data: depositsInRange },
        { data: withdrawalsInRange },
        { data: countsInRange },
      ] = await Promise.all([
        supabase
          .from('deposits')
          .select('created_at')
          .eq('store_id', selectedStoreId)
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
        supabase
          .from('withdrawals')
          .select('created_at')
          .eq('store_id', selectedStoreId)
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
        supabase
          .from('manual_counts')
          .select('count_date')
          .eq('store_id', selectedStoreId)
          .gte('count_date', startDate)
          .lte('count_date', endDate),
      ]);

      // Build daily activity map
      const dateMap: Record<string, DailyActivity> = {};

      // Initialize all dates in range
      const currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);
      while (currentDate <= endDateObj) {
        const key = toDateString(currentDate);
        dateMap[key] = {
          date: formatThaiShortDate(key),
          deposits: 0,
          withdrawals: 0,
          stockChecks: 0,
        };
        currentDate.setDate(currentDate.getDate() + 1);
      }

      (depositsInRange || []).forEach((d) => {
        const key = extractDate(d.created_at);
        if (dateMap[key]) dateMap[key].deposits += 1;
      });

      (withdrawalsInRange || []).forEach((w) => {
        const key = extractDate(w.created_at);
        if (dateMap[key]) dateMap[key].withdrawals += 1;
      });

      (countsInRange || []).forEach((c) => {
        const key = c.count_date;
        if (dateMap[key]) dateMap[key].stockChecks += 1;
      });

      const dailyActivityArr = Object.keys(dateMap)
        .sort()
        .map((key) => dateMap[key]);
      setDailyActivity(dailyActivityArr);

      // --- Stock comparisons ---
      const [{ data: comparisons }, { data: productsData }] = await Promise.all([
        supabase
          .from('comparisons')
          .select('comp_date, difference, diff_percent, product_code, product_name, status')
          .eq('store_id', selectedStoreId)
          .gte('comp_date', startDate)
          .lte('comp_date', endDate),
        supabase
          .from('products')
          .select('product_code, product_name')
          .eq('store_id', selectedStoreId),
      ]);

      // Build product code -> name map
      const productNameMap: Record<string, string> = {};
      (productsData || []).forEach((p) => {
        productNameMap[p.product_code] = p.product_name;
      });

      if (comparisons && comparisons.length > 0) {
        const uniqueDates = new Set(comparisons.map((c) => c.comp_date));
        const discrepancies = comparisons.filter(
          (c) => c.difference !== 0 && c.difference !== null
        );
        const totalAbsDiff = discrepancies.reduce(
          (sum, c) => sum + Math.abs(c.difference ?? 0),
          0
        );
        const avgDiff =
          comparisons.length > 0
            ? (totalAbsDiff / comparisons.length) * 100
            : 0;

        // Group discrepancies by product_code
        const byProduct = discrepancies.reduce<
          Record<string, { totalDiff: number; occurrences: number }>
        >((acc, c) => {
          const code = c.product_code || 'UNKNOWN';
          if (!acc[code]) acc[code] = { totalDiff: 0, occurrences: 0 };
          acc[code].totalDiff += c.difference ?? 0;
          acc[code].occurrences += 1;
          return acc;
        }, {});

        const topDisc = Object.entries(byProduct)
          .sort((a, b) => Math.abs(b[1].totalDiff) - Math.abs(a[1].totalDiff))
          .slice(0, 5)
          .map(([code, v]) => ({
            productName: productNameMap[code] || code,
            productCode: code,
            totalDiff: v.totalDiff,
            occurrences: v.occurrences,
          }));

        // Calculate total days in range
        const msInDay = 1000 * 60 * 60 * 24;
        const totalDays = Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / msInDay
        ) + 1;

        setStockReport({
          daysChecked: uniqueDates.size,
          totalDaysInRange: totalDays,
          avgDiffPercent: parseFloat(avgDiff.toFixed(1)),
          totalDiscrepancies: discrepancies.length,
          topDiscrepancies: topDisc,
        });

        // Daily diff chart data
        const diffByDate = comparisons.reduce<Record<string, number[]>>((acc, c) => {
          if (!acc[c.comp_date]) acc[c.comp_date] = [];
          acc[c.comp_date].push(Math.abs(c.difference ?? 0));
          return acc;
        }, {});

        const dailyDiffArr = Object.entries(diffByDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, diffs]) => ({
            date: formatThaiShortDate(date),
            avgDiff: parseFloat((diffs.reduce((s, d) => s + d, 0) / diffs.length).toFixed(1)),
          }));
        setDailyDiffs(dailyDiffArr);
      } else {
        const msInDay = 1000 * 60 * 60 * 24;
        const totalDays = Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / msInDay
        ) + 1;
        setStockReport({
          daysChecked: 0,
          totalDaysInRange: totalDays,
          avgDiffPercent: 0,
          totalDiscrepancies: 0,
          topDiscrepancies: [],
        });
        setDailyDiffs([]);
      }

      // --- Deposits tab ---
      const [{ data: depositsData }, { data: withdrawalsData }] = await Promise.all([
        supabase
          .from('deposits')
          .select('id, status, product_name, expiry_date, created_at')
          .eq('store_id', selectedStoreId),
        supabase
          .from('withdrawals')
          .select('id, created_at')
          .eq('store_id', selectedStoreId)
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
      ]);

      if (depositsData && depositsData.length > 0) {
        const active = depositsData.filter((d) => d.status === 'in_store');
        const newInRange = depositsData.filter(
          (d) => d.created_at >= startDate && d.created_at <= endDate + 'T23:59:59'
        );
        const now = new Date();
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        const expiring = active.filter(
          (d) =>
            d.expiry_date &&
            new Date(d.expiry_date) > now &&
            new Date(d.expiry_date) <= weekFromNow
        );

        // Popular products
        const productCounts: Record<string, number> = {};
        depositsData.forEach((d) => {
          const name = d.product_name || 'ไม่ระบุ';
          productCounts[name] = (productCounts[name] || 0) + 1;
        });
        const popular = Object.entries(productCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([productName, count]) => ({ productName, count }));

        setDepositReport({
          totalActive: active.length,
          newDepositsInRange: newInRange.length,
          withdrawalsInRange: (withdrawalsData || []).length,
          expiringSoon: expiring.length,
          popularProducts: popular,
        });

        // Weekly deposit/withdrawal chart data
        const weekMap: Record<string, { deposits: number; withdrawals: number }> = {};
        newInRange.forEach((d) => {
          const wk = getWeekLabel(d.created_at);
          if (!weekMap[wk]) weekMap[wk] = { deposits: 0, withdrawals: 0 };
          weekMap[wk].deposits += 1;
        });
        (withdrawalsData || []).forEach((w) => {
          const wk = getWeekLabel(w.created_at);
          if (!weekMap[wk]) weekMap[wk] = { deposits: 0, withdrawals: 0 };
          weekMap[wk].withdrawals += 1;
        });
        const weeklyArr = Object.entries(weekMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, v]) => ({
            week: `สัปดาห์ ${week}`,
            deposits: v.deposits,
            withdrawals: v.withdrawals,
          }));
        setWeeklyDeposits(weeklyArr);
      } else {
        setDepositReport({
          totalActive: 0,
          newDepositsInRange: 0,
          withdrawalsInRange: (withdrawalsData || []).length,
          expiringSoon: 0,
          popularProducts: [],
        });
        setWeeklyDeposits([]);
      }

      // --- Financial tab: real data from penalties + expired deposits ---
      const [{ data: penaltiesData }, { data: expiredDeposits }] = await Promise.all([
        supabase
          .from('penalties')
          .select('id, amount, created_at, status')
          .eq('store_id', selectedStoreId)
          .eq('status', 'approved')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
        supabase
          .from('deposits')
          .select('id, created_at')
          .eq('store_id', selectedStoreId)
          .eq('status', 'expired')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
      ]);

      const penaltyRevenue = (penaltiesData || []).reduce(
        (sum, p) => sum + (parseFloat(String(p.amount)) || 0),
        0
      );
      const expiredForfeitCount = (expiredDeposits || []).length;

      // No deposit fees table exists
      const depositFees = 0;
      const totalRevenue = penaltyRevenue + depositFees;

      // Group penalties by month for chart and table
      const penaltyByMonth: Record<string, number> = {};
      (penaltiesData || []).forEach((p) => {
        const mk = getMonthKey(p.created_at);
        const label = getMonthLabel(p.created_at);
        if (!penaltyByMonth[mk]) penaltyByMonth[mk] = 0;
        penaltyByMonth[mk] += parseFloat(String(p.amount)) || 0;
      });

      const monthlyPenaltyArr = Object.entries(penaltyByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mk, amount]) => ({
          month: getMonthLabel(mk + '-01'),
          amount: parseFloat(amount.toFixed(2)),
        }));

      setMonthlyPenalties(monthlyPenaltyArr);

      setFinancialReport({
        penaltyRevenue,
        depositFees,
        expiredForfeit: expiredForfeitCount,
        totalRevenue,
        revenueByMonth: monthlyPenaltyArr,
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดข้อมูลรายงานได้',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, startDate, endDate]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // ------------------------------------------------------------------
  // Export handlers
  // ------------------------------------------------------------------
  const handleExportPDF = () => {
    toast({
      type: 'info',
      title: 'กำลังพัฒนา',
      message: 'ฟีเจอร์ส่งออก PDF จะเปิดใช้งานเร็ว ๆ นี้',
    });
  };

  const handleExportCSV = () => {
    let csvContent = '';
    let filename = '';

    if (activeTab === 'overview') {
      csvContent = 'รายการ,จำนวน,แนวโน้ม(%)\n';
      csvContent += `ฝากเหล้าใหม่,${overview.totalDeposits},${overview.depositsTrend}\n`;
      csvContent += `เบิกเหล้า,${overview.totalWithdrawals},${overview.withdrawalsTrend}\n`;
      csvContent += `ตรวจนับสต๊อก,${overview.totalStockChecks},${overview.stockChecksTrend}\n`;
      csvContent += `บทลงโทษ,${overview.totalPenalties},${overview.penaltiesTrend}\n`;
      filename = 'report-overview';
    } else if (activeTab === 'stock') {
      csvContent = 'สินค้า,รหัส,ส่วนต่างรวม,จำนวนครั้ง\n';
      stockReport.topDiscrepancies.forEach((item) => {
        csvContent += `"${item.productName}",${item.productCode},${item.totalDiff},${item.occurrences}\n`;
      });
      filename = 'report-stock';
    } else if (activeTab === 'deposit') {
      csvContent = 'รายการ,จำนวน\n';
      csvContent += `ฝากอยู่ในร้าน,${depositReport.totalActive}\n`;
      csvContent += `ฝากใหม่ในช่วงนี้,${depositReport.newDepositsInRange}\n`;
      csvContent += `เบิกในช่วงนี้,${depositReport.withdrawalsInRange}\n`;
      csvContent += `ใกล้หมดอายุ,${depositReport.expiringSoon}\n`;
      csvContent += '\nสินค้ายอดนิยม,จำนวน\n';
      depositReport.popularProducts.forEach((item) => {
        csvContent += `"${item.productName}",${item.count}\n`;
      });
      filename = 'report-deposit';
    } else if (activeTab === 'financial') {
      csvContent = 'รายการ,จำนวน (บาท)\n';
      csvContent += `รายได้จากค่าปรับ,${financialReport.penaltyRevenue.toFixed(2)}\n`;
      csvContent += `ค่าบริการฝากเหล้า,${financialReport.depositFees.toFixed(2)}\n`;
      csvContent += `เหล้าหมดอายุ (จำนวน),${financialReport.expiredForfeit}\n`;
      csvContent += `รายได้รวม,${financialReport.totalRevenue.toFixed(2)}\n`;
      csvContent += '\nเดือน,ยอดค่าปรับ (บาท)\n';
      financialReport.revenueByMonth.forEach((row) => {
        csvContent += `${row.month},${row.amount.toFixed(2)}\n`;
      });
      filename = 'report-financial';
    }

    if (!csvContent) return;

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${startDate}-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      type: 'success',
      title: 'ส่งออกสำเร็จ',
      message: `ดาวน์โหลดไฟล์ ${filename}.csv เรียบร้อย`,
    });
  };

  // ------------------------------------------------------------------
  // Trend badge helper
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Tab content renderers
  // ------------------------------------------------------------------

  function renderOverviewTab() {
    const cards = [
      {
        label: 'ฝากเหล้าใหม่',
        value: formatNumber(overview.totalDeposits),
        trend: overview.depositsTrend,
        icon: Wine,
        lightBg: 'bg-indigo-50 dark:bg-indigo-900/20',
        textColor: 'text-indigo-600 dark:text-indigo-400',
      },
      {
        label: 'เบิกเหล้า',
        value: formatNumber(overview.totalWithdrawals),
        trend: overview.withdrawalsTrend,
        icon: Package,
        lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
        textColor: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        label: 'ตรวจนับสต๊อก',
        value: formatNumber(overview.totalStockChecks),
        trend: overview.stockChecksTrend,
        icon: ClipboardCheck,
        lightBg: 'bg-blue-50 dark:bg-blue-900/20',
        textColor: 'text-blue-600 dark:text-blue-400',
      },
      {
        label: 'บทลงโทษ',
        value: formatNumber(overview.totalPenalties),
        trend: overview.penaltiesTrend,
        icon: ShieldAlert,
        lightBg: 'bg-red-50 dark:bg-red-900/20',
        textColor: 'text-red-600 dark:text-red-400',
      },
    ];

    return (
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((card) => {
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
                    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                      {card.value}
                    </p>
                    <div className="mt-1">
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

        {/* Daily activity chart */}
        <Card padding="none">
          <CardHeader
            title="กิจกรรมรายวัน"
            description="ภาพรวมกิจกรรมทั้งหมดในช่วงเวลาที่เลือก"
          />
          <CardContent>
            {dailyActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="deposits"
                    name="ฝากเหล้า"
                    stroke={CHART_COLORS.indigo}
                    fill={CHART_COLORS.indigo}
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="withdrawals"
                    name="เบิกเหล้า"
                    stroke={CHART_COLORS.emerald}
                    fill={CHART_COLORS.emerald}
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="stockChecks"
                    name="นับสต๊อก"
                    stroke={CHART_COLORS.blue}
                    fill={CHART_COLORS.blue}
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderStockTab() {
    const summaryItems = [
      {
        label: 'วันที่ตรวจนับ',
        value: `${formatNumber(stockReport.daysChecked)} / ${formatNumber(stockReport.totalDaysInRange)} วัน`,
        icon: Calendar,
        lightBg: 'bg-blue-50 dark:bg-blue-900/20',
        textColor: 'text-blue-600 dark:text-blue-400',
      },
      {
        label: 'ส่วนต่างเฉลี่ย',
        value: `${stockReport.avgDiffPercent}%`,
        icon: Percent,
        lightBg:
          stockReport.avgDiffPercent > 5
            ? 'bg-red-50 dark:bg-red-900/20'
            : 'bg-emerald-50 dark:bg-emerald-900/20',
        textColor:
          stockReport.avgDiffPercent > 5
            ? 'text-red-600 dark:text-red-400'
            : 'text-emerald-600 dark:text-emerald-400',
      },
      {
        label: 'รายการที่ไม่ตรง',
        value: formatNumber(stockReport.totalDiscrepancies),
        icon: AlertTriangle,
        lightBg: 'bg-amber-50 dark:bg-amber-900/20',
        textColor: 'text-amber-600 dark:text-amber-400',
      },
    ];

    return (
      <div className="space-y-6">
        {/* Stock summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {summaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                      item.lightBg
                    )}
                  >
                    <Icon className={cn('h-5 w-5', item.textColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.label}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {item.value}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stock discrepancy trend chart */}
        <Card padding="none">
          <CardHeader
            title="แนวโน้มส่วนต่างสต๊อก"
            description="ค่าเฉลี่ย |ส่วนต่าง| รายวัน"
          />
          <CardContent>
            {dailyDiffs.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyDiffs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <ReferenceLine
                    y={5}
                    stroke={CHART_COLORS.red}
                    strokeDasharray="5 5"
                    label={{ value: 'เกณฑ์เตือน (5)', position: 'insideTopRight', fill: CHART_COLORS.red, fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgDiff"
                    name="ส่วนต่างเฉลี่ย"
                    stroke={CHART_COLORS.amber}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState />
            )}
          </CardContent>
        </Card>

        {/* Top discrepancies table */}
        <Card padding="none">
          <CardHeader
            title="สินค้าที่มีส่วนต่างมากที่สุด"
            description="Top 5 สินค้าที่พบส่วนต่างบ่อยในช่วงเวลาที่เลือก"
          />
          {stockReport.topDiscrepancies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      สินค้า
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      รหัส
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      ส่วนต่างรวม
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      จำนวนครั้ง
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {stockReport.topDiscrepancies.map((item, idx) => (
                    <tr
                      key={item.productCode}
                      className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.productName}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-sm text-gray-500 dark:text-gray-400">
                          {item.productCode}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            item.totalDiff < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {item.totalDiff > 0 ? '+' : ''}
                          {formatNumber(item.totalDiff)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Badge variant="default">{formatNumber(item.occurrences)} ครั้ง</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardContent>
              <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                ยังไม่มีข้อมูลในช่วงนี้
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  function renderDepositTab() {
    const summaryCards = [
      {
        label: 'ฝากอยู่ในร้าน',
        value: formatNumber(depositReport.totalActive),
        icon: Wine,
        lightBg: 'bg-indigo-50 dark:bg-indigo-900/20',
        textColor: 'text-indigo-600 dark:text-indigo-400',
      },
      {
        label: 'ฝากใหม่ในช่วงนี้',
        value: formatNumber(depositReport.newDepositsInRange),
        icon: TrendingUp,
        lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
        textColor: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        label: 'เบิกในช่วงนี้',
        value: formatNumber(depositReport.withdrawalsInRange),
        icon: TrendingDown,
        lightBg: 'bg-blue-50 dark:bg-blue-900/20',
        textColor: 'text-blue-600 dark:text-blue-400',
      },
      {
        label: 'ใกล้หมดอายุ',
        value: formatNumber(depositReport.expiringSoon),
        icon: Clock,
        lightBg: 'bg-red-50 dark:bg-red-900/20',
        textColor: 'text-red-600 dark:text-red-400',
      },
    ];

    return (
      <div className="space-y-6">
        {/* Deposit summary */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                      card.lightBg
                    )}
                  >
                    <Icon className={cn('h-5 w-5', card.textColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {card.label}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {card.value}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Weekly deposit/withdrawal chart */}
          <Card padding="none">
            <CardHeader
              title="แนวโน้มฝาก-เบิก"
              description="จำนวนการฝากและเบิกรายสัปดาห์"
            />
            <CardContent>
              {weeklyDeposits.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={weeklyDeposits}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar
                      dataKey="deposits"
                      name="ฝากใหม่"
                      fill={CHART_COLORS.indigo}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="withdrawals"
                      name="เบิก"
                      fill={CHART_COLORS.emerald}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmptyState />
              )}
            </CardContent>
          </Card>

          {/* Popular products */}
          <Card padding="none">
            <CardHeader
              title="สินค้ายอดนิยม"
              description="สินค้าที่ลูกค้าฝากบ่อยที่สุด"
            />
            {depositReport.popularProducts.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {depositReport.popularProducts.map((item, idx) => (
                  <div
                    key={item.productName}
                    className="flex items-center gap-4 px-5 py-3.5"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {item.productName}
                      </p>
                    </div>
                    <Badge variant="info">{formatNumber(item.count)} ขวด</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <CardContent>
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  ยังไม่มีข้อมูลในช่วงนี้
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    );
  }

  function renderFinancialTab() {
    const revenueCards = [
      {
        label: 'รายได้จากค่าปรับ',
        value: formatCurrency(financialReport.penaltyRevenue),
        icon: ShieldAlert,
        lightBg: 'bg-red-50 dark:bg-red-900/20',
        textColor: 'text-red-600 dark:text-red-400',
      },
      {
        label: 'ค่าบริการฝากเหล้า',
        value: financialReport.depositFees === 0 ? 'ไม่มีข้อมูลค่าบริการ' : formatCurrency(financialReport.depositFees),
        icon: Wine,
        lightBg: 'bg-indigo-50 dark:bg-indigo-900/20',
        textColor: 'text-indigo-600 dark:text-indigo-400',
      },
      {
        label: 'เหล้าหมดอายุ (ริบ)',
        value: `${formatNumber(financialReport.expiredForfeit)} รายการ`,
        icon: Clock,
        lightBg: 'bg-amber-50 dark:bg-amber-900/20',
        textColor: 'text-amber-600 dark:text-amber-400',
      },
      {
        label: 'รายได้รวม',
        value: formatCurrency(financialReport.totalRevenue),
        icon: DollarSign,
        lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
        textColor: 'text-emerald-600 dark:text-emerald-400',
      },
    ];

    return (
      <div className="space-y-6">
        {/* Revenue cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {revenueCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                      card.lightBg
                    )}
                  >
                    <Icon className={cn('h-5 w-5', card.textColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {card.label}
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {card.value}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Monthly penalties chart */}
        <Card padding="none">
          <CardHeader
            title="ค่าปรับรายเดือน"
            description="สรุปยอดค่าปรับที่อนุมัติแล้วแยกตามเดือน"
          />
          <CardContent>
            {monthlyPenalties.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyPenalties}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip content={<FinancialTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="amount"
                    name="ค่าปรับ (บาท)"
                    fill={CHART_COLORS.red}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState />
            )}
          </CardContent>
        </Card>

        {/* Monthly revenue breakdown */}
        <Card padding="none">
          <CardHeader title="รายละเอียดค่าปรับรายเดือน" />
          {financialReport.revenueByMonth.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      เดือน
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      ยอดค่าปรับ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {financialReport.revenueByMonth.map((row) => (
                    <tr
                      key={row.month}
                      className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                        {row.month}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-gray-600">
                    <td className="px-5 py-3.5 text-sm font-bold text-gray-900 dark:text-white">
                      รวมทั้งหมด
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(
                        financialReport.revenueByMonth.reduce((s, r) => s + r.amount, 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <CardContent>
              <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                ยังไม่มีข้อมูลค่าปรับในช่วงนี้
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Page Header + filters                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            รายงาน
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            สรุปภาพรวมข้อมูลและวิเคราะห์ผลการดำเนินงาน
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={fetchReportData}
          >
            รีเฟรช
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<FileDown className="h-4 w-4" />}
            onClick={handleExportPDF}
          >
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="h-4 w-4" />}
            onClick={handleExportCSV}
          >
            CSV
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Filters row: date range + store selector                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        {/* Date range */}
        <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-end">
          <div className="w-full sm:w-48">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              วันที่เริ่มต้น
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
          <div className="w-full sm:w-48">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              วันที่สิ้นสุด
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Store selector (owner/accountant only) */}
        {canSelectStore && stores.length > 0 && (
          <div className="w-full sm:w-56">
            <Select
              label="สาขา"
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
              value={selectedStoreId}
              onChange={(e) => {
                setSelectedStoreId(e.target.value);
                setCurrentStoreId(e.target.value);
              }}
              placeholder="เลือกสาขา"
            />
          </div>
        )}

        {/* Manager sees store label */}
        {!canSelectStore && user?.role === 'manager' && (
          <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 dark:bg-gray-700">
            <Store className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              สาขาของคุณ
            </span>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Report tabs                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Tabs tabs={reportTabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ---------------------------------------------------------------- */}
      {/* Tab content                                                      */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'stock' && renderStockTab()}
      {activeTab === 'deposit' && renderDepositTab()}
      {activeTab === 'financial' && renderFinancialTab()}
    </div>
  );
}
