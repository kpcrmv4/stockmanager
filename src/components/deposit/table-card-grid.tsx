'use client';

import { useMemo } from 'react';
import { Wine } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequestType = 'deposit_request' | 'deposit' | 'withdrawal';

export interface TableCardItem {
  id: string;
  type: RequestType;
  tableNumber: string | null;
  customerName: string;
  customerPhone?: string | null;
  productName: string | null;
  quantity: number | null;
  status: string;
  notes: string | null;
  photoUrl: string | null;
  createdAt: string;
  depositCode?: string;
  depositId?: string;
  storeId: string;
  rawData: Record<string, unknown>;
}

export interface TableGroup {
  tableNumber: string;
  items: TableCardItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns time difference values for relative time display.
 */
export function timeAgoParts(dateStr: string): { type: 'justNow' | 'minutes' | 'hours' | 'days'; count: number } {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return { type: 'justNow', count: 0 };

  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return { type: 'justNow', count: 0 };
  if (diffMin < 60) return { type: 'minutes', count: diffMin };
  if (diffHr < 24) return { type: 'hours', count: diffHr };
  return { type: 'days', count: diffDay };
}

/**
 * Returns a human-readable Thai relative time string (legacy compat).
 */
export function timeAgo(dateStr: string): string {
  const parts = timeAgoParts(dateStr);
  switch (parts.type) {
    case 'justNow': return 'เมื่อสักครู่';
    case 'minutes': return `${parts.count} นาทีที่แล้ว`;
    case 'hours': return `${parts.count} ชั่วโมงที่แล้ว`;
    case 'days': return `${parts.count} วันที่แล้ว`;
  }
}

/**
 * Group items by their tableNumber and sort groups so numbered tables come
 * first (ascending numerically) and the "unspecified" group comes last.
 */
export function groupByTable(items: TableCardItem[], unspecifiedLabel = 'No table'): TableGroup[] {
  const map = new Map<string, TableCardItem[]>();

  for (const item of items) {
    const key = item.tableNumber ?? unspecifiedLabel;
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  const groups: TableGroup[] = Array.from(map.entries()).map(
    ([tableNumber, groupItems]) => ({ tableNumber, items: groupItems }),
  );

  groups.sort((a, b) => {
    const aIsUnspecified = a.tableNumber === unspecifiedLabel;
    const bIsUnspecified = b.tableNumber === unspecifiedLabel;

    if (aIsUnspecified && !bIsUnspecified) return 1;
    if (!aIsUnspecified && bIsUnspecified) return -1;
    if (aIsUnspecified && bIsUnspecified) return 0;

    const aNum = Number(a.tableNumber);
    const bNum = Number(b.tableNumber);

    const aIsNum = !Number.isNaN(aNum);
    const bIsNum = !Number.isNaN(bNum);

    if (aIsNum && bIsNum) return aNum - bNum;
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;

    return a.tableNumber.localeCompare(b.tableNumber);
  });

  return groups;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function isRecent(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 5 * 60_000;
}

function TableCardTile({
  group,
  onItemClick,
  t,
}: {
  group: TableGroup;
  onItemClick: (item: TableCardItem) => void;
  t: ReturnType<typeof useTranslations<'deposit'>>;
}) {
  const { tableNumber, items } = group;
  const unspecifiedTable = t('tableCard.unspecifiedTable');
  const isUnspecified = tableNumber === unspecifiedTable;

  // Counts
  const depositCount = items.filter(
    (i) => i.type === 'deposit_request' || i.type === 'deposit',
  ).length;
  const withdrawalCount = items.filter((i) => i.type === 'withdrawal').length;

  // Determine border colour from the dominant type
  const hasWithdrawalOnly = depositCount === 0 && withdrawalCount > 0;

  // Customer label
  const uniqueCustomers = Array.from(
    new Set(items.map((i) => i.customerName)),
  );
  const customerLabel =
    uniqueCustomers.length > 1
      ? t('tableCard.andMore', { name: uniqueCustomers[0], count: uniqueCustomers.length - 1 })
      : uniqueCustomers[0];

  // Check if any item was created recently (< 5 min)
  const hasRecentItem = items.some((i) => isRecent(i.createdAt));

  // Most recent createdAt for display
  const latestCreatedAt = items.reduce((latest, i) =>
    new Date(i.createdAt) > new Date(latest.createdAt) ? i : latest,
  ).createdAt;

  // Relative time with i18n
  const timeParts = timeAgoParts(latestCreatedAt);
  const timeLabel = timeParts.type === 'justNow'
    ? t('tableCard.justNow')
    : timeParts.type === 'minutes'
      ? t('tableCard.minutesAgo', { count: timeParts.count })
      : timeParts.type === 'hours'
        ? t('tableCard.hoursAgo', { count: timeParts.count })
        : t('tableCard.daysAgo', { count: timeParts.count });

  return (
    <button
      type="button"
      onClick={() => onItemClick(items[0])}
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl bg-white p-4',
        'shadow-[0_10px_40px_rgba(0,0,0,0.1)]',
        'transition-transform active:scale-[0.97]',
        'text-left w-full cursor-pointer',
        'dark:bg-gray-800',
      )}
    >
      {/* Circle with table number */}
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border-[3px] text-lg font-bold',
          isUnspecified
            ? 'border-gray-300 text-gray-400'
            : hasWithdrawalOnly
              ? 'border-red-500 text-red-600'
              : 'border-emerald-500 text-emerald-700',
          hasRecentItem && !isUnspecified && 'animate-pulse',
        )}
      >
        {isUnspecified ? '?' : tableNumber}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        {depositCount > 0 && (
          <Badge variant="success" size="sm">
            {depositCount > 1 ? t('tableCard.depositBadgeCount', { count: depositCount }) : t('tableCard.depositBadge')}
          </Badge>
        )}
        {withdrawalCount > 0 && (
          <Badge variant="danger" size="sm">
            {withdrawalCount > 1 ? t('tableCard.withdrawBadgeCount', { count: withdrawalCount }) : t('tableCard.withdrawBadge')}
          </Badge>
        )}
      </div>

      {/* Customer name + time */}
      <div className="w-full text-center">
        <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
          {customerLabel}
        </p>
        <p className="mt-0.5 text-[10px] text-gray-400">
          {timeLabel}
        </p>
      </div>
    </button>
  );
}

function SkeletonTile() {
  return (
    <div className="flex animate-pulse flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.1)] dark:bg-gray-800">
      <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="h-4 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="flex w-full flex-col items-center gap-1">
        <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-2.5 w-14 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TableCardGridProps {
  items: TableCardItem[];
  onItemClick: (item: TableCardItem) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function TableCardGrid({
  items,
  onItemClick,
  isLoading = false,
  emptyMessage,
}: TableCardGridProps) {
  const t = useTranslations('deposit');
  const resolvedEmptyMessage = emptyMessage ?? t('tableCard.noItems');
  const unspecifiedLabel = t('tableCard.unspecifiedTable');
  const groups = useMemo(() => groupByTable(items, unspecifiedLabel), [items, unspecifiedLabel]);

  // Loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
        <Wine className="h-12 w-12 stroke-[1.5]" />
        <p className="text-sm">{resolvedEmptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {groups.map((group) => (
        <TableCardTile
          key={group.tableNumber}
          group={group}
          onItemClick={onItemClick}
          t={t}
        />
      ))}
    </div>
  );
}

export type { TableCardGridProps };
