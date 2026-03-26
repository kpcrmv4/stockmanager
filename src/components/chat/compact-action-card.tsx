'use client';

import { memo } from 'react';
import {
  Wine,
  Package,
  ClipboardCheck,
  Repeat,
  Truck,
  Clock,
  Hand,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useChatStore } from '@/stores/chat-store';
import type { ChatMessage, ActionCardMetadata } from '@/types/chat';
import type { TransferCardMetadata } from '@/types/transfer-chat';

interface CompactActionCardProps {
  message: ChatMessage;
}

const TYPE_CONFIG: Record<string, { icon: typeof Wine; color: string; label: string }> = {
  deposit_claim: { icon: Wine, color: 'emerald', label: 'ฝากเหล้า' },
  withdrawal_claim: { icon: Package, color: 'blue', label: 'เบิกเหล้า' },
  stock_explain: { icon: ClipboardCheck, color: 'amber', label: 'สต๊อกไม่ตรง' },
  borrow_approve: { icon: Repeat, color: 'violet', label: 'ยืมสินค้า' },
  transfer_receive: { icon: Truck, color: 'orange', label: 'โอนสต๊อก' },
  generic: { icon: ClipboardCheck, color: 'gray', label: 'งาน' },
};

const STATUS_ICON: Record<string, { icon: typeof Clock; className: string; label: string }> = {
  // ActionCardMetadata statuses
  pending: { icon: Clock, className: 'text-amber-500', label: 'รอรับ' },
  pending_bar: { icon: Clock, className: 'text-orange-500', label: 'รอBar' },
  claimed: { icon: Hand, className: 'text-blue-500', label: 'กำลังทำ' },
  completed: { icon: CheckCircle, className: 'text-emerald-500', label: 'เสร็จ' },
  expired: { icon: AlertTriangle, className: 'text-red-500', label: 'หมดเวลา' },
  // TransferCardMetadata statuses
  received: { icon: CheckCircle, className: 'text-emerald-500', label: 'รับแล้ว' },
  rejected: { icon: XCircle, className: 'text-red-500', label: 'ปฏิเสธ' },
  partial: { icon: AlertTriangle, className: 'text-amber-500', label: 'รับบางส่วน' },
};

/**
 * Extract display info from either ActionCardMetadata or TransferCardMetadata.
 */
function extractCardInfo(meta: Record<string, unknown>) {
  const actionType = (meta.action_type as string) || 'generic';
  const status = (meta.status as string) || 'pending';
  const priority = (meta.priority as string) || 'normal';

  // Transfer card
  if (actionType === 'transfer_receive') {
    const t = meta as unknown as TransferCardMetadata;
    const summaryParts: string[] = [];
    if (t.transfer_code) summaryParts.push(`#${t.transfer_code}`);
    if (t.from_store_name) summaryParts.push(`จาก ${t.from_store_name}`);
    if (t.total_items) summaryParts.push(`${t.total_items} รายการ`);
    return {
      actionType,
      status,
      priority,
      summaryText: summaryParts.join(' · ') || 'โอนสต๊อก',
      assigneeName: t.received_by_name || null,
      isAssigned: status === 'received',
    };
  }

  // Regular action card
  const a = meta as unknown as ActionCardMetadata;
  const summaryParts: string[] = [];
  if (a.reference_id) summaryParts.push(`#${a.reference_id.slice(-8)}`);
  if (a.summary?.customer) summaryParts.push(a.summary.customer);
  if (a.summary?.items) summaryParts.push(a.summary.items);
  return {
    actionType,
    status,
    priority,
    summaryText: summaryParts.join(' · ') || '',
    assigneeName: a.claimed_by_name || null,
    isAssigned: status === 'claimed',
  };
}

/**
 * Compact action card shown in chat tab — just a single-line notification.
 * Tap to switch to "รายการงาน" tab to see full card.
 */
export const CompactActionCard = memo(function CompactActionCard({ message }: CompactActionCardProps) {
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const meta = message.metadata as Record<string, unknown> | null;

  if (!meta || !meta.action_type) return null;

  const info = extractCardInfo(meta);
  const config = TYPE_CONFIG[info.actionType] || TYPE_CONFIG.generic;
  const Icon = config.icon;
  const statusInfo = STATUS_ICON[info.status] || STATUS_ICON.pending;
  const StatusIcon = statusInfo.icon;

  const time = new Date(message.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isUrgent = info.priority === 'urgent';

  return (
    <button
      onClick={() => setActiveTab('tasks')}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-all active:scale-[0.98]',
        'border shadow-sm',
        isUrgent
          ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
      )}
    >
      {/* Type icon */}
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        `bg-${config.color}-100 dark:bg-${config.color}-900/30`
      )}>
        <Icon className={cn('h-4 w-4', `text-${config.color}-600 dark:text-${config.color}-400`)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-xs font-semibold', `text-${config.color}-700 dark:text-${config.color}-400`)}>
            {config.label}
          </span>
          {isUrgent && (
            <span className="rounded bg-red-500 px-1 text-[9px] font-bold text-white">ด่วน</span>
          )}
        </div>
        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
          {info.summaryText || config.label}
        </p>
      </div>

      {/* Status badge */}
      <div className="flex shrink-0 items-center gap-1">
        <StatusIcon className={cn('h-3.5 w-3.5', statusInfo.className)} />
        <span className={cn('text-[10px] font-medium', statusInfo.className)}>
          {info.isAssigned && info.assigneeName
            ? info.assigneeName
            : statusInfo.label}
        </span>
      </div>

      {/* Time + chevron */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-[10px] text-gray-400">{time}</span>
        <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600" />
      </div>
    </button>
  );
});
