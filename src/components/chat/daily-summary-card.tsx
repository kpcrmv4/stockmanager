'use client';

import { memo } from 'react';
import { Wine, Package, Warehouse, AlertTriangle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

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
      </div>
    </div>
  );
});
