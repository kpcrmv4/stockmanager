/**
 * Client-side Chat Bot Helper
 *
 * Fire-and-forget — ส่ง bot message / action card เข้าห้องแชทสาขา
 * เรียกใช้จาก client components (deposit-form, bar-approval, etc.)
 * ใช้ session auth แทน CRON_SECRET
 */

import type { ActionCardMetadata } from '@/types/chat';

interface SendBotMessageParams {
  storeId: string;
  type: 'text' | 'action_card' | 'system';
  content: string;
  metadata?: ActionCardMetadata | null;
}

/**
 * Fire-and-forget: ส่ง bot message ไปห้องแชทของสาขา
 * ใช้ session cookie สำหรับ auth (ไม่ต้องใช้ CRON_SECRET)
 */
export function sendChatBotMessage(params: SendBotMessageParams): void {
  fetch('/api/chat/bot-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_id: params.storeId,
      type: params.type,
      content: params.content,
      metadata: params.metadata || null,
    }),
  }).catch((err) => console.error('[Chat Bot Client] sendChatBotMessage failed:', err));
}

// ==========================================
// Pre-built Action Card builders (client-side)
// ==========================================

/**
 * ส่ง Action Card ฝากเหล้าใหม่เข้าห้องแชทสาขา
 */
export function notifyChatNewDeposit(
  storeId: string,
  deposit: {
    deposit_code: string;
    customer_name: string;
    product_name: string;
    quantity: number;
    table_number?: string | null;
    notes?: string | null;
  }
): void {
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

  sendChatBotMessage({
    storeId,
    type: 'action_card',
    content: `รายการฝากใหม่ ${deposit.deposit_code} — ${deposit.customer_name}`,
    metadata: meta,
  });
}

/**
 * ส่ง Action Card ฝากเหล้ารอบาร์ยืนยัน (staff สร้าง manual)
 * ข้ามขั้นตอน "รอรับ" ไปเป็น "รอบาร์ยืนยัน" ทันที
 */
export function notifyChatNewDepositForBar(
  storeId: string,
  deposit: {
    deposit_code: string;
    customer_name: string;
    product_name: string;
    quantity: number;
    table_number?: string | null;
    notes?: string | null;
    received_by_name?: string;
  }
): void {
  const meta: ActionCardMetadata = {
    action_type: 'deposit_claim',
    reference_id: deposit.deposit_code,
    reference_table: 'deposits',
    status: 'pending_bar',
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
      received_by: deposit.received_by_name,
    },
  };

  sendChatBotMessage({
    storeId,
    type: 'action_card',
    content: `รอบาร์ยืนยัน ${deposit.deposit_code} — ${deposit.customer_name} (${deposit.product_name})`,
    metadata: meta,
  });
}

/**
 * ส่ง Action Card คำขอเบิกเหล้าเข้าห้องแชทสาขา
 */
export function notifyChatWithdrawalRequest(
  storeId: string,
  withdrawal: {
    deposit_code: string;
    customer_name: string;
    product_name: string;
    requested_qty: number;
    table_number?: string | null;
    notes?: string | null;
  }
): void {
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

  sendChatBotMessage({
    storeId,
    type: 'action_card',
    content: `คำขอเบิกเหล้า ${withdrawal.deposit_code} — ${withdrawal.customer_name}`,
    metadata: meta,
  });
}

/**
 * Fire-and-forget: sync action card status in chat when processed outside of chat
 * (e.g. withdrawal completed/rejected on the withdrawals page, deposit confirmed on bar-approval page)
 */
export function syncChatActionCardStatus(params: {
  storeId: string;
  referenceId: string;
  actionType: string;
  newStatus: string;
  completedBy?: string;
  completedByName?: string;
}): void {
  fetch('/api/chat/sync-action-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_id: params.storeId,
      reference_id: params.referenceId,
      action_type: params.actionType,
      new_status: params.newStatus,
      completed_by: params.completedBy,
      completed_by_name: params.completedByName,
    }),
  }).catch((err) => console.error('[Chat Bot Client] syncChatActionCardStatus failed:', err));
}

/**
 * ส่ง system message ว่าฝากเหล้ายืนยันแล้ว
 */
export function notifyChatDepositConfirmed(
  storeId: string,
  deposit: {
    deposit_code: string;
    customer_name: string;
    product_name: string;
    quantity: number;
    confirmed_by_name: string;
  }
): void {
  sendChatBotMessage({
    storeId,
    type: 'system',
    content: `✓ ${deposit.confirmed_by_name} ยืนยันรับฝาก ${deposit.product_name} x${deposit.quantity} (${deposit.deposit_code}) — ${deposit.customer_name}`,
  });
}

/**
 * ส่ง system message ว่าเบิกเหล้าเสร็จแล้ว
 */
export function notifyChatWithdrawalCompleted(
  storeId: string,
  withdrawal: {
    deposit_code?: string;
    customer_name: string;
    product_name: string;
    actual_qty: number;
    processed_by_name: string;
  }
): void {
  sendChatBotMessage({
    storeId,
    type: 'system',
    content: `✓ ${withdrawal.processed_by_name} เบิก ${withdrawal.product_name} x${withdrawal.actual_qty} ให้ ${withdrawal.customer_name} เรียบร้อย`,
  });
}

/**
 * ส่ง system message ว่าสร้างรายการโอนสินค้าแล้ว
 */
export function notifyChatTransferCreated(
  storeId: string,
  transfer: {
    transfer_code: string;
    deposit_count: number;
    submitted_by_name: string;
  }
): void {
  sendChatBotMessage({
    storeId,
    type: 'system',
    content: `📦 ${transfer.submitted_by_name} ส่งโอน ${transfer.deposit_count} รายการ ไปคลังกลาง (${transfer.transfer_code})`,
  });
}

/**
 * ส่ง system message ว่ามีคำชี้แจงสต๊อกใหม่
 */
export function notifyChatExplanationSubmitted(
  storeId: string,
  data: {
    product_name: string;
    difference: number;
    submitted_by_name: string;
  }
): void {
  sendChatBotMessage({
    storeId,
    type: 'system',
    content: `📝 ${data.submitted_by_name} ส่งคำชี้แจง "${data.product_name}" (ส่วนต่าง ${data.difference > 0 ? '+' : ''}${data.difference})`,
  });
}

/**
 * ส่ง system message ว่า owner อนุมัติ/ปฏิเสธคำชี้แจง
 */
export function notifyChatApprovalResult(
  storeId: string,
  data: {
    product_name: string;
    result: 'approved' | 'rejected';
    approved_by_name: string;
    reason?: string | null;
  }
): void {
  const status = data.result === 'approved' ? '✅ อนุมัติ' : '❌ ปฏิเสธ';
  const reason = data.result === 'rejected' && data.reason ? ` — ${data.reason}` : '';
  sendChatBotMessage({
    storeId,
    type: 'system',
    content: `${status} คำชี้แจง "${data.product_name}" โดย ${data.approved_by_name}${reason}`,
  });
}
