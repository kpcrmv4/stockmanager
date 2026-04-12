'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Wine,
  Package,
  ClipboardCheck,
  Repeat,
  Truck,
  Clock,
  CheckCircle,
  Hand,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useChatStore } from '@/stores/chat-store';
import { ActionCardMessage } from './action-card-message';
import type { ChatMessage } from '@/types/chat';

interface TransactionBoardProps {
  roomId: string;
  storeId: string | null;
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
}

type FilterStatus = 'all' | 'pending' | 'pending_bar' | 'claimed' | 'completed';

/**
 * Normalize status across ActionCard and Transfer metadata into
 * unified categories: pending / claimed / completed
 */
function getNormalizedStatus(meta: Record<string, unknown>): 'pending' | 'pending_bar' | 'claimed' | 'completed' | 'other' {
  const status = meta.status as string;
  if (status === 'pending' || status === 'pending_approval') return 'pending';
  if (status === 'pending_bar') return 'pending_bar';
  if (status === 'claimed') return 'claimed';
  if (status === 'completed' || status === 'received') {
    const summary = meta.summary as Record<string, unknown> | undefined;
    if (summary?.rejected) return 'other';
    return 'completed';
  }
  if (status === 'rejected' || status === 'expired' || status === 'cancelled' || status === 'partial') return 'other';
  return 'other';
}
type FilterType = 'all' | 'deposit_claim' | 'withdrawal_claim' | 'stock_explain' | 'borrow_approve' | 'transfer_receive';

