'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { yesterdayBangkok, dayOfWeekBangkok } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { ClipboardCheck, ClipboardList, CalendarOff } from 'lucide-react';

type BannerState =
  | { type: 'loading' }
  | { type: 'not_counting_day' }
  | { type: 'not_counted'; totalProducts: number }
  | { type: 'counted'; countedItems: number; totalProducts: number }
  | { type: 'no_settings' };

export function StockCountBanner() {
  const { currentStoreId } = useAppStore();
  const [state, setState] = useState<BannerState>({ type: 'loading' });

  const check = useCallback(async () => {
    if (!currentStoreId) return;

    const supabase = createClient();
    const todayDay = dayOfWeekBangkok();
    const businessDate = yesterdayBangkok();

    // 1. Fetch store settings
    const { data: settings } = await supabase
      .from('store_settings')
      .select('notify_days, daily_reminder_enabled')
      .eq('store_id', currentStoreId)
      .single();

    if (!settings) {
      setState({ type: 'no_settings' });
      return;
    }

    const notifyDays: string[] = settings.notify_days || [];

    // Check if today is a counting day
    if (!notifyDays.includes(todayDay)) {
      setState({ type: 'not_counting_day' });
      return;
    }

    // 2. Count total active products
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', currentStoreId)
      .eq('active', true)
      .eq('count_status', 'active');

    // 3. Count manual_counts for business date
    const { count: countedItems } = await supabase
      .from('manual_counts')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', currentStoreId)
      .eq('count_date', businessDate);

    const total = totalProducts ?? 0;
    const counted = countedItems ?? 0;

    if (counted === 0) {
      setState({ type: 'not_counted', totalProducts: total });
    } else {
      setState({ type: 'counted', countedItems: counted, totalProducts: total });
    }
  }, [currentStoreId]);

  useEffect(() => {
    check();
  }, [check]);

  if (state.type === 'loading' || state.type === 'no_settings') {
    return null;
  }

  const businessDate = yesterdayBangkok();

  if (state.type === 'not_counting_day') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800/50">
        <CalendarOff className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            วันนี้ไม่ต้องนับสต๊อก
          </p>
        </div>
      </div>
    );
  }

  if (state.type === 'not_counted') {
    return (
      <a
        href="/stock/daily-check"
        className={cn(
          'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
          'border-amber-200 bg-amber-50 hover:bg-amber-100',
          'dark:border-amber-800 dark:bg-amber-900/20 dark:hover:bg-amber-900/30',
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            ยังไม่ได้นับสต๊อก
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            รอบ {businessDate} — สินค้าที่ต้องนับ {state.totalProducts} รายการ
          </p>
        </div>
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
          นับเลย &rarr;
        </span>
      </a>
    );
  }

  // state.type === 'counted'
  const isComplete = state.countedItems >= state.totalProducts && state.totalProducts > 0;

  return (
    <a
      href="/stock/daily-check"
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
        isComplete
          ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30'
          : 'border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/30',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          isComplete
            ? 'bg-emerald-100 dark:bg-emerald-900/40'
            : 'bg-blue-100 dark:bg-blue-900/40',
        )}
      >
        <ClipboardCheck
          className={cn(
            'h-5 w-5',
            isComplete
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-blue-600 dark:text-blue-400',
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-semibold',
            isComplete
              ? 'text-emerald-800 dark:text-emerald-200'
              : 'text-blue-800 dark:text-blue-200',
          )}
        >
          {isComplete ? 'นับสต๊อกครบแล้ว' : 'กำลังนับสต๊อก'}
        </p>
        <p
          className={cn(
            'text-xs',
            isComplete
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-blue-600 dark:text-blue-400',
          )}
        >
          รอบ {businessDate} — นับแล้ว {state.countedItems}/{state.totalProducts} รายการ
        </p>
      </div>
      <span
        className={cn(
          'text-xs font-medium',
          isComplete
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-blue-700 dark:text-blue-300',
        )}
      >
        ดูรายละเอียด &rarr;
      </span>
    </a>
  );
}
