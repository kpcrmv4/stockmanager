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
// Mock / fallback data
// ---------------------------------------------------------------------------

const MOCK_OVERVIEW: OverviewData = {
  totalDeposits: 47,
  totalWithdrawals: 23,
  totalStockChecks: 28,
  totalPenalties: 5,
  depositsTrend: 12.5,
  withdrawalsTrend: -8.3,
  stockChecksTrend: 3.1,
  penaltiesTrend: -40.0,
};

const MOCK_STOCK: StockReportData = {
  daysChecked: 22,
  totalDaysInRange: 30,
  avgDiffPercent: 2.4,
  totalDiscrepancies: 38,
  topDiscrepancies: [
    { productName: 'เบียร์ช้าง 620ml', productCode: 'BEER-001', totalDiff: -12, occurrences: 8 },
    { productName: 'เหล้าขาว 350ml', productCode: 'SPIRIT-005', totalDiff: -8, occurrences: 5 },
    { productName: 'ไวน์แดง ชิลี', productCode: 'WINE-012', totalDiff: -5, occurrences: 4 },
    { productName: 'วิสกี้ JW Black', productCode: 'WHISKY-003', totalDiff: -4, occurrences: 3 },
    { productName: 'โซดา 325ml', productCode: 'MIX-001', totalDiff: -3, occurrences: 6 },
  ],
};

const MOCK_DEPOSIT: DepositReportData = {
  totalActive: 34,
  newDepositsInRange: 15,
  withdrawalsInRange: 11,
  expiringSoon: 6,
  popularProducts: [
    { productName: 'จอห์นนี่ วอล์กเกอร์ Black Label', count: 8 },
    { productName: 'แอบโซลูท วอดก้า', count: 6 },
    { productName: 'เฮนเนสซี่ V.S.O.P', count: 5 },
    { productName: 'ชีวาส รีกัล 12 ปี', count: 4 },
    { productName: 'แจ็ค แดเนียล', count: 3 },
  ],
};

