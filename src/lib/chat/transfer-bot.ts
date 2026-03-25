/**
 * Transfer Bot Helper — Server-side
 *
 * ส่ง Transfer Action Card / system message เข้าห้องแชทคลังกลาง
 * เรียกใช้จาก server-side (API routes, server actions)
 *
 * ออกแบบเฉพาะสำหรับระบบโอนสต๊อก — ไม่ใช้ร่วมกับ bot.ts
 */

import type { TransferCardMetadata, TransferCardItem } from '@/types/transfer-chat';

const BOT_API_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/chat/bot-message`;

interface TransferBotMessageParams {
  storeId: string;
  type: 'action_card' | 'system';
  content: string;
  metadata?: TransferCardMetadata | null;
}

/**
 * ส่ง bot message ไปห้องแชทของสาขา (ใช้ CRON_SECRET)
 */
export async function sendTransferBotMessage(params: TransferBotMessageParams): Promise<boolean> {
  try {
    const res = await fetch(BOT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({
        store_id: params.storeId,
        type: params.type,
        content: params.content,
        metadata: params.metadata || null,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error('[Transfer Bot] sendTransferBotMessage HTTP error:', {
        status: res.status,
        body: errorBody,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Transfer Bot] sendTransferBotMessage failed:', error);
    return false;
  }
}

/**
 * สร้าง Transfer Action Card สำหรับส่งไปห้อง HQ
 * เมื่อสาขาสร้าง batch โอนสต๊อกใหม่
 */
export function buildTransferReceiveCard(batch: {
  transfer_code: string;
  from_store_id: string;
  from_store_name: string;
  items: TransferCardItem[];
  submitted_by: string;
  submitted_by_name: string;
  photo_url: string | null;
  notes: string | null;
}): Omit<TransferBotMessageParams, 'storeId'> {
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

  return {
    type: 'action_card',
    content: `📦 โอนสต๊อกจาก ${batch.from_store_name} (${batch.transfer_code}) — ${batch.items.length} รายการ, ${totalQty} ขวด\n${itemsPreview}`,
    metadata: meta,
  };
}
