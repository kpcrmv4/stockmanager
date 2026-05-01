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
  ScanLine,
  ClipboardList,
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
  stock_supplementary: { icon: ScanLine, color: 'sky', label: 'รายการต้องนับเพิ่ม' },
  stock_approve: { icon: ClipboardList, color: 'violet', label: 'รออนุมัติชี้แจง' },
  borrow_approve: { icon: Repeat, color: 'violet', label: 'ยืมสินค้า' },
  borrow_return_confirm: { icon: Repeat, color: 'teal', label: 'รับคืนสินค้า' },
  transfer_receive: { icon: Truck, color: 'orange', label: 'โอนสต๊อก' },
  generic: { icon: ClipboardCheck, color: 'gray', label: 'งาน' },
};

const STATUS_ICON: Record<string, { icon: typeof Clock; className: string; label: string }> = {
  // ActionCardMetadata statuses
  pending: { icon: Clock, className: 'text-amber-500', label: 'รอรับ' },
  pending_bar: { icon: Clock, className: 'text-orange-500', label: 'รอBar' },
  claimed: { icon: Hand, className: 'text-blue-500', label: 'กำลังทำ' },
  completed: { icon: CheckCircle, className: 'text-emerald-500', label: 'เสร็จ' },
  cancelled: { icon: XCircle, className: 'text-red-500', label: 'ยกเลิก' },
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
  let status = (meta.status as string) || 'pending';
  const priority = (meta.priority as string) || 'normal';

  // A card that finished via the "ยกเลิกแล้ว" path is stored as
  // status='completed' with summary.rejected=true (legacy completion
  // form). Treat it as cancelled in the chat list so the row reads
  // "ยกเลิก HH:MM" instead of "เสร็จ HH:MM".
  const summaryMaybe = meta.summary as Record<string, unknown> | undefined;
  if (status === 'completed' && summaryMaybe?.rejected) {
    status = 'cancelled';
  }

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
  const summary = a.summary as Record<string, unknown> | undefined;
  const fromCustomer = summary?.from_customer === true;
  const tableNumber = (summary?.table_number as string | number | undefined) ?? null;
  const summaryParts: string[] = [];
  // Deposit_claim chat cards intentionally skip the deposit code prefix —
  // the bartender's eye is on customer name + items, the code lives on
  // the full card if they need it. Other action types still show the
  // short ref so users can spot duplicate notifications quickly.
  if (a.reference_id && actionType !== 'deposit_claim') {
    summaryParts.push(`#${a.reference_id.slice(-8)}`);
  }
  if (a.summary?.customer) summaryParts.push(a.summary.customer);
  // For customer-LIFF deposit_claim the `items` slot is the placeholder
  // "รอ Staff รับและระบุรายละเอียด" since product details aren't filled
  // yet — that's noisy in the compact card. If we have a table number,
  // show "โต๊ะ X" instead so the bartender knows where to walk.
  const isFromCustomerDeposit = actionType === 'deposit_claim' && fromCustomer;
  if (isFromCustomerDeposit && tableNumber !== null && tableNumber !== '') {
    summaryParts.push(`โต๊ะ ${tableNumber}`);
  } else if (a.summary?.items) {
    summaryParts.push(a.summary.items);
  }
  return {
    actionType,
    status,
    priority,
    summaryText: summaryParts.join(' · ') || '',
    assigneeName: a.claimed_by_name || null,
    isAssigned: status === 'claimed',
    fromCustomer,
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
  // Customer-submitted deposits should read as "waiting to receive from
  // customer" rather than the generic "ฝากเหล้า" — staff scanning the
  // chat tab can tell at a glance which cards are LIFF-originated and
  // which were created manually by another staff member.
  const cardLabel =
    info.actionType === 'deposit_claim' && info.fromCustomer
      ? 'รอรับจากลูกค้า'
      : config.label;
  const Icon = config.icon;
  const statusInfo = STATUS_ICON[info.status] || STATUS_ICON.pending;
  const StatusIcon = statusInfo.icon;

  // Show the time of the last status transition, not the row's
  // creation time. Otherwise a card cancelled an hour after it came in
  // displays the deposit-creation timestamp and looks like the cancel
  // happened in the past.
  const eventAtRaw = (() => {
    const m = meta as Record<string, unknown>;
    if (info.status === 'cancelled') {
      const summary = m.summary as Record<string, unknown> | undefined;
      const cancelledAt = (summary?.cancelled_at as string | undefined)
        ?? (m.cancelled_at as string | undefined)
        ?? (m.completed_at as string | undefined)
        ?? (m.updated_at as string | undefined);
      if (cancelledAt) return cancelledAt;
    }
    if (info.status === 'completed') {
      const completedAt = m.completed_at as string | undefined;
      if (completedAt) return completedAt;
    }
    if (info.status === 'claimed') {
      const claimedAt = m.claimed_at as string | undefined;
      if (claimedAt) return claimedAt;
    }
    return message.created_at;
  })();
  const time = new Date(eventAtRaw).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isUrgent = info.priority === 'urgent';

  // Type-specific status label — generic 'รอรับ' is wrong for stock cards
  // (they're not 'received', they need explain/count/approve actions).
  const statusLabel = (() => {
    if (info.status !== 'pending') return statusInfo.label;
    if (info.actionType === 'stock_explain') return 'รอชี้แจง';
    if (info.actionType === 'stock_supplementary') return 'รอนับเพิ่ม';
    if (info.actionType === 'stock_approve') return 'รออนุมัติ';
    if (info.actionType === 'borrow_return_confirm') return 'รอรับคืน';
    return statusInfo.label;
  })();

  return (
    <button
      onClick={() => setActiveTab('tasks')}
      className={cn(
        // max-w-md so the card doesn't span the entire chat column on
        // wide screens — matches chat bubbles' constrained width.
        'flex w-full max-w-md items-center gap-2 rounded-xl px-3 py-2 text-left transition-all active:scale-[0.98]',
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
            {cardLabel}
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
            : statusLabel}
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
