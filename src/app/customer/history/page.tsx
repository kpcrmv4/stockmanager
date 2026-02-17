'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatThaiDate, formatThaiDateTime, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { History, Package, Wine, ArrowDownCircle, Loader2 } from 'lucide-react';

interface HistoryItem {
  id: string;
  type: 'deposit' | 'withdrawal';
  product_name: string;
  quantity: number;
  status: string;
  created_at: string;
  deposit_code?: string;
  store_name?: string;
}

const withdrawalStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: 'รอดำเนินการ', color: 'text-amber-600 bg-amber-50' },
  approved: { label: 'อนุมัติแล้ว', color: 'text-green-600 bg-green-50' },
  completed: { label: 'สำเร็จ', color: 'text-green-600 bg-green-50' },
  rejected: { label: 'ปฏิเสธ', color: 'text-red-600 bg-red-50' },
};

export default function CustomerHistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsLoading(false);
      return;
    }

    // Load deposits
    const { data: deposits } = await supabase
      .from('deposits')
      .select('id, deposit_code, product_name, quantity, status, created_at, store:stores(store_name)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Load profile for line_user_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('line_user_id')
      .eq('id', user.id)
      .single();

    let withdrawals: Array<Record<string, unknown>> = [];
    if (profile?.line_user_id) {
      const { data } = await supabase
        .from('withdrawals')
        .select('id, product_name, requested_qty, status, created_at')
        .eq('line_user_id', profile.line_user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) withdrawals = data;
    }

    const items: HistoryItem[] = [
      ...(deposits || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        type: 'deposit' as const,
        product_name: d.product_name as string,
        quantity: d.quantity as number,
        status: d.status as string,
        created_at: d.created_at as string,
        deposit_code: d.deposit_code as string,
        store_name: (d.store as { store_name: string })?.store_name,
      })),
      ...withdrawals.map((w) => ({
        id: w.id as string,
        type: 'withdrawal' as const,
        product_name: w.product_name as string,
        quantity: w.requested_qty as number,
        status: w.status as string,
        created_at: w.created_at as string,
      })),
    ];

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setHistory(items);
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h2 className="text-lg font-bold text-gray-900">ประวัติธุรกรรม</h2>
      <p className="mt-0.5 text-sm text-gray-500">รายการฝากและเบิกเหล้าทั้งหมด</p>

      {history.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-2 text-gray-400">
          <History className="h-12 w-12" />
          <p className="text-sm">ยังไม่มีประวัติ</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {history.map((item) => {
            const wStatus = withdrawalStatusMap[item.status];

            return (
              <div
                key={`${item.type}-${item.id}`}
                className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm"
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    item.type === 'deposit' ? 'bg-green-100' : 'bg-blue-100'
                  )}
                >
                  {item.type === 'deposit' ? (
                    <Wine className="h-4 w-4 text-[#06C755]" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4 text-blue-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.product_name}
                    </p>
                    {item.type === 'deposit' ? (
                      <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        ฝาก
                      </span>
                    ) : wStatus ? (
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', wStatus.color)}>
                        {wStatus.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    จำนวน {formatNumber(item.quantity)}
                    {item.deposit_code && ` | ${item.deposit_code}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {formatThaiDateTime(item.created_at)}
                    {item.store_name && ` | ${item.store_name}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
