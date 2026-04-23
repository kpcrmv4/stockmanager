'use client';

import { useState, useEffect, memo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { broadcastToChannel } from '@/lib/supabase/broadcast';
import { useChatStore } from '@/stores/chat-store';
import { Button, PhotoUpload } from '@/components/ui';
import {
  Hand,
  CheckCircle,
  XCircle,
  Clock,
  Wine,
  Package,
  ClipboardCheck,
  Repeat,
  AlertTriangle,
  Loader2,
  Camera,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Plus,
  Printer,
  Ban,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { notifyStaff } from '@/lib/notifications/client';
import { sendChatBotMessage } from '@/lib/chat/bot-client';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import type { ChatMessage, ActionCardMetadata, ChatBroadcastPayload } from '@/types/chat';
import { TransferActionCard } from './transfer-action-card';

interface ActionCardMessageProps {
  message: ChatMessage;
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  roomId: string;
  storeId: string | null;
  onStatusChange?: () => void;
}

const ACTION_TYPE_CONFIG: Record<string, { icon: typeof Wine; color: string; label: string }> = {
  deposit_claim: { icon: Wine, color: 'emerald', label: 'ฝากเหล้า' },
  withdrawal_claim: { icon: Package, color: 'blue', label: 'คำขอเบิกเหล้า' },
  stock_explain: { icon: ClipboardCheck, color: 'amber', label: 'สต๊อกไม่ตรง' },
  borrow_approve: { icon: Repeat, color: 'violet', label: 'คำขอยืมสินค้า' },
  transfer_receive: { icon: Package, color: 'orange', label: 'โอนสต๊อกเข้าคลังกลาง' },
  generic: { icon: ClipboardCheck, color: 'gray', label: 'งานใหม่' },
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
  normal: 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
  low: 'border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
};

export const ActionCardMessage = memo(function ActionCardMessage({ message, currentUserId, currentUserName, currentUserRole, roomId, storeId, onStatusChange }: ActionCardMessageProps) {
  const [loading, setLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [barRemainingPercent, setBarRemainingPercent] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { updateMessage } = useChatStore();
  const router = useRouter();
  const meta = message.metadata as ActionCardMetadata | null;

  if (!meta) return null;

  // Transfer cards ใช้ component เฉพาะ
  if (meta.action_type === 'transfer_receive') {
    return (
      <TransferActionCard
        message={message}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        roomId={roomId}
      />
    );
  }

  const config = ACTION_TYPE_CONFIG[meta.action_type] || ACTION_TYPE_CONFIG.generic;
  const Icon = config.icon;
  const isTimedOut = meta.status === 'claimed' && meta.claimed_at && meta.timeout_minutes
    ? new Date(meta.claimed_at).getTime() + meta.timeout_minutes * 60 * 1000 < Date.now()
    : false;
  const isClaimed = meta.status === 'claimed' && !isTimedOut;
  const isCompleted = meta.status === 'completed';
  const isPending = meta.status === 'pending' || isTimedOut;
  const isPendingBar = meta.status === 'pending_bar';
  const isClaimedByMe = meta.claimed_by === currentUserId && !isTimedOut;

  // Deposit 2-step flow: staff can't claim pending_bar, only bar/manager/owner
  const isDepositCard = meta.action_type === 'deposit_claim';
  const isWithdrawalCard = meta.action_type === 'withdrawal_claim';
  const canClaimBarStep = isPendingBar && isDepositCard
    && currentUserRole && ['bar', 'manager', 'owner'].includes(currentUserRole);
  // Withdrawal action cards: only bar/manager/owner can approve
  const canApproveWithdrawal = isWithdrawalCard && isPending
    && currentUserRole && ['bar', 'manager', 'owner'].includes(currentUserRole);

  // Borrow-specific status
  const isBorrow = meta.action_type === 'borrow_approve';
  const borrowStatus = meta.borrow_status || (isPending ? 'pending_approval' : undefined);

  // Borrow items state (fetch on mount for pending borrows)
  interface BorrowItem { id: string; product_name: string; quantity: number; unit: string | null; }
  const [borrowItems, setBorrowItems] = useState<BorrowItem[]>([]);
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>({});
  const [borrowItemsLoaded, setBorrowItemsLoaded] = useState(false);
  const [showBorrowRejectForm, setShowBorrowRejectForm] = useState(false);
  const [borrowRejectReason, setBorrowRejectReason] = useState('');

  useEffect(() => {
    if (!isBorrow || borrowStatus !== 'pending_approval' || !isPending || borrowItemsLoaded) return;
    const supabase = createClient();
    supabase
      .from('borrow_items')
      .select('id, product_name, quantity, unit')
      .eq('borrow_id', meta.reference_id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setBorrowItems(data);
          const qtys: Record<string, number> = {};
          for (const item of data) {
            qtys[item.id] = item.quantity; // default = จำนวนที่ขอ
          }
          setApprovedQtys(qtys);
        }
        setBorrowItemsLoaded(true);
      });
  }, [isBorrow, borrowStatus, isPending, meta.reference_id, borrowItemsLoaded]);

  // ==========================================
  // Generic action card handler (deposit, withdrawal, stock)
  // ==========================================
  const handleAction = async (action: 'claim' | 'release' | 'complete') => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Check if this is bar completing pending_bar step (must check BEFORE staff check)
      const isBarCompleting = action === 'complete' && isDepositCard && meta.status === 'claimed'
        && (meta as ActionCardMetadata & { _bar_step?: boolean })._bar_step === true;

      // Deposit 2-step: staff completes "pending" → transitions to "pending_bar"
      // Exclude bar completing (_bar_step) so it falls through to normal complete flow
      const isStaffCompletingDeposit = action === 'complete'
        && isDepositCard
        && meta.status === 'claimed'
        && !isPendingBar
        && !isBarCompleting;

      if (isStaffCompletingDeposit) {
        // Staff complete → transition to pending_bar (NOT completed)
        const newMeta: ActionCardMetadata = {
          ...meta,
          status: 'pending_bar',
          claimed_by: null,
          claimed_by_name: null,
          claimed_at: null,
          confirmation_photo_url: photoUrl || meta.confirmation_photo_url || null,
          summary: {
            ...meta.summary,
            received_by: currentUserName,
          },
        };

        await supabase
          .from('chat_messages')
          .update({ metadata: newMeta })
          .eq('id', message.id);

        const updated: ChatMessage = { ...message, metadata: newMeta };
        updateMessage(updated);
        onStatusChange?.();

        await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
          type: 'message_updated',
          message: updated,
        } as unknown as Record<string, unknown>);

        // Sync staff received info back to deposit record
        if (meta.reference_table === 'deposits' && meta.reference_id) {
          supabase
            .from('deposits')
            .update({
              received_by: currentUserId,
              received_photo_url: photoUrl || undefined,
            })
            .eq('deposit_code', meta.reference_id)
            .then(() => {});
        }

        // Audit: staff completed deposit step 1
        auditActionCard(AUDIT_ACTIONS.ACTION_CARD_COMPLETED, { step: 'staff_received' });

        // แจ้งเตือน bar
        if (storeId) {
          const summary = meta.summary;
          notifyStaff({
            storeId,
            type: 'deposit_received',
            title: 'รอบาร์ยืนยัน',
            body: `${currentUserName} รับของแล้ว — ${summary.customer || ''} ${summary.items || ''} (${meta.reference_id})`,
            data: { deposit_code: meta.reference_id },
            excludeUserId: currentUserId,
            roles: ['bar', 'manager'],
          });
          sendChatBotMessage({
            storeId,
            type: 'system',
            content: `📦 ${currentUserName} รับของแล้ว — ${summary.customer || ''} ${summary.items || ''} (${meta.reference_id}) — รอ Bar ยืนยันเข้าระบบ`,
          });
        }
      } else {
        // Normal flow: claim/release/complete (including bar completing deposit)
        // Use direct DB updates instead of RPC functions for reliability
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let updatedMeta: any;

        if (action === 'claim') {
          // Check timeout and auto-release if needed
          let currentMeta: Record<string, unknown> = { ...meta };
          if (meta.status === 'claimed' && meta.claimed_at && meta.timeout_minutes) {
            const claimedAt = new Date(meta.claimed_at).getTime();
            const now = Date.now();
            if (now - claimedAt > meta.timeout_minutes * 60 * 1000) {
              currentMeta = { ...currentMeta, status: 'pending', claimed_by: null, claimed_by_name: null, claimed_at: null, auto_released: true, auto_released_at: new Date().toISOString() };
            }
          }
          if ((currentMeta.status ?? meta.status) !== 'pending' && (currentMeta.status ?? meta.status) !== 'pending_bar') {
            setLoading(false);
            return;
          }
          updatedMeta = {
            ...currentMeta,
            status: 'claimed',
            claimed_by: currentUserId,
            claimed_by_name: currentUserName,
            claimed_at: new Date().toISOString(),
            auto_released: null,
            auto_released_at: null,
          };
        } else if (action === 'release') {
          const metaAny = meta as unknown as Record<string, unknown>;
          const restoreStatus = metaAny._bar_step ? 'pending_bar' : 'pending';
          updatedMeta = {
            ...meta,
            status: restoreStatus,
            claimed_by: null,
            claimed_by_name: null,
            claimed_at: null,
            _bar_step: null,
          };
        } else {
          // complete
          const completeNotes = isBarCompleting && barRemainingPercent
            ? `คงเหลือ ${barRemainingPercent}%`
            : null;
          updatedMeta = {
            ...meta,
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion_notes: completeNotes,
            confirmation_photo_url: photoUrl || meta.confirmation_photo_url || null,
          };
          if (isBarCompleting && barRemainingPercent) {
            updatedMeta = {
              ...updatedMeta,
              summary: {
                ...(updatedMeta.summary || {}),
                remaining_percent: barRemainingPercent,
                confirmed_by: currentUserName,
              },
            };
          }
        }

        const { error } = await supabase
          .from('chat_messages')
          .update({ metadata: updatedMeta })
          .eq('id', message.id);

        if (!error) {
          const updated: ChatMessage = {
            ...message,
            metadata: updatedMeta,
          };
          updateMessage(updated);
          onStatusChange?.();

          await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
            type: 'message_updated',
            message: updated,
          } as unknown as Record<string, unknown>);

          // Audit log
          if (action === 'claim') auditActionCard(AUDIT_ACTIONS.ACTION_CARD_CLAIMED);
          else if (action === 'release') auditActionCard(AUDIT_ACTIONS.ACTION_CARD_RELEASED);
          else if (action === 'complete') auditActionCard(AUDIT_ACTIONS.ACTION_CARD_COMPLETED, {
            step: isBarCompleting ? 'bar_confirmed' : 'completed',
            remaining_percent: barRemainingPercent || undefined,
          });

          // Sync photo กลับไปที่ deposit/withdrawal record (fire-and-forget)
          if (action === 'complete' && photoUrl && meta) {
            fetch('/api/chat/sync-photo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reference_table: meta.reference_table,
                reference_id: meta.reference_id,
                photo_url: photoUrl,
              }),
            }).catch(() => {});
          }

          // Bar completed deposit → update deposit status + notify
          if (isBarCompleting && storeId) {
            const summary = meta.summary;

            // Update deposit record: pending_confirm → in_store
            if (meta.reference_table === 'deposits' && meta.reference_id) {
              supabase
                .from('deposits')
                .update({
                  status: 'in_store',
                  confirm_photo_url: photoUrl || undefined,
                  remaining_percent: barRemainingPercent ? Number(barRemainingPercent) : undefined,
                })
                .eq('deposit_code', meta.reference_id)
                .then(() => {});
            }

            sendChatBotMessage({
              storeId,
              type: 'system',
              content: `✅ ${currentUserName} ยืนยันรับฝาก ${summary.items || ''} (${meta.reference_id}) — ${summary.customer || ''} — คงเหลือ ${barRemainingPercent || '?'}%`,
            });

            // Push notification: bar confirmed deposit
            notifyStaff({
              storeId,
              type: 'deposit_confirmed',
              title: 'ฝากเหล้ายืนยันแล้ว',
              body: `${currentUserName} ยืนยันรับฝาก ${summary.items || ''} — ${summary.customer || ''} (${meta.reference_id})`,
              data: { deposit_code: meta.reference_id },
              excludeUserId: currentUserId,
            });
          }

          // Withdrawal completed → update withdrawal + deposit records
          if (action === 'complete' && meta.action_type === 'withdrawal_claim' && meta.reference_id) {
            try {
              // Find deposit by deposit_code
              const { data: deposit } = await supabase
                .from('deposits')
                .select('id, remaining_qty, quantity')
                .eq('deposit_code', meta.reference_id)
                .single();

              if (deposit) {
                // Find the latest pending/approved withdrawal for this deposit
                const { data: withdrawal } = await supabase
                  .from('withdrawals')
                  .select('id, requested_qty')
                  .eq('deposit_id', deposit.id)
                  .in('status', ['pending', 'approved'])
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .single();

                if (withdrawal) {
                  const qty = withdrawal.requested_qty;

                  // Update withdrawal status to completed
                  await supabase
                    .from('withdrawals')
                    .update({
                      status: 'completed',
                      actual_qty: qty,
                      processed_by: currentUserId,
                      photo_url: photoUrl || undefined,
                    })
                    .eq('id', withdrawal.id);

                  // Update deposit remaining qty
                  const newRemaining = Math.max(0, deposit.remaining_qty - qty);
                  const newPercent = deposit.quantity > 0 ? (newRemaining / deposit.quantity) * 100 : 0;
                  const newStatus = newRemaining <= 0 ? 'withdrawn' : 'in_store';

                  await supabase
                    .from('deposits')
                    .update({
                      remaining_qty: newRemaining,
                      remaining_percent: newPercent,
                      status: newStatus,
                    })
                    .eq('id', deposit.id);
                }
              }

              if (storeId) {
                sendChatBotMessage({
                  storeId,
                  type: 'system',
                  content: `✅ ${currentUserName} เบิกเหล้า ${meta.summary.items || ''} (${meta.reference_id}) — ${meta.summary.customer || ''}`,
                });

                // Push notification: withdrawal approved
                notifyStaff({
                  storeId,
                  type: 'withdrawal_request',
                  title: 'อนุมัติเบิกเหล้าแล้ว',
                  body: `${currentUserName} อนุมัติเบิก ${meta.summary.items || ''} — ${meta.summary.customer || ''} (${meta.reference_id})`,
                  data: { deposit_code: meta.reference_id },
                  excludeUserId: currentUserId,
                });
              }
            } catch {
              // Non-blocking: withdrawal sync failure shouldn't break the UI
            }
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Bar step: claim pending_bar → sets _bar_step flag
  const handleBarClaim = async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Directly update metadata: pending_bar → claimed with _bar_step flag
      const newMeta: ActionCardMetadata & { _bar_step: boolean } = {
        ...meta,
        status: 'claimed',
        claimed_by: currentUserId,
        claimed_by_name: currentUserName,
        claimed_at: new Date().toISOString(),
        _bar_step: true,
      };

      const { error } = await supabase
        .from('chat_messages')
        .update({ metadata: newMeta })
        .eq('id', message.id);

      if (!error) {
        const updated: ChatMessage = { ...message, metadata: newMeta };
        updateMessage(updated);
        onStatusChange?.();

        await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
          type: 'message_updated',
          message: updated,
        } as unknown as Record<string, unknown>);

        auditActionCard(AUDIT_ACTIONS.ACTION_CARD_CLAIMED, { step: 'bar_claimed' });
      }
    } finally {
      setLoading(false);
    }
  };

  // Reject/cancel an action card (pending or pending_bar)
  const handleReject = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const newMeta: ActionCardMetadata = {
        ...meta,
        status: 'completed',
        completed_at: new Date().toISOString(),
        claimed_by: currentUserId,
        claimed_by_name: currentUserName,
        completion_notes: 'ยกเลิกรายการ',
        summary: {
          ...meta.summary,
          rejected: true,
          rejected_by: currentUserName,
        },
      };

      await supabase
        .from('chat_messages')
        .update({ metadata: newMeta })
        .eq('id', message.id);

      const updated: ChatMessage = { ...message, metadata: newMeta };
      updateMessage(updated);
      onStatusChange?.();

      await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
        type: 'message_updated',
        message: updated,
      } as unknown as Record<string, unknown>);

      if (storeId) {
        sendChatBotMessage({
          storeId,
          type: 'system',
          content: `❌ ${currentUserName} ยกเลิกรายการ ${meta.summary.items || ''} (${meta.reference_id}) — ${meta.summary.customer || ''}`,
        });
      }

      logAudit({
        store_id: storeId,
        action_type: AUDIT_ACTIONS.ACTION_CARD_REJECTED,
        table_name: meta.reference_table,
        record_id: meta.reference_id,
        new_value: {
          action_type: meta.action_type,
          customer: meta.summary.customer,
          items: meta.summary.items,
          rejected_by: currentUserName,
        },
        changed_by: currentUserId,
      });

      // Sync rejection to source table
      if (meta.action_type === 'withdrawal_claim' && meta.reference_id) {
        try {
          const { data: deposit } = await supabase
            .from('deposits')
            .select('id')
            .eq('deposit_code', meta.reference_id)
            .single();

          if (deposit) {
            // Reject the pending withdrawal
            await supabase
              .from('withdrawals')
              .update({ status: 'rejected', processed_by: currentUserId, notes: 'ยกเลิกจากแชท' })
              .eq('deposit_id', deposit.id)
              .in('status', ['pending', 'approved']);

            // Restore deposit status back to in_store
            await supabase
              .from('deposits')
              .update({ status: 'in_store' })
              .eq('id', deposit.id)
              .eq('status', 'pending_withdrawal');
          }
        } catch {
          // Non-blocking
        }
      } else if (meta.action_type === 'deposit_claim' && meta.reference_table === 'deposits' && meta.reference_id) {
        // Reject deposit → restore to pending_confirm or mark accordingly
        // (ยกเลิกรายการฝากเหล้า — doesn't delete, just cancels the action card)
      }

      setShowRejectConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  // Print receipt/label after bar confirms deposit
  const handlePrint = async (jobType: 'receipt' | 'label') => {
    if (!storeId) return;
    setIsPrinting(true);
    try {
      const supabase = createClient();

      // Fetch deposit data for print payload
      const { data: deposit } = await supabase
        .from('deposits')
        .select('id, deposit_code, customer_name, customer_phone, product_name, category, quantity, remaining_qty, table_number, expiry_date, created_at')
        .eq('deposit_code', meta.reference_id)
        .single();

      if (!deposit) {
        setIsPrinting(false);
        return;
      }

      const { data: store } = await supabase
        .from('stores')
        .select('store_name')
        .eq('id', storeId)
        .single();

      const payload = {
        deposit_code: deposit.deposit_code,
        customer_name: deposit.customer_name,
        customer_phone: deposit.customer_phone,
        product_name: deposit.product_name,
        category: deposit.category,
        quantity: deposit.quantity,
        remaining_qty: deposit.remaining_qty,
        table_number: deposit.table_number,
        expiry_date: deposit.expiry_date,
        created_at: deposit.created_at,
        store_name: store?.store_name || '',
      };

      const copies = jobType === 'label' ? (deposit.remaining_qty || 1) : 1;

      await supabase.from('print_queue').insert({
        store_id: storeId,
        deposit_id: deposit.id,
        job_type: jobType,
        status: 'pending',
        copies,
        payload,
        requested_by: currentUserId,
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // ==========================================
  // Audit helper — fire-and-forget after action card operations
  // ==========================================
  const auditActionCard = (action: string, extra?: Record<string, unknown>) => {
    logAudit({
      store_id: storeId,
      action_type: action,
      table_name: meta.reference_table,
      record_id: meta.reference_id,
      new_value: {
        action_type: meta.action_type,
        customer: meta.summary.customer,
        items: meta.summary.items,
        performed_by: currentUserName,
        ...extra,
      },
      changed_by: currentUserId,
    });
  };

  // ==========================================
  // Borrow-specific handlers
  // ==========================================
  const handleBorrowAction = async (action: 'approve' | 'reject') => {
    setLoading(true);
    try {
      const approvedItems = action === 'approve' && borrowItems.length > 0
        ? borrowItems.map((item) => ({
            itemId: item.id,
            approvedQuantity: approvedQtys[item.id] ?? item.quantity,
          }))
        : undefined;

      const reason = action === 'reject' ? (borrowRejectReason.trim() || 'ปฏิเสธจากแชท') : undefined;

      const res = await fetch(`/api/borrows/${meta.reference_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          lenderPhotoUrl: action === 'approve' ? photoUrl : undefined,
          approvedItems,
          rejectReason: reason,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[BorrowCard] action failed:', err);
        return;
      }

      // อัพเดท action card metadata ให้แสดงสถานะใหม่
      const supabase = createClient();
      const newMeta: ActionCardMetadata = {
        ...meta,
        status: 'completed',
        borrow_status: action === 'approve' ? 'approved' : 'rejected',
        borrow_approved_by: action === 'approve' ? currentUserName : null,
        borrow_rejected_reason: action === 'reject' ? reason || null : null,
        completed_at: new Date().toISOString(),
        claimed_by: currentUserId,
        claimed_by_name: currentUserName,
      };

      // อัพเดทใน DB
      await supabase
        .from('chat_messages')
        .update({ metadata: newMeta })
        .eq('id', message.id);

      const updated: ChatMessage = { ...message, metadata: newMeta };
      updateMessage(updated);
      onStatusChange?.();

      // Broadcast update ไปห้อง
      broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
        type: 'message_updated',
        message: updated,
      } as unknown as Record<string, unknown>).catch(() => {});

      // Reset reject form
      if (action === 'reject') {
        setShowBorrowRejectForm(false);
        setBorrowRejectReason('');
      }
    } finally {
      setLoading(false);
    }
  };

  // คำนวณเวลาที่เหลือ (ถ้า claimed)
  const timeRemaining = isClaimed && meta.claimed_at && meta.timeout_minutes
    ? getTimeRemaining(meta.claimed_at, meta.timeout_minutes)
    : null;

  return (
    <div className={cn('flex justify-center', isCompleted ? 'my-1' : 'my-2')}>
      <div
        className={cn(
          'w-full max-w-[90%] rounded-xl border shadow-sm',
          isCompleted ? 'p-2.5' : 'p-3',
          PRIORITY_STYLES[meta.priority] || PRIORITY_STYLES.normal
        )}
      >
        {/* Header */}
        <div className={cn('flex items-center gap-2', isCompleted ? 'mb-1' : 'mb-2')}>
          {meta.priority === 'urgent' && (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          )}
          <Icon className={cn('h-4 w-4', `text-${config.color}-600 dark:text-${config.color}-400`)} />
          <span className="text-xs font-bold text-gray-900 dark:text-white">
            {isPendingBar ? 'รอบาร์ยืนยัน' : isPending && isDepositCard ? 'รอ Staff รับ' : config.label}
          </span>
          <span className="text-xs text-gray-400">
            {typeof meta.summary.code === 'string' && meta.summary.code
              ? meta.summary.code
              : `#${meta.reference_id}`}
          </span>
        </div>

        {/* Summary — compact single-line for completed, full for active */}
        {isCompleted ? (
          <p className="mb-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {meta.summary.customer}{meta.summary.items ? ` · ${meta.summary.items}` : ''}
          </p>
        ) : (
          <div className="mb-3 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
            {meta.summary.customer && (
              <p>
                {isBorrow ? 'สาขา' : 'ลูกค้า'}: {meta.summary.customer}
              </p>
            )}
            {meta.summary.items && <p>รายการ: {meta.summary.items}</p>}
            {meta.summary.note && (
              <p className="italic text-gray-400">"{meta.summary.note}"</p>
            )}
          </div>
        )}

        {/* ==========================================
            BORROW-SPECIFIC UI
            ========================================== */}
        {isBorrow ? (
          <>
            {/* Pending — แสดงปุ่มอนุมัติ/ปฏิเสธ */}
            {borrowStatus === 'pending_approval' && isPending && !showBorrowRejectForm && (
              <div className="space-y-2">
                {/* Borrow items — กำหนดจำนวนอนุมัติ */}
                {borrowItems.length > 0 && (
                  <div className="space-y-1.5 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/30">
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      กำหนดจำนวนอนุมัติ
                    </p>
                    {borrowItems.map((item) => {
                      const qty = approvedQtys[item.id] ?? item.quantity;
                      return (
                        <div key={item.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-300">
                            {item.product_name}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setApprovedQtys((prev) => ({
                                ...prev,
                                [item.id]: Math.max(0, qty - 1),
                              }))}
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 active:bg-gray-400 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={item.quantity}
                              value={qty}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(item.quantity, Number(e.target.value) || 0));
                                setApprovedQtys((prev) => ({ ...prev, [item.id]: val }));
                              }}
                              className="h-6 w-10 rounded-md border border-gray-200 bg-white text-center text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => setApprovedQtys((prev) => ({
                                ...prev,
                                [item.id]: Math.min(item.quantity, qty + 1),
                              }))}
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 active:bg-gray-400 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <span className="text-[11px] text-gray-400">
                              /{item.quantity} {item.unit || ''}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* ถ่ายรูปสินค้า (ไม่บังคับ) */}
                <PhotoUpload
                  value={photoUrl}
                  onChange={setPhotoUrl}
                  folder="borrows"
                  placeholder="ถ่ายรูปสินค้า (ไม่บังคับ)"
                  compact
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex-1"
                    icon={<ThumbsUp className="h-3.5 w-3.5" />}
                    isLoading={loading}
                    onClick={() => handleBorrowAction('approve')}
                  >
                    อนุมัติ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                    icon={<ThumbsDown className="h-3.5 w-3.5" />}
                    onClick={() => setShowBorrowRejectForm(true)}
                  >
                    ปฏิเสธ
                  </Button>
                </div>
              </div>
            )}

            {/* Borrow Reject Form — ถามเหตุผลก่อนปฏิเสธ */}
            {borrowStatus === 'pending_approval' && isPending && showBorrowRejectForm && (
              <div className="space-y-2">
                <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
                  <p className="text-xs font-medium text-red-700 dark:text-red-300">
                    ปฏิเสธคำขอยืมสินค้า
                  </p>
                </div>
                <textarea
                  value={borrowRejectReason}
                  onChange={(e) => setBorrowRejectReason(e.target.value)}
                  placeholder="เหตุผลที่ปฏิเสธ (ไม่บังคับ)"
                  rows={2}
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300 dark:border-red-800 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowBorrowRejectForm(false); setBorrowRejectReason(''); }}
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    icon={<ThumbsDown className="h-3.5 w-3.5" />}
                    isLoading={loading}
                    onClick={() => handleBorrowAction('reject')}
                  >
                    ยืนยันปฏิเสธ
                  </Button>
                </div>
              </div>
            )}

            {/* Approved */}
            {meta.borrow_status === 'approved' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    อนุมัติแล้ว
                  </span>
                  {meta.borrow_approved_by && (
                    <span className="text-xs text-emerald-500/70">
                      โดย {meta.borrow_approved_by}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => router.push('/borrow')}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-50 py-2 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  ไปยืนยัน POS ในหน้ายืมสินค้า
                </button>
              </div>
            )}

            {/* Rejected */}
            {meta.borrow_status === 'rejected' && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-xs font-medium text-red-700 dark:text-red-300">
                  ปฏิเสธแล้ว
                </span>
                {meta.borrow_rejected_reason && (
                  <span className="text-xs text-red-500/70">
                    — {meta.borrow_rejected_reason}
                  </span>
                )}
              </div>
            )}

            {/* Cancelled (จากหน้า borrow) */}
            {meta.borrow_status === 'cancelled' && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/30">
                <XCircle className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  ยกเลิกแล้ว
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ==========================================
                GENERIC ACTION CARD UI (deposit, withdrawal, stock)
                ========================================== */}

            {/* Pending — withdrawal: เฉพาะ bar/manager/owner, อื่นๆ: ทุก role */}
            {isPending && (
              <div className="space-y-2">
                {isTimedOut && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      หมดเวลา — {meta.claimed_by_name} ไม่ได้ทำ
                    </span>
                  </div>
                )}
                {isWithdrawalCard && !canApproveWithdrawal ? (
                  <div className="rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                    รอ Bar/Manager อนุมัติเบิก
                  </div>
                ) : showRejectConfirm ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">ยืนยันยกเลิกรายการนี้?</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" className="flex-1 bg-red-600 hover:bg-red-700" icon={<Ban className="h-3.5 w-3.5" />} isLoading={loading} onClick={handleReject}>ยืนยัน</Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowRejectConfirm(false)}>ไม่ใช่</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className={cn('flex-1', isWithdrawalCard && 'bg-emerald-600 hover:bg-emerald-700')}
                      icon={<Hand className="h-4 w-4" />}
                      isLoading={loading}
                      onClick={() => handleAction('claim')}
                    >
                      {isWithdrawalCard ? 'อนุมัติเบิก' : isTimedOut ? 'รับงานต่อ' : 'รับรายการนี้'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                      icon={<Ban className="h-3.5 w-3.5" />}
                      onClick={() => setShowRejectConfirm(true)}
                    >
                      ยกเลิก
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Pending Bar — เฉพาะ bar/manager/owner กดรับได้ */}
            {isPendingBar && !isClaimed && (
              <div className="space-y-2">
                {typeof meta.summary.received_by === 'string' && (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
                    <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {meta.summary.received_by} รับของแล้ว — รอบาร์ยืนยัน
                    </span>
                  </div>
                )}
                {showRejectConfirm ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">ยืนยันยกเลิกรายการนี้?</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" className="flex-1 bg-red-600 hover:bg-red-700" icon={<Ban className="h-3.5 w-3.5" />} isLoading={loading} onClick={handleReject}>ยืนยัน</Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowRejectConfirm(false)}>ไม่ใช่</Button>
                    </div>
                  </div>
                ) : canClaimBarStep ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      icon={<Hand className="h-4 w-4" />}
                      isLoading={loading}
                      onClick={handleBarClaim}
                    >
                      ยืนยันรับ (Bar)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                      icon={<Ban className="h-3.5 w-3.5" />}
                      onClick={() => setShowRejectConfirm(true)}
                    >
                      ยกเลิก
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                    รอ Bar/Manager ยืนยัน
                  </div>
                )}
              </div>
            )}

            {/* Claimed — แสดงสถานะ + ฟอร์มสำหรับคนที่รับ */}
            {isClaimed && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 dark:bg-indigo-900/20">
                  <CheckCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <div className="flex-1 text-xs">
                    <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                      {meta.claimed_by_name}
                    </span>
                    <span className="text-indigo-600/70 dark:text-indigo-400/70">
                      {' '}รับงานแล้ว
                    </span>
                  </div>
                  {timeRemaining && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3.5 w-3.5" />
                      {timeRemaining}
                    </div>
                  )}
                </div>

                {isClaimedByMe && (
                  <div className="space-y-2">
                    {/* Bar step: require %remaining + photo */}
                    {(meta as ActionCardMetadata & { _bar_step?: boolean })._bar_step && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            % คงเหลือ *
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={barRemainingPercent}
                            onChange={(e) => setBarRemainingPercent(e.target.value)}
                            placeholder="เช่น 80"
                            className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-center text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </div>
                    )}
                    <PhotoUpload
                      value={photoUrl}
                      onChange={setPhotoUrl}
                      folder="confirmations"
                      placeholder={
                        (meta as ActionCardMetadata & { _bar_step?: boolean })._bar_step
                          ? 'ถ่ายรูปเหล้า (บังคับ)'
                          : 'ถ่ายรูปยืนยัน (ไม่บังคับ)'
                      }
                      compact
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1"
                        icon={<CheckCircle className="h-3.5 w-3.5" />}
                        isLoading={loading}
                        disabled={
                          (meta as ActionCardMetadata & { _bar_step?: boolean })._bar_step
                            ? !photoUrl || !barRemainingPercent
                            : false
                        }
                        onClick={() => handleAction('complete')}
                      >
                        {(meta as ActionCardMetadata & { _bar_step?: boolean })._bar_step
                          ? 'ยืนยันรับฝาก'
                          : photoUrl ? 'เสร็จ + ส่งรูป' : 'เสร็จแล้ว'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        isLoading={loading}
                        onClick={() => handleAction('release')}
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Completed — compact by default, expand on tap */}
            {isCompleted && (
              <div className="space-y-2">
                {meta.summary.rejected ? (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-xs font-medium text-red-700 dark:text-red-300">
                      ยกเลิกแล้ว
                    </span>
                    {typeof meta.summary.rejected_by === 'string' && (
                      <span className="text-xs text-red-500/70">
                        โดย {meta.summary.rejected_by}
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="flex w-full items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30"
                    >
                      <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        เสร็จสิ้น
                      </span>
                      {meta.completed_at && (
                        <span className="text-xs text-emerald-500/70">
                          {new Date(meta.completed_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {meta.confirmation_photo_url && (
                        <Camera className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      {typeof meta.summary.remaining_percent === 'string' && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          คงเหลือ {meta.summary.remaining_percent}%
                        </span>
                      )}
                      <span className="ml-auto">
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                          : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                      </span>
                    </button>
                    {isExpanded && (
                      <>
                        {typeof meta.summary.remaining_percent === 'string' && typeof meta.summary.confirmed_by === 'string' && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            ยืนยันโดย {meta.summary.confirmed_by}
                          </p>
                        )}
                        {meta.confirmation_photo_url && (
                          <div className="overflow-hidden rounded-lg">
                            <img
                              src={meta.confirmation_photo_url}
                              alt="รูปยืนยัน"
                              className="w-full max-h-36 object-cover sm:max-h-48"
                              loading="lazy"
                            />
                          </div>
                        )}
                        {/* Print buttons — only for deposit_claim after bar confirmation */}
                        {isDepositCard && typeof meta.summary.confirmed_by === 'string' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
                              icon={<Printer className="h-3.5 w-3.5" />}
                              isLoading={isPrinting}
                              onClick={() => handlePrint('receipt')}
                            >
                              พิมพ์ใบรับฝาก
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
                              icon={<Printer className="h-3.5 w-3.5" />}
                              isLoading={isPrinting}
                              onClick={() => handlePrint('label')}
                            >
                              พิมพ์ป้ายขวด
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

function getTimeRemaining(claimedAt: string, timeoutMinutes: number): string | null {
  const claimed = new Date(claimedAt).getTime();
  const deadline = claimed + timeoutMinutes * 60 * 1000;
  const remaining = deadline - Date.now();

  if (remaining <= 0) return 'หมดเวลา';

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
