/**
 * Transfer Bot Helper — Client-side
 *
 * Fire-and-forget — ส่ง transfer action card / system message เข้าห้องแชท
 * เรียกใช้จาก client components (transfer/page, hq-warehouse/page)
 *
 * ออกแบบเฉพาะสำหรับระบบโอนสต๊อก — ไม่ใช้ร่วมกับ bot-client.ts
 */

import type { TransferCardMetadata, TransferCardItem } from '@/types/transfer-chat';

interface TransferBotMessageParams {
  storeId: string;
  type: 'action_card' | 'system';
  content: string;
  metadata?: TransferCardMetadata | null;
}

/**
 * Fire-and-forget: ส่ง transfer bot message (ใช้ session cookie)
 */
function sendTransferChatMessage(params: TransferBotMessageParams): void {
  fetch('/api/chat/bot-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_id: params.storeId,
      type: params.type,
      content: params.content,
      metadata: params.metadata || null,
    }),
  }).catch((err) => console.error('[Transfer Bot Client] failed:', err));
}

// ==========================================
// Transfer Action Card — ส่งไป HQ room
// ==========================================

/**
 * ส่ง Transfer Action Card ไปห้อง HQ เมื่อสาขาสร้าง batch โอนสต๊อก
 */
export function notifyChatTransferBatch(
  centralStoreId: string,
  batch: {
    transfer_code: string;
    from_store_id: string;
    from_store_name: string;
    items: TransferCardItem[];
    submitted_by: string;
    submitted_by_name: string;
    photo_url: string | null;
    notes: string | null;
  }
): void {
  const totalQty = batch.items.reduce((sum, i) => sum + i.quantity, 0);

  const meta: TransferCardMetadata = {
    action_type: 'transfer_receive',
    transfer_code: batch.transfer_code,
    from_store_id: batch.from_store_id,
    from_store_name: batch.from_store_name,
    status: 'pending',
    priority: 'normal',
    timeout_minutes: 120,

    items: batch.items,
    total_items: batch.items.length,
    total_quantity: totalQty,

    submitted_by: batch.submitted_by,
    submitted_by_name: batch.submitted_by_name,
    submitted_at: new Date().toISOString(),
    photo_url: batch.photo_url,
    notes: batch.notes,

    received_by: null,
    received_by_name: null,
    received_at: null,
    receive_photo_url: null,
    receive_notes: null,

    rejected_by: null,
    rejected_by_name: null,
    rejected_at: null,
    rejection_reason: null,
  };

  const itemsPreview = batch.items.length <= 3
    ? batch.items.map((i) => i.product_name).join(', ')
    : `${batch.items.slice(0, 2).map((i) => i.product_name).join(', ')} +${batch.items.length - 2} รายการ`;

  sendTransferChatMessage({
    storeId: centralStoreId,
    type: 'action_card',
    content: `📦 โอนสต๊อกจาก ${batch.from_store_name} (${batch.transfer_code}) — ${batch.items.length} รายการ, ${totalQty} ขวด\n${itemsPreview}`,
    metadata: meta,
  });
}

// ==========================================
// System Messages — ส่งกลับไป Store room
// ==========================================

/**
 * ส่ง system message ไปห้องสาขาต้นทาง เมื่อ HQ ยืนยันรับโอนแล้ว
 */
export function notifyChatTransferReceived(
  fromStoreId: string,
  data: {
    transfer_code: string;
    item_count: number;
    received_by_name: string;
  }
): void {
  sendTransferChatMessage({
    storeId: fromStoreId,
    type: 'system',
    content: `✅ คลังกลางรับโอน ${data.transfer_code} แล้ว (${data.item_count} รายการ) — รับโดย ${data.received_by_name}`,
  });
}

/**
 * ส่ง system message ไปห้องสาขาต้นทาง เมื่อ HQ ปฏิเสธโอน
 */
export function notifyChatTransferRejected(
  fromStoreId: string,
  data: {
    transfer_code: string;
    product_name: string;
    rejected_by_name: string;
    reason: string;
  }
): void {
  sendTransferChatMessage({
    storeId: fromStoreId,
    type: 'system',
    content: `❌ คลังกลางปฏิเสธโอน ${data.product_name} (${data.transfer_code}) — ${data.reason} — โดย ${data.rejected_by_name}`,
  });
}

/**
 * ส่ง system message ไปห้อง HQ เมื่อจำหน่ายสินค้าออกจากคลังกลาง
 */
export function notifyChatHqWithdrawal(
  centralStoreId: string,
  data: {
    product_name: string;
    customer_name: string | null;
    from_store_name: string;
    withdrawn_by_name: string;
    notes: string | null;
  }
): void {
  const customer = data.customer_name ? ` ของ ${data.customer_name}` : '';
  const notes = data.notes ? ` — ${data.notes}` : '';
  sendTransferChatMessage({
    storeId: centralStoreId,
    type: 'system',
    content: `📤 ${data.withdrawn_by_name} จำหน่าย ${data.product_name}${customer} (จาก ${data.from_store_name}) ออกจากคลังกลาง${notes}`,
  });
}

/**
 * ส่ง system message ไปห้องสาขา เมื่อสาขาส่งโอน (เหมือนเดิม แต่ใช้ module ใหม่)
 */
export function notifyChatTransferSubmitted(
  storeId: string,
  transfer: {
    transfer_code: string;
    deposit_count: number;
    submitted_by_name: string;
  }
): void {
  sendTransferChatMessage({
    storeId,
    type: 'system',
    content: `📦 ${transfer.submitted_by_name} ส่งโอน ${transfer.deposit_count} รายการ ไปคลังกลาง (${transfer.transfer_code})`,
  });
}