const TYPE_CONFIG: Record<string, { icon: typeof Wine; color: string; label: string; bgClass: string }> = {
  deposit_claim: { icon: Wine, color: 'emerald', label: 'ฝากเหล้า', bgClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  withdrawal_claim: { icon: Package, color: 'blue', label: 'เบิกเหล้า', bgClass: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  stock_explain: { icon: ClipboardCheck, color: 'amber', label: 'สต๊อก', bgClass: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  borrow_approve: { icon: Repeat, color: 'violet', label: 'ยืมสินค้า', bgClass: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400' },
  transfer_receive: { icon: Truck, color: 'orange', label: 'โอนสต๊อก', bgClass: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' },
};

const STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  pending: { icon: Clock, label: 'รอรับ', color: 'text-amber-500' },
  claimed: { icon: Hand, label: 'กำลังทำ', color: 'text-blue-500' },
  completed: { icon: CheckCircle, label: 'เสร็จแล้ว', color: 'text-emerald-500' },
  expired: { icon: AlertTriangle, label: 'หมดเวลา', color: 'text-red-500' },
};

export function TransactionBoard({ roomId, storeId, currentUserId, currentUserName, currentUserRole }: TransactionBoardProps) {
  const messages = useChatStore((s) => s.messages);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupStatusFilter, setGroupStatusFilter] = useState<Record<string, string>>({}); // type → status filter
  const collapsedInitRef = useRef(false);

  // Extract action card messages only (works for both ActionCard and Transfer metadata)
  const actionCards = useMemo(() => {
    return messages.filter((msg) => {
      if (msg.type !== 'action_card' || !msg.metadata) return false;
      const meta = msg.metadata as unknown as Record<string, unknown>;
      return !!meta.action_type;
    });
  }, [messages]);

  // Apply filters (using normalized status for cross-type compatibility)
  const filteredCards = useMemo(() => {
    return actionCards.filter((msg) => {
      const meta = msg.metadata as unknown as Record<string, unknown>;
      if (filterType !== 'all' && meta.action_type !== filterType) return false;
      if (filterStatus !== 'all') {
        const normalized = getNormalizedStatus(meta);
        if (filterStatus === 'pending') {
          // "รอรับ" includes both pending and pending_bar
          if (normalized !== 'pending' && normalized !== 'pending_bar') return false;
        } else if (filterStatus === 'pending_bar') {
          if (normalized !== 'pending_bar') return false;
        } else {
          if (normalized !== filterStatus) return false;
        }
      }
      return true;
    });
  }, [actionCards, filterStatus, filterType]);

  // Group by action_type
  const grouped = useMemo(() => {
    const groups = new Map<string, ChatMessage[]>();
    for (const msg of filteredCards) {
      const meta = msg.metadata as unknown as Record<string, unknown>;
      const key = meta.action_type as string;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(msg);
    }
    // Fixed order based on TYPE_CONFIG keys — no re-sorting when status changes
    const typeOrder = Object.keys(TYPE_CONFIG);
    return Array.from(groups.entries()).sort((a, b) => {
      const aIdx = typeOrder.indexOf(a[0]);
      const bIdx = typeOrder.indexOf(b[0]);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  }, [filteredCards]);

  // Default collapse all groups except those with active items (pending/claimed)
  useEffect(() => {
    if (collapsedInitRef.current || grouped.length === 0) return;
    collapsedInitRef.current = true;

    const toCollapse = new Set<string>();
    for (const [type, msgs] of grouped) {
      const hasActive = msgs.some((m) => {
        const n = getNormalizedStatus(m.metadata as unknown as Record<string, unknown>);
        return n === 'pending' || n === 'pending_bar' || n === 'claimed';
      });
      if (!hasActive) toCollapse.add(type);
    }
    if (toCollapse.size > 0) setCollapsedGroups(toCollapse);
  }, [grouped]);

  // Stats (normalized across all card types)
  const stats = useMemo(() => {
    const s = { pending: 0, pending_bar: 0, claimed: 0, completed: 0, total: 0 };
    for (const msg of actionCards) {
      const normalized = getNormalizedStatus(msg.metadata as unknown as Record<string, unknown>);
      s.total++;
      if (normalized === 'pending') s.pending++;
      else if (normalized === 'pending_bar') s.pending_bar++;
      else if (normalized === 'claimed') s.claimed++;
      else if (normalized === 'completed') s.completed++;
    }
    return s;
  }, [actionCards]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F0EFF5] dark:bg-gray-900">
      {/* Stats bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
        <StatBadge icon={Clock} label="รอรับ" count={stats.pending + stats.pending_bar} color="amber" active={filterStatus === 'pending'} onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')} />
        <StatBadge icon={Hand} label="กำลังทำ" count={stats.claimed} color="blue" active={filterStatus === 'claimed'} onClick={() => setFilterStatus(filterStatus === 'claimed' ? 'all' : 'claimed')} />
        <StatBadge icon={CheckCircle} label="เสร็จ" count={stats.completed} color="emerald" active={filterStatus === 'completed'} onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')} />
      </div>

      {/* Type filter chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
        <FilterChip label="ทั้งหมด" active={filterType === 'all'} onClick={() => setFilterType('all')} />
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
          <FilterChip
            key={key}
            label={cfg.label}
            icon={cfg.icon}
            active={filterType === key}
            onClick={() => setFilterType(filterType === key ? 'all' : key as FilterType)}
          />
        ))}
      </div>

      {/* Grouped action cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {grouped.length === 0 ? (
          <div className="mt-12 text-center">
            <Filter className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {filterStatus !== 'all' || filterType !== 'all'
                ? 'ไม่พบรายการตามตัวกรอง'
                : 'ยังไม่มีรายการงาน'}
            </p>
          </div>
        ) : (
          grouped.map(([type, msgs]) => {
            const config = TYPE_CONFIG[type] || TYPE_CONFIG.deposit_claim;
            const Icon = config.icon;
            const isCollapsed = collapsedGroups.has(type);
            const pendingCount = msgs.filter((m) => {
              const n = getNormalizedStatus(m.metadata as unknown as Record<string, unknown>);
              return n === 'pending';
            }).length;
            const pendingBarCount = msgs.filter((m) => getNormalizedStatus(m.metadata as unknown as Record<string, unknown>) === 'pending_bar').length;
            const claimedCount = msgs.filter((m) => getNormalizedStatus(m.metadata as unknown as Record<string, unknown>) === 'claimed').length;

            const completedCount = msgs.filter((m) => getNormalizedStatus(m.metadata as unknown as Record<string, unknown>) === 'completed').length;
            const activeGroupFilter = groupStatusFilter[type] || 'all';

            // Filter msgs within group by group-level status filter
            const displayMsgs = activeGroupFilter === 'all'
              ? msgs
              : msgs.filter((m) => {
                  const n = getNormalizedStatus(m.metadata as unknown as Record<string, unknown>);
                  return n === activeGroupFilter;
                });

            const handleChipClick = (status: string, e: React.MouseEvent) => {
              e.stopPropagation();
              setGroupStatusFilter((prev) => ({
                ...prev,
                [type]: prev[type] === status ? 'all' : status,
              }));
              // auto-expand when filtering
              if (isCollapsed) {
                setCollapsedGroups((prev) => {
                  const next = new Set(prev);
                  next.delete(type);
                  return next;
                });
              }
            };

            return (
              <div key={type} className="mb-3">
                {/* Group header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(type)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleGroup(type); }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 shadow-sm transition-colors',
                    'bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700',
                    isCollapsed ? 'rounded-xl' : 'rounded-t-xl'
                  )}
                >
                  <Icon className={cn('h-4 w-4', `text-${config.color}-500`)} />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {config.label}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {msgs.length} รายการ
                  </span>
                  {pendingCount > 0 && (
                    <span
                      role="button"
                      onClick={(e) => handleChipClick('pending', e)}
                      className={cn(
                        'cursor-pointer rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-all',
                        activeGroupFilter === 'pending'
                          ? 'bg-amber-500 text-white ring-1 ring-amber-600'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
                      )}
                    >
                      รอ {pendingCount}
                    </span>
                  )}
                  {pendingBarCount > 0 && (
                    <span
                      role="button"
                      onClick={(e) => handleChipClick('pending_bar', e)}
                      className={cn(
                        'cursor-pointer rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-all',
                        activeGroupFilter === 'pending_bar'
                          ? 'bg-orange-500 text-white ring-1 ring-orange-600'
                          : 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50'
                      )}
                    >
                      รอBar {pendingBarCount}
                    </span>
                  )}
                  {claimedCount > 0 && (
                    <span
                      role="button"
                      onClick={(e) => handleChipClick('claimed', e)}
                      className={cn(
                        'cursor-pointer rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-all',
                        activeGroupFilter === 'claimed'
                          ? 'bg-blue-500 text-white ring-1 ring-blue-600'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
                      )}
                    >
                      ทำ {claimedCount}
                    </span>
                  )}
                  {completedCount > 0 && (
                    <span
                      role="button"
                      onClick={(e) => handleChipClick('completed', e)}
                      className={cn(
                        'cursor-pointer rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-all',
                        activeGroupFilter === 'completed'
                          ? 'bg-emerald-500 text-white ring-1 ring-emerald-600'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50'
                      )}
                    >
                      เสร็จ {completedCount}
                    </span>
                  )}
                  <span className="ml-auto">
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    )}
                  </span>
                </div>

                {/* Cards list */}
                {!isCollapsed && (
                  <div className="space-y-1 rounded-b-xl bg-white/50 px-1 pb-2 pt-1 dark:bg-gray-800/50">
                    {displayMsgs.length === 0 ? (
                      <p className="py-3 text-center text-xs text-gray-400 dark:text-gray-500">
                        ไม่มีรายการในตัวกรองนี้
                      </p>
                    ) : (
                      displayMsgs.map((msg) => (
                        <ActionCardMessage
                          key={msg.id}
                          message={msg}
                          currentUserId={currentUserId}
                          currentUserName={currentUserName}
                          currentUserRole={currentUserRole}
                          roomId={roomId}
                          storeId={storeId}
                          onStatusChange={() => {
                            setFilterStatus('all');
                            setGroupStatusFilter({});
                          }}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ==========================================
// Sub-components
// ==========================================

function StatBadge({
  icon: Icon,
  label,
  count,
  color,
  active,
  onClick,
}: {
  icon: typeof Clock;
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
        active
          ? `bg-${color}-100 text-${color}-700 ring-1 ring-${color}-300 dark:bg-${color}-900/30 dark:text-${color}-400 dark:ring-${color}-700`
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', active ? `text-${color}-500` : 'text-gray-400')} />
      <span>{label}</span>
      <span className={cn(
        'min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold',
        count > 0
          ? `bg-${color}-500 text-white`
          : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
      )}>
        {count}
      </span>
    </button>
  );
}

function FilterChip({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon?: typeof Wine;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all',
        active
          ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-700'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}