const MOCK_FINANCIAL: FinancialReportData = {
  penaltyRevenue: 15000,
  depositFees: 8500,
  expiredForfeit: 12000,
  totalRevenue: 35500,
  revenueByMonth: [
    { month: 'ม.ค.', amount: 8200 },
    { month: 'ก.พ.', amount: 9500 },
    { month: 'มี.ค.', amount: 7800 },
    { month: 'เม.ย.', amount: 10000 },
  ],
};

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
  const [overview, setOverview] = useState<OverviewData>(MOCK_OVERVIEW);
  const [stockReport, setStockReport] = useState<StockReportData>(MOCK_STOCK);
  const [depositReport, setDepositReport] = useState<DepositReportData>(MOCK_DEPOSIT);
  const [financialReport, setFinancialReport] = useState<FinancialReportData>(MOCK_FINANCIAL);

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

      // --- Overview ---
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
          .from('deposits')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .eq('status', 'withdrawn')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
        supabase
          .from('manual_counts')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .gte('count_date', startDate)
          .lte('count_date', endDate),
        supabase
          .from('comparisons')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', selectedStoreId)
          .eq('status', 'penalty')
          .gte('comp_date', startDate)
          .lte('comp_date', endDate),
      ]);

      setOverview({
        totalDeposits: depositsCount ?? MOCK_OVERVIEW.totalDeposits,
        totalWithdrawals: withdrawalsCount ?? MOCK_OVERVIEW.totalWithdrawals,
        totalStockChecks: stockChecksCount ?? MOCK_OVERVIEW.totalStockChecks,
        totalPenalties: penaltiesCount ?? MOCK_OVERVIEW.totalPenalties,
        // Trends would require comparing two periods; use mock for now
        depositsTrend: MOCK_OVERVIEW.depositsTrend,
        withdrawalsTrend: MOCK_OVERVIEW.withdrawalsTrend,
        stockChecksTrend: MOCK_OVERVIEW.stockChecksTrend,
        penaltiesTrend: MOCK_OVERVIEW.penaltiesTrend,
      });

      // --- Stock comparisons for stock tab ---
      const { data: comparisons } = await supabase
        .from('comparisons')
        .select('comp_date, difference, product_code, status')
        .eq('store_id', selectedStoreId)
        .gte('comp_date', startDate)
        .lte('comp_date', endDate);

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
            productName: code, // We only have code here; real impl would join products table
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
          topDiscrepancies:
            topDisc.length > 0 ? topDisc : MOCK_STOCK.topDiscrepancies,
        });
      } else {
        setStockReport(MOCK_STOCK);
      }

      // --- Deposits tab ---
      const { data: depositsData } = await supabase
        .from('deposits')
        .select('id, status, product_name, expiry_date, created_at')
        .eq('store_id', selectedStoreId);

      if (depositsData && depositsData.length > 0) {
        const active = depositsData.filter((d) => d.status === 'in_store');
        const newInRange = depositsData.filter(
          (d) => d.created_at >= startDate && d.created_at <= endDate + 'T23:59:59'
        );
        const withdrawnInRange = depositsData.filter(
          (d) =>
            d.status === 'withdrawn' &&
            d.created_at >= startDate &&
            d.created_at <= endDate + 'T23:59:59'
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
          withdrawalsInRange: withdrawnInRange.length,
          expiringSoon: expiring.length,
          popularProducts:
            popular.length > 0 ? popular : MOCK_DEPOSIT.popularProducts,
        });
      } else {
        setDepositReport(MOCK_DEPOSIT);
      }

      // --- Financial tab (placeholder: real data would come from a payments/transactions table) ---
      setFinancialReport(MOCK_FINANCIAL);
    } catch (error) {
      console.error('Error fetching report data:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดข้อมูลรายงานได้',
      });
      // Fall back to mock
      setOverview(MOCK_OVERVIEW);
      setStockReport(MOCK_STOCK);
      setDepositReport(MOCK_DEPOSIT);
      setFinancialReport(MOCK_FINANCIAL);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, startDate, endDate]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // ------------------------------------------------------------------
  // Export placeholders
  // ------------------------------------------------------------------
  const handleExportPDF = () => {
    toast({
      type: 'info',
      title: 'กำลังพัฒนา',
      message: 'ฟีเจอร์ส่งออก PDF จะเปิดใช้งานเร็ว ๆ นี้',
    });
  };

  const handleExportCSV = () => {
    toast({
      type: 'info',
      title: 'กำลังพัฒนา',
      message: 'ฟีเจอร์ส่งออก CSV จะเปิดใช้งานเร็ว ๆ นี้',
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

        {/* Chart placeholder - Overview activity chart */}
        <Card padding="none">
          <CardHeader
            title="กิจกรรมรายวัน"
            description="ภาพรวมกิจกรรมทั้งหมดในช่วงเวลาที่เลือก"
          />
          <CardContent>
            {/* TODO: Integrate Recharts AreaChart / BarChart here
                - X axis: dates in range
                - Y axis: count of activities
                - Series: deposits, withdrawals, stock checks
                Example:
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyActivityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="deposits" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="withdrawals" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="stockChecks" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
            */}
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
              <div className="text-center">
                <BarChart3 className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
                <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                  กราฟกิจกรรมรายวัน
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  (พร้อมใช้งานเมื่อเชื่อมต่อ Recharts)
                </p>
              </div>
            </div>
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

        {/* Chart placeholder - Stock discrepancy trend */}
        <Card padding="none">
          <CardHeader
            title="แนวโน้มส่วนต่างสต๊อก"
            description="เปอร์เซ็นต์ส่วนต่างเฉลี่ยรายวัน"
          />
          <CardContent>
            {/* TODO: Integrate Recharts LineChart here
                - X axis: dates
                - Y axis: diff percentage
                Example:
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyDiffData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="diffPercent" stroke="#f59e0b" strokeWidth={2} />
                    <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="5 5" label="เกณฑ์เตือน" />
                  </LineChart>
                </ResponsiveContainer>
            */}
            <div className="flex h-56 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
              <div className="text-center">
                <TrendingUp className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
                <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                  กราฟแนวโน้มส่วนต่าง
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  (พร้อมใช้งานเมื่อเชื่อมต่อ Recharts)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top discrepancies table */}
        <Card padding="none">
          <CardHeader
            title="สินค้าที่มีส่วนต่างมากที่สุด"
            description="Top 5 สินค้าที่พบส่วนต่างบ่อยในช่วงเวลาที่เลือก"
          />
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
          {/* Chart placeholder - Deposit/withdrawal trend */}
          <Card padding="none">
            <CardHeader
              title="แนวโน้มฝาก-เบิก"
              description="จำนวนการฝากและเบิกรายสัปดาห์"
            />
            <CardContent>
              {/* TODO: Integrate Recharts BarChart here
                  - X axis: weeks / dates
                  - Y axis: count
                  - Series: new deposits (indigo), withdrawals (emerald)
                  Example:
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={weeklyDepositData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="deposits" fill="#6366f1" radius={[4,4,0,0]} />
                      <Bar dataKey="withdrawals" fill="#10b981" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
              */}
              <div className="flex h-56 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
                <div className="text-center">
                  <BarChart3 className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                    กราฟแนวโน้มฝาก-เบิก
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    (พร้อมใช้งานเมื่อเชื่อมต่อ Recharts)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Popular products */}
          <Card padding="none">
            <CardHeader
              title="สินค้ายอดนิยม"
              description="สินค้าที่ลูกค้าฝากบ่อยที่สุด"
            />
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
        value: formatCurrency(financialReport.depositFees),
        icon: Wine,
        lightBg: 'bg-indigo-50 dark:bg-indigo-900/20',
        textColor: 'text-indigo-600 dark:text-indigo-400',
      },
      {
        label: 'เหล้าหมดอายุ (ริบ)',
        value: formatCurrency(financialReport.expiredForfeit),
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

        {/* Chart placeholder - Revenue by month */}
        <Card padding="none">
          <CardHeader
            title="รายได้รายเดือน"
            description="สรุปรายได้แยกตามเดือน"
          />
          <CardContent>
            {/* TODO: Integrate Recharts BarChart here
                - X axis: months
                - Y axis: revenue (THB)
                - Stacked bars: penalties, deposit fees, expired forfeit
                Example:
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={financialReport.revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="penalties" stackId="rev" fill="#ef4444" radius={[0,0,0,0]} />
                    <Bar dataKey="fees" stackId="rev" fill="#6366f1" radius={[0,0,0,0]} />
                    <Bar dataKey="forfeit" stackId="rev" fill="#f59e0b" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
            */}
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
              <div className="text-center">
                <DollarSign className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
                <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                  กราฟรายได้รายเดือน
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  (พร้อมใช้งานเมื่อเชื่อมต่อ Recharts)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly revenue breakdown */}
        <Card padding="none">
          <CardHeader title="รายละเอียดรายเดือน" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    เดือน
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    ยอดรายได้
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
