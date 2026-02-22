'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils/cn';
import { AlertTriangle, ArrowRight, Truck } from 'lucide-react';

export function ExpiredDepositsBanner() {
  const { currentStoreId } = useAppStore();
  const [count, setCount] = useState<number | null>(null);

  const check = useCallback(async () => {
    if (!currentStoreId) return;

    const supabase = createClient();
    const { count: expiredCount } = await supabase
      .from('deposits')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', currentStoreId)
      .eq('status', 'expired');

    setCount(expiredCount ?? 0);
  }, [currentStoreId]);

  useEffect(() => {
    check();
  }, [check]);

  if (count === null || count === 0) return null;

  return (
    <a
      href="/transfer"
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
        'border-red-200 bg-red-50 hover:bg-red-100',
        'dark:border-red-800 dark:bg-red-900/20 dark:hover:bg-red-900/30',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
          เหล้าฝากหมดอายุ {count} รายการ
        </p>
        <p className="text-xs text-red-600 dark:text-red-400">
          <Truck className="mr-0.5 inline h-3 w-3" />
          กดเพื่อส่งโอนไปคลังกลาง
        </p>
      </div>
      <span className="flex items-center text-xs font-medium text-red-700 dark:text-red-300">
        จัดการ <ArrowRight className="ml-0.5 h-3.5 w-3.5" />
      </span>
    </a>
  );
}
