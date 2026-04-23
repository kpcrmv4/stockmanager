/**
 * Chat Bot Helper
 *
 * ส่ง Action Card / Bot message เข้าห้องแชทสาขา
 * เรียกใช้จาก server-side (API routes, server actions)
 */

import type { ActionCardMetadata } from '@/types/chat';

const BOT_API_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/chat/bot-message`;

interface SendBotMessageParams {
  storeId: string;
  type: 'text' | 'action_card' | 'system';
  content: string;
  metadata?: ActionCardMetadata | Record<string, unknown> | null;
}

/**
 * ส่ง bot message ไปห้องแชทของสาขา
 */
export async function sendBotMessage(params: SendBotMessageParams): Promise<boolean> {
  try {
    console.log('[Chat Bot] sendBotMessage →', {
      url: BOT_API_URL,
      storeId: params.storeId,
      type: params.type,
      contentPreview: params.content?.slice(0, 80),
      hasCronSecret: !!process.env.CRON_SECRET,
      hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
    });

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
      console.error('[Chat Bot] sendBotMessage HTTP error:', {
        status: res.status,
        statusText: res.statusText,
        body: errorBody,
      });
      return false;
    }

    const result = await res.json();
    console.log('[Chat Bot] sendBotMessage success:', result);
    return true;
  } catch (error) {
    console.error('[Chat Bot] sendBotMessage failed:', error);
    return false;
  }
}

// ==========================================
// Pre-built Action Card builders
// ==========================================

/**
 * สร้าง Action Card สำหรับรายการฝากใหม่
 */
export function buildDepositActionCard(deposit: {
  id: string;
  deposit_code: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  table_number?: string | null;
  notes?: string | null;
}): SendBotMessageParams & { storeId: string } {
  const meta: ActionCardMetadata = {
    action_type: 'deposit_claim',
    reference_id: deposit.deposit_code,
    reference_table: 'deposits',
    status: 'pending',
    claimed_by: null,
    claimed_by_name: null,
    claimed_at: null,
    completed_at: null,
    timeout_minutes: 15,
    priority: 'normal',
    summary: {
      customer: deposit.customer_name,
      items: `${deposit.product_name} x${deposit.quantity}`,
      note: deposit.table_number
        ? `โต๊ะ ${deposit.table_number}`
        : deposit.notes || undefined,
    },
  };

  return {
    storeId: '', // caller must set
    type: 'action_card',
    content: `รายการฝากใหม่ ${deposit.deposit_code} — ${deposit.customer_name}`,
    metadata: meta,
  };
}

/**
 * สร้าง Action Card สำหรับคำขอเบิก
 */
export function buildWithdrawalActionCard(withdrawal: {
  id: string;
  deposit_code: string;
  customer_name: string;
  product_name: string;
  requested_qty: number;
  table_number?: string | null;
  notes?: string | null;
}): Omit<SendBotMessageParams, 'storeId'> {
  const meta: ActionCardMetadata = {
    action_type: 'withdrawal_claim',
    reference_id: withdrawal.deposit_code,
    reference_table: 'withdrawals',
    status: 'pending',
    claimed_by: null,
    claimed_by_name: null,
    claimed_at: null,
    completed_at: null,
    timeout_minutes: 15,
    priority: 'normal',
    summary: {
      customer: withdrawal.customer_name,
      items: `${withdrawal.product_name} x${withdrawal.requested_qty}`,
      note: withdrawal.table_number
        ? `โต๊ะ ${withdrawal.table_number}`
        : withdrawal.notes || undefined,
    },
  };

  return {
    type: 'action_card',
    content: `คำขอเบิกเหล้า ${withdrawal.deposit_code} — ${withdrawal.customer_name}`,
    metadata: meta,
  };
}

/**
 * สร้าง Action Card สำหรับสต๊อกไม่ตรง
 */
export function buildStockExplainActionCard(comparison: {
  comp_date: string;
  store_id: string;
  discrepancy_count: number;
  items_preview: string;
}): Omit<SendBotMessageParams, 'storeId'> {
  const meta: ActionCardMetadata = {
    action_type: 'stock_explain',
    reference_id: comparison.comp_date,
    reference_table: 'comparisons',
    status: 'pending',
    claimed_by: null,
    claimed_by_name: null,
    claimed_at: null,
    completed_at: null,
    timeout_minutes: 60, // สต๊อกให้เวลามากกว่า
    priority: 'normal',
    summary: {
      items: `${comparison.discrepancy_count} รายการไม่ตรง`,
      note: comparison.items_preview,
    },
  };

  return {
    type: 'action_card',
    content: `สต๊อกไม่ตรง ${comparison.discrepancy_count} รายการ — วันที่ ${comparison.comp_date}`,
    metadata: meta,
  };
}

/**
 * สร้าง Action Card สำหรับคำขอยืมสินค้า
 *
 * `reference_id` = borrow.id (UUID) → ใช้สำหรับเรียก API
 * `summary.code` = borrow_code (BRW-...) → ใช้สำหรับแสดงผลใน UI
 */
export function buildBorrowActionCard(borrow: {
  id: string;
  borrow_code?: string | null;
  from_store_name: string;
  items_preview: string;
  notes?: string | null;
}): Omit<SendBotMessageParams, 'storeId'> {
  const meta: ActionCardMetadata = {
    action_type: 'borrow_approve',
    reference_id: borrow.id,
    reference_table: 'borrows',
    status: 'pending',
    claimed_by: null,
    claimed_by_name: null,
    claimed_at: null,
    completed_at: null,
    timeout_minutes: 30,
    priority: 'normal',
    summary: {
      customer: borrow.from_store_name,
      items: borrow.items_preview,
      note: borrow.notes || undefined,
      code: borrow.borrow_code || undefined,
    },
  };

  const codeSuffix = borrow.borrow_code ? ` ${borrow.borrow_code}` : '';
  return {
    type: 'action_card',
    content: `คำขอยืมสินค้า${codeSuffix} จาก ${borrow.from_store_name}`,
    metadata: meta,
  };
}
