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
      table_number: deposit.table_number || undefined,
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
      table_number: deposit.table_number || undefined,
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
    withdrawal_type?: 'in_store' | 'take_home' | null;
    /** When provided, surfaced in the items field so the bar sees
     *  exactly which bottles to physically pull (e.g. "1/3, 3/3"). */
    bottle_labels?: string[];
  }
): void {
  const bottleSuffix = withdrawal.bottle_labels && withdrawal.bottle_labels.length > 0
    ? ` (${withdrawal.bottle_labels.join(', ')})`
    : '';
  // Match buildWithdrawalActionCard (server side): emoji-tagged type
  // label in the note, table number rendered separately as a header
  // badge by the action-card UI.
  const isTakeHome = withdrawal.withdrawal_type === 'take_home';
  const whereNote = isTakeHome ? '🏠 เบิกกลับบ้าน' : '🍷 ดื่มที่ร้าน';
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
      items: `${withdrawal.product_name} x${withdrawal.requested_qty}${bottleSuffix}`,
      table_number: withdrawal.table_number || undefined,
      withdrawal_type: withdrawal.withdrawal_type || undefined,
      note: whereNote,
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
 * Drop a pre-completed withdrawal card into chat — used by the
 * /deposit/withdrawals "เบิกใหม่" manual flow where the bar staff
 * processes a walk-in directly without going through a pending
 * request first. Lands in the รายการงาน tab as a "เสร็จสิ้น" card so
 * the same audit trail exists as customer-initiated withdrawals.
 */
export function notifyChatWithdrawalCompletedAsCard(
  storeId: string,
  withdrawal: {
    deposit_code: string;
    customer_name: string;
    product_name: string;
    actual_qty: number;
    table_number?: string | null;
    bottle_labels?: string[];
    completed_by: string;
    completed_by_name: string;
  }
): void {
  const bottleSuffix = withdrawal.bottle_labels && withdrawal.bottle_labels.length > 0
    ? ` (${withdrawal.bottle_labels.join(', ')})`
    : '';
  const now = new Date().toISOString();
  const meta: ActionCardMetadata = {
    action_type: 'withdrawal_claim',
    reference_id: withdrawal.deposit_code,
    reference_table: 'withdrawals',
    status: 'completed',
    claimed_by: withdrawal.completed_by,
    claimed_by_name: withdrawal.completed_by_name,
    claimed_at: now,
    completed_at: now,
    timeout_minutes: 15,
    priority: 'normal',
    summary: {
      customer: withdrawal.customer_name,
      items: `${withdrawal.product_name} x${withdrawal.actual_qty}${bottleSuffix}`,
      table_number: withdrawal.table_number || undefined,
      note: withdrawal.table_number ? `โต๊ะ ${withdrawal.table_number}` : undefined,
    },
  };
  sendChatBotMessage({
    storeId,
    type: 'action_card',
    content: `เบิกเหล้า ${withdrawal.deposit_code} — ${withdrawal.customer_name}`,
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
  /** Patch merged into metadata.summary — used to attribute a
   *  cancellation to the right actor + carry the reason. */
  summaryUpdates?: Record<string, unknown>;
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
      summary_updates: params.summaryUpdates,
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
 * Post a system message to the store chat summarising a batch of stock
 * explanations the staff just submitted.
 *
 * Format: "📝 <staff_name> ชี้แจงผลต่าง <count> รายการ ของวันที่ <date>"
 *
 * Earlier this fired once per product (one chat line per row) which spammed
 * the store chat — and the message text was per-row data the owner already
 * sees in the approval queue. Owners are notified separately via push +
 * the approval inbox; the store chat just needs a heads-up.
 */
export function notifyChatExplanationSubmitted(
  storeId: string,
  data: {
    submitted_by_name: string;
    count: number;
    comp_date: string;
  }
): void {
  // Render the date as "26 เม.ย. 2569" for chat readability.
  let displayDate = data.comp_date;
  try {
    const d = new Date(data.comp_date);
    if (!Number.isNaN(d.getTime())) {
      displayDate = d.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Bangkok',
      });
    }
  } catch { /* fall back to ISO */ }
  sendChatBotMessage({
    storeId,
    type: 'system',
    content: `📝 ${data.submitted_by_name} ชี้แจงผลต่าง ${data.count} รายการ ของวันที่ ${displayDate}`,
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

/**
 * Mark the open `stock_approve` action card for (store, comp_date) as completed.
 *
 * Called from /stock/approval after the owner finishes processing all
 * explanations for a date. If no remaining 'explained' rows exist for the date,
 * the stock_approve card is closed.
 */
export async function maybeCompleteStockApproveCard(params: {
  storeId: string;
  compDate: string;
  byUserId: string;
  byUserName: string;
}): Promise<void> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    // 1. Any remaining 'explained' rows for this date?
    const { count: remaining } = await supabase
      .from('comparisons')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', params.storeId)
      .eq('comp_date', params.compDate)
      .eq('status', 'explained');
    if ((remaining ?? 0) > 0) return; // still pending — keep card open

    // 2. Find the room for this store
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('store_id', params.storeId)
      .eq('type', 'store')
      .maybeSingle();
    if (!room) return;

    // 3. Find open stock_approve cards for this comp_date
    const { data: cards } = await supabase
      .from('chat_messages')
      .select('id, metadata')
      .eq('room_id', room.id)
      .eq('type', 'action_card')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!cards) return;

    for (const card of cards) {
      const meta = card.metadata as ActionCardMetadata | null;
      if (
        !meta ||
        meta.action_type !== 'stock_approve' ||
        meta.reference_id !== params.compDate ||
        meta.status === 'completed'
      ) continue;

      const newMeta: ActionCardMetadata = {
        ...meta,
        status: 'completed',
        claimed_by: params.byUserId,
        claimed_by_name: params.byUserName,
        completed_at: new Date().toISOString(),
      };
      await supabase
        .from('chat_messages')
        .update({ metadata: newMeta })
        .eq('id', card.id);
    }
  } catch (err) {
    console.error('[Chat] maybeCompleteStockApproveCard failed:', err);
  }
}

