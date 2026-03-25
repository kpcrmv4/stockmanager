'use client';

import { useState, memo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { broadcastToChannel } from '@/lib/supabase/broadcast';
import { useChatStore } from '@/stores/chat-store';
import { Button, PhotoUpload } from '@/components/ui';
import {
  Truck,
  CheckCircle,
  XCircle,
  Package,
  Store,
  Camera,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  notifyChatTransferReceived,
  notifyChatTransferRejected,
} from '@/lib/chat/transfer-bot-client';
import type { ChatMessage } from '@/types/chat';
import type { TransferCardMetadata } from '@/types/transfer-chat';

// ==========================================
// Transfer Action Card — ออกแบบเฉพาะ
// ==========================================
// ไม่ใช้ร่วมกับ action-card-message.tsx
// รองรับ batch (หลายรายการ) + ยืนยันรับ/ปฏิเสธ + ถ่ายรูป

interface TransferActionCardProps {
  message: ChatMessage;
  currentUserId: string;
  currentUserName: string;
  roomId: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
  normal: 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
  low: 'border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
};

export const TransferActionCard = memo(function TransferActionCard({
  message,
  currentUserId,
  currentUserName,
  roomId,
}: TransferActionCardProps) {
  const meta = message.metadata as TransferCardMetadata | null;
  const { updateMessage } = useChatStore();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showItems, setShowItems] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (!meta || meta.action_type !== 'transfer_receive') return null;

  const isPending = meta.status === 'pending';
  const isReceived = meta.status === 'received';
  const isRejected = meta.status === 'rejected';

  // ==========================================
  // ยืนยันรับทั้ง batch
  // ==========================================
  const handleReceive = async () => {
    if (!photoUrl) return;
    setLoading(true);

    try {
      const supabase = createClient();

      // 1. อัพเดท transfers ทุกรายการใน batch เป็น confirmed
      for (const item of meta.items) {
        const { error: transferError } = await supabase
          .from('transfers')
          .update({
            status: 'confirmed',
            confirmed_by: currentUserId,
            confirm_photo_url: photoUrl,
          })
          .eq('id', item.transfer_id);

        if (transferError) {
          console.error('[TransferCard] update transfer error:', transferError);
          continue;
        }

        // 2. สร้าง hq_deposit record
        await supabase.from('hq_deposits').insert({
          transfer_id: item.transfer_id,
          deposit_id: item.deposit_id,
          from_store_id: meta.from_store_id,
          product_name: item.product_name,
          customer_name: item.customer_name,
          deposit_code: item.deposit_code,
          quantity: item.quantity,
          status: 'awaiting_withdrawal',
          received_by: currentUserId,
          received_photo_url: photoUrl,
          notes: notes || null,
        });

        // 3. อัพเดทสถานะ deposit เป็น transferred_out
        if (item.deposit_id) {
          await supabase
            .from('deposits')
            .update({ status: 'transferred_out' })
            .eq('id', item.deposit_id);
        }
      }

      // 4. อัพเดท action card metadata
      const updatedMeta: TransferCardMetadata = {
        ...meta,
        status: 'received',
        received_by: currentUserId,
        received_by_name: currentUserName,
        received_at: new Date().toISOString(),
        receive_photo_url: photoUrl,
        receive_notes: notes || null,
      };

      await supabase
        .from('chat_messages')
        .update({ metadata: updatedMeta })
        .eq('id', message.id);

      const updated: ChatMessage = { ...message, metadata: updatedMeta };
      updateMessage(updated);

      // 5. Broadcast update ไปห้อง
      await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
        type: 'message_updated',
        message: updated,
      } as unknown as Record<string, unknown>);

      // 6. ส่ง system message กลับไปห้องสาขาต้นทาง
      notifyChatTransferReceived(meta.from_store_id, {
        transfer_code: meta.transfer_code,
        item_count: meta.items.length,
        received_by_name: currentUserName,
      });
    } catch (err) {
      console.error('[TransferCard] handleReceive error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // ปฏิเสธทั้ง batch
  // ==========================================
  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setLoading(true);

    try {
      const supabase = createClient();

      // 1. อัพเดท transfers ทุกรายการเป็น rejected
      for (const item of meta.items) {
        await supabase
          .from('transfers')
          .update({
            status: 'rejected',
            rejection_reason: rejectReason.trim(),
          })
          .eq('id', item.transfer_id);

        // 2. Revert deposit status กลับเป็น expired
        if (item.deposit_id) {
          await supabase
            .from('deposits')
            .update({ status: 'expired' })
            .eq('id', item.deposit_id)
            .eq('status', 'transfer_pending');
        }
      }

      // 3. อัพเดท action card metadata
      const updatedMeta: TransferCardMetadata = {
        ...meta,
        status: 'rejected',
        rejected_by: currentUserId,
        rejected_by_name: currentUserName,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectReason.trim(),
      };

      await supabase
        .from('chat_messages')
        .update({ metadata: updatedMeta })
        .eq('id', message.id);

      const updated: ChatMessage = { ...message, metadata: updatedMeta };
      updateMessage(updated);

      // 4. Broadcast update
      await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
        type: 'message_updated',
        message: updated,
      } as unknown as Record<string, unknown>);

      // 5. ส่ง system message กลับไปห้องสาขาต้นทาง
      const itemNames = meta.items.map((i) => i.product_name).join(', ');
      notifyChatTransferRejected(meta.from_store_id, {
        transfer_code: meta.transfer_code,
        product_name: itemNames.length > 50 ? `${meta.total_items} รายการ` : itemNames,
        rejected_by_name: currentUserName,
        reason: rejectReason.trim(),
      });

      setShowRejectForm(false);
    } catch (err) {
      console.error('[TransferCard] handleReject error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-2 flex justify-center">
      <div
        className={cn(
          'w-full max-w-[90%] rounded-xl border p-3 shadow-sm',
          PRIORITY_STYLES[meta.priority] || PRIORITY_STYLES.normal
        )}
      >
        {/* ==========================================
            Header
            ========================================== */}
        <div className="mb-2 flex items-center gap-2">
          {meta.priority === 'urgent' && (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          )}
          <Truck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <span className="text-xs font-bold text-gray-900 dark:text-white">
            โอนสต๊อกเข้าคลังกลาง
          </span>
          <span className="text-xs text-gray-400">
            {meta.transfer_code}
          </span>
        </div>

        {/* ==========================================
            Batch Summary
            ========================================== */}
        <div className="mb-3 space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <Store className="h-3.5 w-3.5" />
            <span>จากสาขา: <strong>{meta.from_store_name}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <Package className="h-3.5 w-3.5" />
            <span>{meta.total_items} รายการ, {meta.total_quantity} ขวด</span>
          </div>
          {meta.submitted_by_name && (
            <p className="text-xs text-gray-400">
              ส่งโดย {meta.submitted_by_name}
              {meta.submitted_at && (
                <> เมื่อ {new Date(meta.submitted_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</>
              )}
            </p>
          )}
          {meta.notes && (
            <p className="text-xs italic text-gray-400">"{meta.notes}"</p>
          )}
        </div>

        {/* ==========================================
            Items List (expandable)
            ========================================== */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowItems(!showItems)}
            className="flex w-full items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:bg-gray-700/30 dark:text-gray-300 dark:hover:bg-gray-700/50"
          >
            {showItems ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            ดูรายการสินค้า ({meta.total_items})
          </button>

          {showItems && (
            <div className="mt-1.5 space-y-1 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/30">
              {meta.items.map((item, idx) => (
                <div
                  key={item.transfer_id || idx}
                  className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1 last:border-0 last:pb-0 dark:border-gray-600/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">
                      {item.product_name}
                    </p>
                    {item.customer_name && (
                      <p className="truncate text-[11px] text-gray-400">
                        {item.customer_name} {item.deposit_code ? `(${item.deposit_code})` : ''}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                    x{item.quantity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* รูปนำส่งจากสาขา */}
        {meta.photo_url && (
          <div className="mb-3">
            <p className="mb-1 text-[11px] font-medium text-gray-400">รูปนำส่ง</p>
            <div className="overflow-hidden rounded-lg">
              <img
                src={meta.photo_url}
                alt="รูปนำส่ง"
                className="w-full max-h-32 object-cover"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {/* ==========================================
            STATUS: PENDING — ปุ่มยืนยันรับ / ปฏิเสธ
            ========================================== */}
        {isPending && !showRejectForm && (
          <div className="space-y-2">
            <PhotoUpload
              value={photoUrl}
              onChange={setPhotoUrl}
              folder="hq-received"
              placeholder="ถ่ายรูปยืนยันรับสินค้า"
              compact
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="หมายเหตุ (ไม่บังคับ)"
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                icon={<CheckCircle className="h-3.5 w-3.5" />}
                isLoading={loading}
                disabled={!photoUrl}
                onClick={handleReceive}
              >
                {photoUrl ? `ยืนยันรับ ${meta.total_items} รายการ` : 'ถ่ายรูปก่อนยืนยัน'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                icon={<XCircle className="h-3.5 w-3.5" />}
                onClick={() => setShowRejectForm(true)}
              >
                ปฏิเสธ
              </Button>
            </div>
            {!photoUrl && (
              <p className="text-center text-[11px] text-amber-600 dark:text-amber-400">
                * ต้องถ่ายรูปยืนยันก่อนรับสินค้า
              </p>
            )}
          </div>
        )}

        {/* ==========================================
            REJECT FORM
            ========================================== */}
        {isPending && showRejectForm && (
          <div className="space-y-2">
            <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
              <p className="text-xs font-medium text-red-700 dark:text-red-300">
                ปฏิเสธการโอน {meta.transfer_code}
              </p>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="เหตุผลที่ปฏิเสธ (จำเป็น)"
              rows={2}
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300 dark:border-red-800 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
              >
                ยกเลิก
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="flex-1 bg-red-600 hover:bg-red-700"
                icon={<XCircle className="h-3.5 w-3.5" />}
                isLoading={loading}
                disabled={!rejectReason.trim()}
                onClick={handleReject}
              >
                ยืนยันปฏิเสธ
              </Button>
            </div>
          </div>
        )}

        {/* ==========================================
            STATUS: RECEIVED
            ========================================== */}
        {isReceived && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                รับเข้าคลังแล้ว
              </span>
              {meta.received_by_name && (
                <span className="text-xs text-emerald-500/70">
                  โดย {meta.received_by_name}
                </span>
              )}
              {meta.received_at && (
                <span className="ml-auto text-xs text-emerald-500/70">
                  {new Date(meta.received_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            {meta.receive_photo_url && (
              <div className="overflow-hidden rounded-lg">
                <p className="mb-1 text-[11px] font-medium text-gray-400">รูปยืนยันรับ</p>
                <img
                  src={meta.receive_photo_url}
                  alt="รูปยืนยันรับ"
                  className="w-full max-h-36 object-cover sm:max-h-48"
                  loading="lazy"
                />
              </div>
            )}
            {meta.receive_notes && (
              <p className="text-xs italic text-gray-400">"{meta.receive_notes}"</p>
            )}
            <button
              onClick={() => router.push('/hq-warehouse')}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-50 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:hover:bg-orange-900/30"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              ไปหน้าคลังกลาง
            </button>
          </div>
        )}

        {/* ==========================================
            STATUS: REJECTED
            ========================================== */}
        {isRejected && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-xs font-medium text-red-700 dark:text-red-300">
                ปฏิเสธแล้ว
              </span>
              {meta.rejected_by_name && (
                <span className="text-xs text-red-500/70">
                  โดย {meta.rejected_by_name}
                </span>
              )}
            </div>
            {meta.rejection_reason && (
              <p className="text-xs text-red-600 dark:text-red-400">
                เหตุผล: {meta.rejection_reason}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
