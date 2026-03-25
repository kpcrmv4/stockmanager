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
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { notifyStaff } from '@/lib/notifications/client';
import { sendChatBotMessage } from '@/lib/chat/bot-client';
import type { ChatMessage, ActionCardMetadata, ChatBroadcastPayload } from '@/types/chat';
import { TransferActionCard } from './transfer-action-card';

interface ActionCardMessageProps {
  message: ChatMessage;
  currentUserId: string;
  currentUserName: string;
  roomId: string;
  storeId: string | null;
}

const ACTION_TYPE_CONFIG: Record<string, { icon: typeof Wine; color: string; label: string }> = {
  deposit_claim: { icon: Wine, color: 'emerald', label: 'รายการฝากใหม่' },
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

export const ActionCardMessage = memo(function ActionCardMessage({ message, currentUserId, currentUserName, roomId, storeId }: ActionCardMessageProps) {
  const [loading, setLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
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
  const isClaimedByMe = meta.claimed_by === currentUserId && !isTimedOut;

  // Borrow-specific status
  const isBorrow = meta.action_type === 'borrow_approve';
  const borrowStatus = meta.borrow_status || (isPending ? 'pending_approval' : undefined);

  // Borrow items state (fetch on mount for pending borrows)
  interface BorrowItem { id: string; product_name: string; quantity: number; unit: string | null; }
  const [borrowItems, setBorrowItems] = useState<BorrowItem[]>([]);
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>({});
  const [borrowItemsLoaded, setBorrowItemsLoaded] = useState(false);

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
      const fnName =
        action === 'claim'
          ? 'claim_action_card'
          : action === 'release'
            ? 'release_action_card'
            : 'complete_action_card';

      const params =
        action === 'complete'
          ? { p_message_id: message.id, p_user_id: currentUserId, p_notes: null, p_photo_url: photoUrl }
          : { p_message_id: message.id, p_user_id: currentUserId };

      const { data: result } = await supabase.rpc(fnName, params);

      if (result?.success || result?.timed_out) {
        const updatedMeta = result.metadata || result?.metadata;
        const updated: ChatMessage = {
          ...message,
          metadata: updatedMeta,
        };
        updateMessage(updated);

        // Broadcast update ไปห้อง
        await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
          type: 'message_updated',
          message: updated,
        } as unknown as Record<string, unknown>);

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

        // แจ้งเตือน bar เมื่อ staff รับของ (complete deposit_claim)
        if (action === 'complete' && meta.action_type === 'deposit_claim' && storeId) {
          const summary = meta.summary;
          notifyStaff({
            storeId,
            type: 'deposit_received',
            title: 'รอรับเข้าระบบ',
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
      }
    } finally {
      setLoading(false);
    }
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

      const res = await fetch(`/api/borrows/${meta.reference_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          lenderPhotoUrl: action === 'approve' ? photoUrl : undefined,
          approvedItems,
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
        borrow_rejected_reason: action === 'reject' ? 'ปฏิเสธจากแชท' : null,
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

      // Broadcast update ไปห้อง
      broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
        type: 'message_updated',
        message: updated,
      } as unknown as Record<string, unknown>).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  // คำนวณเวลาที่เหลือ (ถ้า claimed)
  const timeRemaining = isClaimed && meta.claimed_at && meta.timeout_minutes
    ? getTimeRemaining(meta.claimed_at, meta.timeout_minutes)
    : null;

  return (
    <div className="my-2 flex justify-center">
      <div
        className={cn(
          'w-full max-w-[90%] rounded-xl border p-3 shadow-sm',
          PRIORITY_STYLES[meta.priority] || PRIORITY_STYLES.normal
        )}
      >
        {/* Header */}
        <div className="mb-2 flex items-center gap-2">
          {meta.priority === 'urgent' && (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          )}
          <Icon className={cn('h-4 w-4', `text-${config.color}-600 dark:text-${config.color}-400`)} />
          <span className="text-xs font-bold text-gray-900 dark:text-white">
            {config.label}
          </span>
          <span className="text-xs text-gray-400">
            #{meta.reference_id?.slice(0, 8)}
          </span>
        </div>

        {/* Summary */}
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

        {/* ==========================================
            BORROW-SPECIFIC UI
            ========================================== */}
        {isBorrow ? (
          <>
            {/* Pending — แสดงปุ่มอนุมัติ/ปฏิเสธ */}
            {borrowStatus === 'pending_approval' && isPending && (
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
                    isLoading={loading}
                    onClick={() => handleBorrowAction('reject')}
                  >
                    ปฏิเสธ
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
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full"
                  icon={<Hand className="h-4 w-4" />}
                  isLoading={loading}
                  onClick={() => handleAction('claim')}
                >
                  {isTimedOut ? 'รับงานต่อ' : 'รับรายการนี้'}
                </Button>
              </div>
            )}

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
                    <PhotoUpload
                      value={photoUrl}
                      onChange={setPhotoUrl}
                      folder="confirmations"
                      placeholder="ถ่ายรูปยืนยัน (ไม่บังคับ)"
                      compact
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1"
                        icon={<CheckCircle className="h-3.5 w-3.5" />}
                        isLoading={loading}
                        onClick={() => handleAction('complete')}
                      >
                        {photoUrl ? 'เสร็จ + ส่งรูป' : 'เสร็จแล้ว'}
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

            {isCompleted && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
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
                    <Camera className="ml-auto h-3.5 w-3.5 text-emerald-500" />
                  )}
                </div>
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
