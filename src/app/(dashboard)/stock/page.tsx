'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Badge, Card, CardHeader, CardContent, EmptyState, toast } from '@/components/ui';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
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
  Clock,
  Loader2,
  RefreshCw,
  Inbox,
} from 'lucide-react';

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
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดข้อมูลภาพรวมสต๊อกได้',
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summaryCards = [
    {
      label: 'สินค้าทั้งหมด',
      value: formatNumber(summary.totalProducts),
      icon: Package,
      lightBg: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'นับสต๊อกล่าสุด',
      value: summary.lastCheckDate
        ? formatThaiDate(summary.lastCheckDate)
        : 'ยังไม่เคยนับ',
      icon: CalendarCheck,
      lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      isDate: true,
    },
    {
      label: 'รอชี้แจง',
      value: formatNumber(summary.pendingExplanations),
      icon: AlertTriangle,
      lightBg: 'bg-amber-50 dark:bg-amber-900/20',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'รออนุมัติ',
      value: formatNumber(summary.pendingApprovals),
      icon: CheckCircle2,
      lightBg: 'bg-violet-50 dark:bg-violet-900/20',
      textColor: 'text-violet-600 dark:text-violet-400',
    },
  ];

  const quickActions = [
    {
      label: 'นับสต๊อก',
      description: 'นับสต๊อกประจำวัน',
      icon: ScanLine,
      href: '/stock/daily-check',
      color: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
    },
    {
      label: 'ดูผลเปรียบเทียบ',
      description: 'POS vs นับจริง',
      icon: BarChart3,
      href: '/stock/comparison',
      color: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800',
    },
    {
      label: 'ชี้แจงส่วนต่าง',
      description: 'อธิบายสินค้าที่ขาด/เกิน',
      icon: FileText,
      href: '/stock/explanation',
      color: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800',
    },
    {
      label: 'อนุมัติ',
      description: 'ตรวจสอบและอนุมัติ',
      icon: ClipboardList,
      href: '/stock/approval',
      color: 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800',
    },
  ];

  function getCheckStatusBadge(status: string) {
    switch (status) {
      case 'approved':
        return { label: 'อนุมัติแล้ว', variant: 'success' as const };
      case 'pending':
        return { label: 'รอชี้แจง', variant: 'warning' as const };
      case 'in_progress':
        return { label: 'กำลังดำเนินการ', variant: 'info' as const };
      default:
        return { label: status, variant: 'default' as const };
    }
  }

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
        title="ยังไม่มีสาขาในระบบ"
        description="กรุณาสร้างสาขาก่อนเพื่อเริ่มใช้งานระบบนับสต๊อก"
        action={
          <Button
            size="sm"
            onClick={() => { window.location.href = '/settings'; }}
          >
            ไปหน้าตั้งค่า
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            ระบบนับสต๊อก
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ภาพรวมการนับสต๊อกและตรวจสอบส่วนต่าง
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/stock/products"
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 active:bg-cyan-800"
          >
            <Package className="h-4 w-4" />
            จัดการสินค้า
          </a>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={fetchData}
          >
            รีเฟรช
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

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <a
              key={action.label}
              href={action.href}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl px-3 py-5 text-white transition-colors',
                action.color
              )}
            >
              <ActionIcon className="h-7 w-7" />
              <span className="text-sm font-medium">{action.label}</span>
              <span className="text-center text-[11px] opacity-80">
                {action.description}
              </span>
            </a>
          );
        })}
      </div>

      {/* Recent Stock Checks */}
      <Card padding="none">
        <CardHeader
          title="การนับสต๊อกล่าสุด"
          action={
            <a
              href="/stock/comparison"
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              ดูทั้งหมด
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          }
        />
        {recentChecks.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="ยังไม่มีข้อมูลการนับสต๊อก"
            description="เริ่มนับสต๊อกประจำวันเพื่อดูผลเปรียบเทียบที่นี่"
            action={
              <Button
                size="sm"
                icon={<ScanLine className="h-4 w-4" />}
                onClick={() => {
                  window.location.href = '/stock/daily-check';
                }}
              >
                เริ่มนับสต๊อก
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
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatThaiDate(check.comp_date)}
                    </p>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>{check.totalItems} รายการ</span>
                      <span className="text-emerald-500">
                        ตรง {check.matchCount}
                      </span>
                      {check.discrepancyCount > 0 && (
                        <span className="text-red-500">
                          ต่าง {check.discrepancyCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                </a>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
