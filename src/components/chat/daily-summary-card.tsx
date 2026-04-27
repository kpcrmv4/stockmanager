'use client';

import { memo } from 'react';
import { Wine, Package, Warehouse, AlertTriangle, BarChart3, Repeat, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export interface BorrowReturnItem {
  borrow_id: string;
  borrow_code?: string | null;
  lender_store_name: string;  // ที่ต้องคืน
  items_preview: string;      // เช่น "Johnnie Walker x2, Vodka x1"
  status: 'completed' | 'pos_adjusting' | 'return_pending';
}

export interface DailySummaryData {
  type: 'daily_summary';
  date_label: string;
  new_deposits: number;
  withdrawals_today: number;
  active_deposits: number;
  expiring_soon: number;
  expiring_days: number;
  pending_explanations?: number;
  active_borrows?: number;
  /**
   * รายการยืมที่ "สาขานี้ต้องคืน" ให้สาขาผู้ให้ยืม
   * (เฉพาะ borrows ที่ to_store_id = สาขานี้ และ status ยังไม่ returned)
   */
  borrow_returns?: BorrowReturnItem[];
}

interface DailySummaryCardProps {
  data: DailySummaryData;
  time: string;
}

const STAT_CARDS = [
  {
    key: 'new_deposits' as const,
    label: 'ฝากใหม่วันนี้',
    icon: Wine,
    gradient: 'from-emerald-500 to-emerald-600',
    bgLight: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconBg: 'bg-emerald-500',
    textColor: 'text-emerald-700 dark:text-emerald-400',
    numberColor: 'text-emerald-600 dark:text-emerald-300',
  },
  {
    key: 'withdrawals_today' as const,
    label: 'เบิกวันนี้',
    icon: Package,
    gradient: 'from-blue-500 to-blue-600',
    bgLight: 'bg-blue-50 dark:bg-blue-900/20',
    iconBg: 'bg-blue-500',
    textColor: 'text-blue-700 dark:text-blue-400',
    numberColor: 'text-blue-600 dark:text-blue-300',
  },
  {
    key: 'active_deposits' as const,
    label: 'ฝากในร้านทั้งหมด',
    icon: Warehouse,
    gradient: 'from-violet-500 to-violet-600',
    bgLight: 'bg-violet-50 dark:bg-violet-900/20',
    iconBg: 'bg-violet-500',
    textColor: 'text-violet-700 dark:text-violet-400',
    numberColor: 'text-violet-600 dark:text-violet-300',
  },
  {
    key: 'expiring_soon' as const,
    label: 'ใกล้หมดอายุ',
    icon: AlertTriangle,
    gradient: 'from-amber-500 to-orange-500',
    bgLight: 'bg-amber-50 dark:bg-amber-900/20',
    iconBg: 'bg-amber-500',
    textColor: 'text-amber-700 dark:text-amber-400',
    numberColor: 'text-amber-600 dark:text-amber-300',
  },
];

export const DailySummaryCard = memo(function DailySummaryCard({ data, time }: DailySummaryCardProps) {
  return (
    <div className="mx-auto my-2 w-full max-w-[340px]">
      <div className="overflow-hidden rounded-2xl shadow-lg">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <BarChart3 className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">สรุปประจำวัน</h3>
              <p className="text-[11px] text-white/70">{data.date_label}</p>
            </div>
            <span className="ml-auto text-[10px] text-white/50">{time}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-700">
          {STAT_CARDS.map((card) => {
            const Icon = card.icon;
            const value = data[card.key];
            const isWarning = card.key === 'expiring_soon' && value > 0;
            const sublabel = card.key === 'expiring_soon' ? `>${data.expiring_days} วัน` : null;

            return (
              <div
                key={card.key}
                className={cn(
                  'flex flex-col items-center justify-center px-3 py-4',
                  'bg-white dark:bg-gray-800',
                  isWarning && 'bg-amber-50/50 dark:bg-amber-900/10'
                )}
              >
                <div className={cn('mb-2 flex h-9 w-9 items-center justify-center rounded-xl', card.iconBg)}>
                  <Icon className="h-4.5 w-4.5 text-white" />
                </div>
                <span className={cn(
                  'text-2xl font-extrabold tabular-nums leading-none',
                  isWarning ? 'text-red-500' : card.numberColor
                )}>
                  {value}
                </span>
                <span className={cn('mt-1 text-[11px] font-medium', card.textColor)}>
                  {card.label}
                </span>
                {sublabel && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{sublabel}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer — extra info */}
        {((data.pending_explanations ?? 0) > 0 || (data.active_borrows ?? 0) > 0) && (
          <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/50">
            {(data.pending_explanations ?? 0) > 0 && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                ⚠️ สต๊อกรอชี้แจง {data.pending_explanations}
              </span>
            )}
            {(data.active_borrows ?? 0) > 0 && (
              <span className="text-[11px] text-violet-600 dark:text-violet-400">
                🔄 ยืมสินค้า {data.active_borrows}
              </span>
            )}
          </div>
        )}

        {/* Borrow returns section — items the current store must return */}
        {data.borrow_returns && data.borrow_returns.length > 0 && (
          <div className="border-t-2 border-dashed border-violet-200 bg-gradient-to-br from-violet-50/60 to-purple-50/60 px-4 py-3 dark:border-violet-800 dark:from-violet-900/15 dark:to-purple-900/15">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500">
                <Repeat className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-xs font-bold text-violet-800 dark:text-violet-300">
                ต้องคืน {data.borrow_returns.length} รายการ
              </span>
              <Link
                href="/borrow"
                className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
              >
                ดูทั้งหมด
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="space-y-1.5">
              {data.borrow_returns.slice(0, 5).map((b) => (
                <li
                  key={b.borrow_id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] dark:bg-gray-800/40',
                    b.status === 'return_pending' &&
                      'ring-1 ring-amber-300 dark:ring-amber-700',
                  )}
                >
                  <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-800 dark:text-gray-200">
                      {b.items_preview}
                    </p>
                    <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                      คืนให้ {b.lender_store_name}
                      {b.borrow_code ? ` · ${b.borrow_code}` : ''}
                    </p>
                  </div>
                  {b.status === 'return_pending' && (
                    <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      รอรับคืน
                    </span>
                  )}
                </li>
              ))}
              {data.borrow_returns.length > 5 && (
                <li className="text-center text-[10px] text-violet-600/70 dark:text-violet-400/70">
                  +{data.borrow_returns.length - 5} รายการอื่น
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
});
