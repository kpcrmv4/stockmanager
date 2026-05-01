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
  ArrowRight,
  ScanLine,
  ClipboardList,
  MapPin,
  Search,
  X,
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
  onStatusChange?: (action?: 'claim' | 'release' | 'complete' | 'reject') => void;
  /**
   * When true the card renders in read-only "board" mode: no claim
   * button, no inline fill form, no bar-confirm form. Used by
   * TransactionBoard (รายการงาน) so a card claimed by someone else
   * doesn't expose action UI to spectators. Action UI stays available
   * in MyTasksBoard (งานของฉัน) where the user is the claimer.
   */
  hideActions?: boolean;
}

interface ProductOption {
  product_name: string;
  category: string | null;
}

interface LiquorItem {
  productName: string;
  category: string;
  quantity: string;
  searchQuery: string;
  showDropdown: boolean;
}

const EMPTY_LIQUOR_ITEM: LiquorItem = {
  productName: '',
  category: '',
  quantity: '1',
  searchQuery: '',
  showDropdown: false,
};

/**
 * Extract a table number from an action card summary. Newer cards store
 * `table_number` directly; older cards only have a free-form `note` like
 * "โต๊ะ 25" so parse that as a fallback.
 */
function getTableNumber(summary: Record<string, unknown> | undefined): string | null {
  if (!summary) return null;
  const direct = summary.table_number;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const note = summary.note;
  if (typeof note === 'string') {
    const m = note.trim().match(/^โต๊ะ\s*(.+?)$/);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

const ACTION_TYPE_CONFIG: Record<string, { icon: typeof Wine; color: string; label: string }> = {
  deposit_claim: { icon: Wine, color: 'emerald', label: 'ฝากเหล้า' },
  withdrawal_claim: { icon: Package, color: 'blue', label: 'คำขอเบิกเหล้า' },
  stock_explain: { icon: ClipboardCheck, color: 'amber', label: 'สต๊อกไม่ตรง' },
  stock_supplementary: { icon: ScanLine, color: 'sky', label: 'รายการต้องนับเพิ่ม' },
  stock_approve: { icon: ClipboardList, color: 'violet', label: 'รออนุมัติคำชี้แจง' },
  borrow_approve: { icon: Repeat, color: 'violet', label: 'คำขอยืมสินค้า' },
  borrow_return_confirm: { icon: Repeat, color: 'teal', label: 'รับคืนสินค้ายืม' },
  transfer_receive: { icon: Package, color: 'orange', label: 'โอนสต๊อกเข้าคลังกลาง' },
  generic: { icon: ClipboardCheck, color: 'gray', label: 'งานใหม่' },
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
  normal: 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
  low: 'border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
};

export const ActionCardMessage = memo(function ActionCardMessage({ message, currentUserId, currentUserName, currentUserRole, roomId, storeId, onStatusChange, hideActions = false }: ActionCardMessageProps) {
  const [loading, setLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Per-bottle % readings the bar enters at confirm time. Slot count
  // tracks barConfirmQty (kept in sync via useEffect below). Each slot
  // is a string so the placeholder shows when nothing has been typed.
  const [barConfirmQty, setBarConfirmQty] = useState('');
  const [barConfirmBottlePercents, setBarConfirmBottlePercents] = useState<string[]>([]);
  // Customer LIFF flow stage-2: staff fills product name + quantity when
  // physically receiving the bottle. Mirrors the deposit-form multi-item
  // input so a single LINE request can be split into N bottles/products.
  const [liquorItems, setLiquorItems] = useState<LiquorItem[]>([{ ...EMPTY_LIQUOR_ITEM }]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
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
        hideActions={hideActions}
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
  const summaryQty = (() => {
    const raw = (meta.summary as Record<string, unknown> | undefined)?.quantity;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''));
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();

  // When the bar's qty input changes, keep the per-bottle percent slots
  // the same length so each bottle has its own input.
  useEffect(() => {
    const qty = parseInt(barConfirmQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setBarConfirmBottlePercents((prev) => {
      if (prev.length === qty) return prev;
      const next = [...prev];
      while (next.length < qty) next.push('');
      next.length = qty;
      return next;
    });
  }, [barConfirmQty]);

  // Pre-fetch the store's products once for the LIFF deposit autocomplete.
  // Only matters for from_customer deposit cards but cheap enough to do
  // unconditionally (small list, runs once per card mount with a store).
  const isFromCustomerDeposit = meta.action_type === 'deposit_claim'
    && (meta.summary as Record<string, unknown> | undefined)?.from_customer === true;
  useEffect(() => {
    if (!isFromCustomerDeposit || !storeId || productOptions.length > 0) return;
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from('products')
      .select('product_name, category')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('product_name')
      .then(({ data }) => {
        if (!cancelled && data) setProductOptions(data);
      });
    return () => { cancelled = true; };
  }, [isFromCustomerDeposit, storeId, productOptions.length]);
  const isWithdrawalCard = meta.action_type === 'withdrawal_claim';
  const canClaimBarStep = isPendingBar && isDepositCard
    && currentUserRole && ['bar', 'manager', 'owner'].includes(currentUserRole);
  // Withdrawal action cards: only bar/manager/owner can approve
  const canApproveWithdrawal = isWithdrawalCard && isPending
    && currentUserRole && ['bar', 'manager', 'owner'].includes(currentUserRole);

  // Stock card variants
  const isStockExplain = meta.action_type === 'stock_explain';
  const isStockSupplementary = meta.action_type === 'stock_supplementary';
  const isStockApprove = meta.action_type === 'stock_approve';
  const isAnyStockCard = isStockExplain || isStockSupplementary || isStockApprove;
  // Owner-level approval card visibility
  const canApproveStock =
    isStockApprove && isPending && currentUserRole &&
    ['owner', 'accountant', 'manager'].includes(currentUserRole);

  // Borrow return-receipt confirmation card (lender side)
  const isBorrowReturnConfirm = meta.action_type === 'borrow_return_confirm';

  // Borrow-specific status
  const isBorrow = meta.action_type === 'borrow_approve';
  const borrowStatus = meta.borrow_status || (isPending ? 'pending_approval' : undefined);

  // Stock-explain "เสร็จสิ้น" gate: live-check whether all comparisons for the
  // date have been approved. Until then, the staff cannot mark the card done.
  const [stockAllApproved, setStockAllApproved] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isStockExplain || !isClaimedByMe || !storeId) return;
    let cancelled = false;
    const supabase = createClient();
    const compDate =
      (meta.summary as { comp_date?: string } | undefined)?.comp_date ||
      meta.reference_id;
    void supabase
      .from('comparisons')
      .select('status', { count: 'exact', head: false })
      .eq('store_id', storeId)
      .eq('comp_date', compDate)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const allApproved = data.length > 0 && data.every((r) => r.status === 'approved');
        setStockAllApproved(allApproved);
      });
    return () => { cancelled = true; };
  }, [isStockExplain, isClaimedByMe, storeId, meta.reference_id, meta.summary]);

  // Stock-supplementary "เสร็จสิ้น" gate: live-check that all POS-only items
  // for the date now have a manual_count entry. Until then, can't mark done.
  const [supAllCounted, setSupAllCounted] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isStockSupplementary || !isClaimedByMe || !storeId) return;
    let cancelled = false;
    const supabase = createClient();
    const compDate =
      (meta.summary as { comp_date?: string } | undefined)?.comp_date ||
      meta.reference_id;
    void (async () => {
      // POS-only product codes = comparisons where manual_quantity IS NULL
      const { data: posOnly } = await supabase
        .from('comparisons')
        .select('product_code')
        .eq('store_id', storeId)
        .eq('comp_date', compDate)
        .is('manual_quantity', null);
      if (cancelled) return;
      if (!posOnly || posOnly.length === 0) { setSupAllCounted(true); return; }
      const codes = posOnly.map((r) => r.product_code);
      const { data: counted } = await supabase
        .from('manual_counts')
        .select('product_code')
        .eq('store_id', storeId)
        .eq('count_date', compDate)
        .in('product_code', codes);
      if (cancelled) return;
      const countedSet = new Set((counted || []).map((r) => r.product_code));
      setSupAllCounted(codes.every((c) => countedSet.has(c)));
    })();
    return () => { cancelled = true; };
  }, [isStockSupplementary, isClaimedByMe, storeId, meta.reference_id, meta.summary]);

  const completeDisabledReason: string | null = (() => {
    if (isStockExplain && stockAllApproved === false) return 'รอ Owner อนุมัติคำชี้แจงทั้งหมดก่อน';
    if (isStockSupplementary && supAllCounted === false) return 'ยังนับรายการเพิ่มไม่ครบ';
    return null;
  })();

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
        // Customer-LIFF cards arrive with placeholder product/qty. Staff
        // must fill those when physically receiving — the inputs are
        // surfaced in the stage-2 UI for `from_customer` cards.
        const isFromCustomer = (meta.summary as Record<string, unknown> | undefined)?.from_customer === true;

        // Validate + normalize the multi-item input. Each row needs a name
        // and a positive qty; first row drives the existing deposit row,
        // any extras spawn new deposit + chat-card pairs.
        const validItems = isFromCustomer
          ? liquorItems
              .map((it) => ({
                productName: it.productName.trim(),
                category: it.category.trim(),
                quantity: Number(it.quantity),
              }))
              .filter((it) => it.productName && Number.isFinite(it.quantity) && it.quantity > 0)
          : [];
        if (isFromCustomer && validItems.length === 0) {
          setLoading(false);
          return;
        }

        const firstItem = validItems[0];
        const productName = firstItem?.productName ?? '';
        const qty = firstItem?.quantity ?? 0;
        // Existing card represents row 1 only — extra rows spawn separate
        // deposits + cards below, so the items label here must show just
        // the first item to keep it in sync with what bar will verify.
        const firstItemLabel = firstItem ? `${firstItem.productName} x${firstItem.quantity}` : '';

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
            ...(isFromCustomer && {
              items: firstItemLabel,
              product_name: productName,
              quantity: qty,
            }),
          },
        };

        await supabase
          .from('chat_messages')
          .update({ metadata: newMeta })
          .eq('id', message.id);

        const updated: ChatMessage = { ...message, metadata: newMeta };
        updateMessage(updated);
        onStatusChange?.('complete');

        await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
          type: 'message_updated',
          message: updated,
        } as unknown as Record<string, unknown>);

        // Sync staff received info back to deposit record. For customer-LIFF
        // cards, also fill product_name/quantity, transition status from
        // pending_staff → pending_confirm, set expiry, and seed bottle rows
        // (the auto-bottle trigger fired with qty=0 placeholder so we now
        // create them manually). Items 2..N spawn additional deposits +
        // chat action cards mirroring the deposit-form multi-item flow.
        if (meta.reference_table === 'deposits' && meta.reference_id) {
          (async () => {
            const update: Record<string, unknown> = {
              received_by: currentUserId,
              received_photo_url: photoUrl || undefined,
            };
            if (isFromCustomer && firstItem) {
              update.product_name = productName;
              update.category = firstItem.category || null;
              update.quantity = qty;
              update.remaining_qty = qty;
              update.remaining_percent = 100;
              update.status = 'pending_confirm';
              const { expiryDateISO } = await import('@/lib/utils/date');
              update.expiry_date = expiryDateISO(30);
            }
            const { data: depositRow } = await supabase
              .from('deposits')
              .update(update)
              .eq('deposit_code', meta.reference_id)
              .select('id, store_id, customer_name, customer_phone, table_number, line_user_id, notes')
              .single();

            if (isFromCustomer && depositRow?.id) {
              const bottleRows = [];
              for (let i = 1; i <= qty; i++) {
                bottleRows.push({
                  deposit_id: depositRow.id,
                  bottle_no: i,
                  remaining_percent: 100,
                  status: 'in_store',
                });
              }
              if (bottleRows.length > 0) {
                await supabase.from('deposit_bottles').insert(bottleRows);
              }

              // Items 2..N → INSERT new pending_confirm deposits + post
              // separate "รอบาร์ยืนยัน" action cards so the bar can verify
              // each bottle group independently.
              if (validItems.length > 1) {
                const { expiryDateISO } = await import('@/lib/utils/date');
                const { data: storeRow } = await supabase
                  .from('stores')
                  .select('store_code')
                  .eq('id', depositRow.store_id)
                  .single();
                const storeCode = storeRow?.store_code || 'X';
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

                for (let i = 1; i < validItems.length; i++) {
                  const extra = validItems[i];
                  let randomPart = '';
                  for (let c = 0; c < 5; c++) {
                    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
                  }
                  const newCode = `DEP-${storeCode}-${randomPart}`;
                  const { error: insertErr } = await supabase.from('deposits').insert({
                    store_id: depositRow.store_id,
                    deposit_code: newCode,
                    line_user_id: depositRow.line_user_id,
                    customer_name: depositRow.customer_name,
                    customer_phone: depositRow.customer_phone,
                    product_name: extra.productName,
                    category: extra.category || null,
                    quantity: extra.quantity,
                    remaining_qty: extra.quantity,
                    remaining_percent: 100,
                    table_number: depositRow.table_number,
                    status: 'pending_confirm',
                    expiry_date: expiryDateISO(30),
                    received_by: currentUserId,
                    received_photo_url: photoUrl || null,
                    notes: depositRow.notes,
                  });
                  if (insertErr) continue;

                  if (storeId) {
                    const { notifyChatNewDepositForBar } = await import('@/lib/chat/bot-client');
                    notifyChatNewDepositForBar(storeId, {
                      deposit_code: newCode,
                      customer_name: depositRow.customer_name,
                      product_name: extra.productName,
                      quantity: extra.quantity,
                      table_number: depositRow.table_number,
                      received_by_name: currentUserName,
                    });
                  }
                }
              }
            }
          })();
        }

        // Audit: staff completed deposit step 1
        auditActionCard(AUDIT_ACTIONS.ACTION_CARD_COMPLETED, { step: 'staff_received' });

        // แจ้งเตือน bar
        if (storeId) {
          const summary = meta.summary;
          const itemsText = isFromCustomer ? firstItemLabel : (summary.items || '');
          notifyStaff({
            storeId,
            type: 'deposit_received',
            title: 'รอบาร์ยืนยัน',
            body: `${currentUserName} รับของแล้ว — ${summary.customer || ''} ${itemsText} (${meta.reference_id})`,
            data: { deposit_code: meta.reference_id },
            excludeUserId: currentUserId,
            roles: ['bar', 'manager'],
          });
          sendChatBotMessage({
            storeId,
            type: 'system',
            content: `📦 ${currentUserName} รับของแล้ว — ${summary.customer || ''} ${itemsText} (${meta.reference_id}) — รอ Bar ยืนยันเข้าระบบ`,
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
          // For bar-completing the deposit card, use the per-bottle %
          // entered. Compute average + a compact summary string.
          let barAvgPercent: number | null = null;
          let barPercentList: number[] | null = null;
          let barQtyConfirmed: number | null = null;
          if (isBarCompleting) {
            const qty = parseInt(barConfirmQty);
            barQtyConfirmed = Number.isFinite(qty) && qty > 0 ? qty : summaryQty;
            barPercentList = [];
            for (let i = 0; i < barQtyConfirmed; i++) {
              const raw = barConfirmBottlePercents[i];
              const n = raw === undefined || raw === '' ? NaN : parseFloat(raw);
              barPercentList.push(Number.isFinite(n) ? n : 100);
            }
            const nonConsumed = barPercentList.filter((p) => p > 0);
            barAvgPercent = nonConsumed.length > 0
              ? Math.round((nonConsumed.reduce((a, b) => a + b, 0) / nonConsumed.length) * 100) / 100
              : 0;
          }
          const completeNotes = isBarCompleting && barAvgPercent !== null
            ? `เฉลี่ย ${barAvgPercent}% (${(barPercentList || []).map((p, i) => `${i + 1}:${p}%`).join(', ')})`
            : null;
          updatedMeta = {
            ...meta,
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion_notes: completeNotes,
            confirmation_photo_url: photoUrl || meta.confirmation_photo_url || null,
          };
          if (isBarCompleting && barAvgPercent !== null) {
            updatedMeta = {
              ...updatedMeta,
              summary: {
                ...(updatedMeta.summary || {}),
                quantity: barQtyConfirmed,
                remaining_percent: String(barAvgPercent),
                bottle_percents: barPercentList,
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
          onStatusChange?.(action);

          await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
            type: 'message_updated',
            message: updated,
          } as unknown as Record<string, unknown>);

          // Audit log
          if (action === 'claim') auditActionCard(AUDIT_ACTIONS.ACTION_CARD_CLAIMED);
          else if (action === 'release') auditActionCard(AUDIT_ACTIONS.ACTION_CARD_RELEASED);
          else if (action === 'complete') auditActionCard(AUDIT_ACTIONS.ACTION_CARD_COMPLETED, {
            step: isBarCompleting ? 'bar_confirmed' : 'completed',
            bottle_percents: isBarCompleting ? barConfirmBottlePercents.slice() : undefined,
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

          // Bar completed deposit → update deposit status + notify.
          // Recompute the per-bottle data here too so the deposit record
          // and deposit_bottles table reflect what bar entered.
          if (isBarCompleting && storeId) {
            const summary = meta.summary;
            const qty = parseInt(barConfirmQty);
            const validQty = Number.isFinite(qty) && qty > 0 ? qty : summaryQty;
            const percents: number[] = [];
            for (let i = 0; i < validQty; i++) {
              const raw = barConfirmBottlePercents[i];
              const n = raw === undefined || raw === '' ? NaN : parseFloat(raw);
              percents.push(Number.isFinite(n) ? n : 100);
            }
            const nonConsumed = percents.filter((p) => p > 0);
            const avgPercent = nonConsumed.length > 0
              ? Math.round((nonConsumed.reduce((a, b) => a + b, 0) / nonConsumed.length) * 100) / 100
              : 0;
            const remainingQty = nonConsumed.length;

            // Update deposit record: pending_confirm → in_store
            if (meta.reference_table === 'deposits' && meta.reference_id) {
              const { data: depositRow } = await supabase
                .from('deposits')
                .update({
                  status: 'in_store',
                  confirm_photo_url: photoUrl || undefined,
                  remaining_percent: avgPercent,
                  quantity: validQty,
                  remaining_qty: remainingQty,
                })
                .eq('deposit_code', meta.reference_id)
                .select('id')
                .single();

              // Replace auto-seeded bottle rows with bar's actual readings.
              if (depositRow?.id) {
                const now = new Date().toISOString();
                await supabase
                  .from('deposit_bottles')
                  .delete()
                  .eq('deposit_id', depositRow.id);
                const newBottleRows = percents.map((pct, i) => ({
                  deposit_id: depositRow.id,
                  bottle_no: i + 1,
                  remaining_percent: pct,
                  status: pct === 0 ? 'consumed' : pct < 100 ? 'opened' : 'sealed',
                  opened_at: pct < 100 && pct > 0 ? now : null,
                  opened_by: pct < 100 && pct > 0 ? currentUserId : null,
                  consumed_at: pct === 0 ? now : null,
                  consumed_by: pct === 0 ? currentUserId : null,
                }));
                await supabase.from('deposit_bottles').insert(newBottleRows);

                // Auto-enqueue print: 1 receipt + N labels (one per bottle).
                // Pull a few extra fields the print payload needs but that
                // aren't in the action-card summary (product_name, table,
                // expiry, store_name etc). Best-effort — print failure
                // shouldn't block the confirm flow.
                const { data: depositFull } = await supabase
                  .from('deposits')
                  .select('product_name, category, customer_phone, table_number, expiry_date, created_at')
                  .eq('id', depositRow.id)
                  .single();
                const { data: storeRow } = await supabase
                  .from('stores')
                  .select('store_name')
                  .eq('id', storeId)
                  .single();
                const printPayloadBase = {
                  deposit_code: meta.reference_id,
                  customer_name: summary.customer || '',
                  customer_phone: depositFull?.customer_phone || null,
                  product_name: depositFull?.product_name || summary.items || '',
                  category: depositFull?.category || null,
                  quantity: validQty,
                  remaining_qty: remainingQty,
                  table_number: depositFull?.table_number || null,
                  expiry_date: depositFull?.expiry_date || null,
                  created_at: depositFull?.created_at || null,
                  store_name: storeRow?.store_name || '',
                  received_by_name: currentUserName,
                };
                const labelBottles = newBottleRows
                  .filter((b) => b.status !== 'consumed')
                  .map((b) => ({ bottle_no: b.bottle_no, remaining_percent: b.remaining_percent, status: b.status }));
                await Promise.all([
                  // One receipt total — when there are multiple bottles
                  // the renderer lists each bottle's %, so we don't
                  // print N separate slips. Each bottle still gets its
                  // own LABEL sticker (copies = bottle count below).
                  supabase.from('print_queue').insert({
                    store_id: storeId,
                    deposit_id: depositRow.id,
                    job_type: 'receipt',
                    status: 'pending',
                    copies: 1,
                    payload: { ...printPayloadBase, bottles: labelBottles },
                    requested_by: currentUserId,
                  }),
                  supabase.from('print_queue').insert({
                    store_id: storeId,
                    deposit_id: depositRow.id,
                    job_type: 'label',
                    status: 'pending',
                    copies: labelBottles.length || validQty,
                    payload: { ...printPayloadBase, bottles: labelBottles },
                    requested_by: currentUserId,
                  }),
                ]);
              }
            }

            const percentSummary = percents.map((p, i) => `${i + 1}:${p}%`).join(', ');
            sendChatBotMessage({
              storeId,
              type: 'system',
              content: `✅ ${currentUserName} ยืนยันรับฝาก ${summary.items || ''} x${validQty} (${meta.reference_id}) — ${summary.customer || ''} — รายขวด [${percentSummary}] เฉลี่ย ${avgPercent}%`,
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

            // Flex push to the customer's LINE OA (per-store toggle).
            fetch('/api/line/notify-deposit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'confirmed', deposit_code: meta.reference_id }),
            }).catch(() => {});
          }

          // Withdrawal completed → update withdrawal + deposit records.
          // Multi-bottle deposits create N pending rows (one per bottle)
          // so the action card has to drain them all, mark each
          // referenced bottle consumed, and only flip the deposit
          // status once nothing else is queued.
          if (action === 'complete' && meta.action_type === 'withdrawal_claim' && meta.reference_id) {
            try {
              const { data: deposit } = await supabase
                .from('deposits')
                .select('id, remaining_qty, quantity')
                .eq('deposit_code', meta.reference_id)
                .single();

              if (deposit) {
                const { data: pendingRows } = await supabase
                  .from('withdrawals')
                  .select('id, requested_qty, bottle_id, photo_url, notes')
                  .eq('deposit_id', deposit.id)
                  .in('status', ['pending', 'approved'])
                  .order('created_at', { ascending: true });

                const pending = pendingRows || [];
                if (pending.length > 0) {
                  const nowIso = new Date().toISOString();
                  let totalQty = 0;
                  for (const w of pending) {
                    const qty = Number(w.requested_qty) || 1;
                    totalQty += qty;
                    await supabase
                      .from('withdrawals')
                      .update({
                        status: 'completed',
                        actual_qty: qty,
                        processed_by: currentUserId,
                        photo_url: photoUrl || w.photo_url,
                      })
                      .eq('id', w.id);
                    if (w.bottle_id) {
                      await supabase
                        .from('deposit_bottles')
                        .update({ status: 'consumed', remaining_percent: 0, consumed_at: nowIso, consumed_by: currentUserId })
                        .eq('id', w.bottle_id);
                    }
                  }

                  const newRemaining = Math.max(0, deposit.remaining_qty - totalQty);
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

                  fetch('/api/line/notify-deposit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 'withdrawal_completed',
                      deposit_id: deposit.id,
                      actual_qty: totalQty,
                    }),
                  }).catch(() => {});
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
    // Seed the qty + per-bottle slots from the deposit summary so the bar
    // sees the right number of inputs immediately after claiming.
    if (!barConfirmQty) setBarConfirmQty(String(summaryQty));
    if (barConfirmBottlePercents.length === 0) {
      setBarConfirmBottlePercents(Array.from({ length: summaryQty }, () => ''));
    }
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
        onStatusChange?.('claim');

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
      onStatusChange?.('reject');

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

            // Push a Flex card back to the customer's LINE so they
            // know the request was cancelled — same pattern as
            // bar-confirm/withdrawal-complete notifications.
            fetch('/api/line/notify-deposit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'withdrawal_rejected',
                deposit_id: deposit.id,
                reason: 'ยกเลิกจากแชท',
              }),
            }).catch(() => {});
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

      // For labels, fetch live bottles so each copy shows real bottle_no + %
      let bottles: Array<{ bottle_no: number; remaining_percent: number; status: string }> = [];
      if (jobType === 'label') {
        const { data } = await supabase
          .from('deposit_bottles')
          .select('bottle_no, remaining_percent, status')
          .eq('deposit_id', deposit.id)
          .order('bottle_no');
        bottles = (data || []).filter((b) => b.status !== 'consumed');
      }

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
        bottles,
      };

      const copies = jobType === 'label' ? (bottles.length || deposit.remaining_qty || 1) : 1;

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
      onStatusChange?.('complete');

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
            {isPendingBar
              ? 'รอบาร์ยืนยัน'
              : isPending && isDepositCard
                ? isFromCustomerDeposit
                  ? 'รอรับจากลูกค้า'
                  : 'รอ Staff รับ'
                : config.label}
          </span>
          <span className="text-xs text-gray-400">
            {typeof meta.summary.code === 'string' && meta.summary.code
              ? meta.summary.code
              : `#${meta.reference_id}`}
          </span>
          {(() => {
            const tableNumber = getTableNumber(meta.summary as Record<string, unknown>);
            if (!tableNumber) return null;
            return (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <MapPin className="h-3 w-3" />
                โต๊ะ {tableNumber}
              </span>
            );
          })()}
        </div>

        {/* Summary — compact single-line for completed, full for active.
            Hide the note when it's just the legacy "โต๊ะ X" string since
            the same value now renders as a badge in the header. */}
        {(() => {
          const summaryNote = typeof meta.summary.note === 'string' ? meta.summary.note : '';
          const noteIsTableOnly = !!summaryNote && /^โต๊ะ\s*\S+$/.test(summaryNote.trim());
          if (isCompleted) {
            return (
              <p className="mb-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {meta.summary.customer}{meta.summary.items ? ` · ${meta.summary.items}` : ''}
              </p>
            );
          }
          return (
            <div className="mb-3 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
              {meta.summary.customer && (
                <p>
                  {isBorrow ? 'สาขา' : 'ลูกค้า'}: {meta.summary.customer}
                </p>
              )}
              {meta.summary.items && <p>รายการ: {meta.summary.items}</p>}
              {summaryNote && !noteIsTableOnly && (
                <p className="italic text-gray-400">"{summaryNote}"</p>
              )}
            </div>
          );
        })()}

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
        ) : isBorrowReturnConfirm ? (
          <>
            {/* ==========================================
                BORROW RETURN CONFIRM (lender side)
                Lender takes a receipt photo and confirms receipt of
                returned items, transitioning status return_pending → returned
                ========================================== */}

            {/* Borrower's return photo for review (read-only) */}
            {typeof meta.summary?.return_photo_url === 'string' && (
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <img
                  src={meta.summary.return_photo_url}
                  alt="รูปสินค้าที่ส่งคืน"
                  className="w-full max-h-40 object-cover"
                  loading="lazy"
                />
                <div className="bg-gray-50 px-2 py-1 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  รูปจาก {(meta.summary.returned_by_name as string) || 'ผู้ยืม'} (ตรวจก่อนยืนยัน)
                </div>
              </div>
            )}

            {/* Detail link */}
            {!isCompleted && meta.detail_url && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={() => router.push(meta.detail_url!)}
              >
                ไปหน้ายืมสินค้า
              </Button>
            )}

            {/* Pending — claim button (always visible: this is the entry
                point to claim work, even on the read-only board) */}
            {isPending && (
              <Button
                size="sm"
                variant="primary"
                className="w-full"
                icon={<Hand className="h-4 w-4" />}
                isLoading={loading}
                onClick={() => handleAction('claim')}
              >
                {isTimedOut ? 'รับงานต่อ' : 'รับยืนยันรับคืน'}
              </Button>
            )}

            {/* Claimed by me — photo + confirm */}
            {isClaimed && isClaimedByMe && (
              <div className="space-y-2">
                <PhotoUpload
                  value={photoUrl}
                  onChange={setPhotoUrl}
                  folder="borrows/return-receipt"
                  placeholder="ถ่ายรูปยืนยันรับคืน (บังคับ)"
                  compact
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex-1"
                    icon={<CheckCircle className="h-3.5 w-3.5" />}
                    isLoading={loading}
                    disabled={!photoUrl}
                    onClick={async () => {
                      if (!photoUrl) return;
                      setLoading(true);
                      try {
                        const res = await fetch(`/api/borrows/${meta.reference_id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'confirm_return_receipt',
                            photoUrl,
                          }),
                        });
                        if (!res.ok) {
                          const data = await res.json();
                          throw new Error(data.error || 'ยืนยันไม่สำเร็จ');
                        }
                        // Mark card completed
                        const supabase = createClient();
                        const newMeta: ActionCardMetadata = {
                          ...meta,
                          status: 'completed',
                          completed_at: new Date().toISOString(),
                          confirmation_photo_url: photoUrl,
                        };
                        await supabase
                          .from('chat_messages')
                          .update({ metadata: newMeta })
                          .eq('id', message.id);
                        const updated: ChatMessage = { ...message, metadata: newMeta };
                        updateMessage(updated);
                        onStatusChange?.('complete');
                        await broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_updated', {
                          type: 'message_updated',
                          message: updated,
                        } as unknown as Record<string, unknown>);
                      } catch (err) {
                        console.error('confirm_return_receipt error:', err);
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    ยืนยันรับคืน
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    isLoading={loading}
                    onClick={() => handleAction('release')}
                  >
                    คืนงาน
                  </Button>
                </div>
              </div>
            )}

            {/* Claimed by someone else */}
            {isClaimed && !isClaimedByMe && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
                <Hand className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {meta.claimed_by_name} กำลังยืนยันรับคืน
                </span>
              </div>
            )}

            {/* Completed */}
            {isCompleted && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    ยืนยันรับคืนเรียบร้อย
                  </span>
                  {meta.claimed_by_name && (
                    <span className="text-xs text-emerald-500/70">โดย {meta.claimed_by_name}</span>
                  )}
                </div>
                {meta.confirmation_photo_url && (
                  <div className="overflow-hidden rounded-lg">
                    <img
                      src={meta.confirmation_photo_url}
                      alt="รูปยืนยันรับคืน"
                      className="w-full max-h-36 object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        ) : isAnyStockCard ? (
          <>
            {/* ==========================================
                STOCK ACTION CARDS UI
                stock_explain / stock_supplementary / stock_approve
                ========================================== */}

            {/* Detail link — always visible while card is not completed */}
            {!isCompleted && meta.detail_url && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={() => router.push(meta.detail_url!)}
              >
                {isStockSupplementary
                  ? 'ไปนับเพิ่ม'
                  : isStockApprove
                    ? 'ไปอนุมัติ'
                    : 'ไปชี้แจง'}
              </Button>
            )}

            {/* Pending block — claim button (skip for stock_approve) */}
            {isPending && !isStockApprove && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  className="flex-1"
                  icon={<Hand className="h-4 w-4" />}
                  isLoading={loading}
                  onClick={() => handleAction('claim')}
                >
                  {isTimedOut ? 'รับงานต่อ' : 'รับรายการนี้'}
                </Button>
              </div>
            )}

            {/* Pending — stock_approve: only owner-level can mark approved/rejected via /stock/approval; show hint */}
            {isPending && isStockApprove && !canApproveStock && (
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                รอ Owner / Manager พิจารณาอนุมัติ
              </div>
            )}

            {/* Claimed — show claimer + complete button (gated for explain/supplementary) */}
            {isClaimed && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
                  <Hand className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    {meta.claimed_by_name} กำลังทำ
                  </span>
                </div>
                {!hideActions && isClaimedByMe && (
                  <>
                    {completeDisabledReason && (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="text-[11px] text-amber-700 dark:text-amber-300">
                          {completeDisabledReason}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1"
                        icon={<CheckCircle className="h-3.5 w-3.5" />}
                        isLoading={loading}
                        disabled={!!completeDisabledReason}
                        onClick={() => handleAction('complete')}
                      >
                        เสร็จแล้ว
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        isLoading={loading}
                        onClick={() => handleAction('release')}
                      >
                        คืนงาน
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Completed */}
            {isCompleted && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  เสร็จสิ้น
                </span>
                {meta.claimed_by_name && (
                  <span className="text-xs text-emerald-500/70">
                    โดย {meta.claimed_by_name}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* ==========================================
                GENERIC ACTION CARD UI (deposit, withdrawal, stock)
                ========================================== */}

            {/* Pending — withdrawal: เฉพาะ bar/manager/owner, อื่นๆ: ทุก role.
                Always rendered (even on the board) — this is how users
                claim a task. Only the post-claim work UI is gated. */}
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
            {/* Bar's pending_bar claim — also a claim entry point, keep
                visible on the board so bar can grab from รอรับ. */}
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

                {!hideActions && isClaimedByMe && (() => {
                  const isBarStep = !!(meta as ActionCardMetadata & { _bar_step?: boolean })._bar_step;
                  const isFromCustomer = isDepositCard && !isBarStep
                    && (meta.summary as Record<string, unknown> | undefined)?.from_customer === true;
                  const qtyNum = parseInt(barConfirmQty);
                  const validQty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : summaryQty;
                  const allBottlesFilled = isBarStep
                    ? Array.from({ length: validQty }).every((_, i) => {
                        const raw = barConfirmBottlePercents[i];
                        if (raw === undefined || raw === '') return false;
                        const n = parseFloat(raw);
                        return Number.isFinite(n) && n >= 0 && n <= 100;
                      })
                    : true;
                  // Customer-LIFF stage-2: staff fills product + qty for at
                  // least one row before submitting. Extra rows turn into
                  // separate deposits + chat cards on submit.
                  const staffInputsValid = !isFromCustomer
                    || liquorItems.some((it) => {
                        const q = Number(it.quantity);
                        return it.productName.trim().length > 0
                          && Number.isFinite(q) && q > 0;
                      });
                  return (
                  <div className="space-y-2">
                    {/* Customer-LIFF stage-2: ขาดข้อมูล product/qty — Staff เติม */}
                    {isFromCustomer && (
                      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-900/20">
                        <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                          ลูกค้าฝากผ่าน LINE — กรุณาระบุชื่อเหล้า + จำนวนขวดที่รับ (เพิ่มได้หลายรายการ)
                        </p>
                        <div className="space-y-2">
                          {liquorItems.map((item, idx) => {
                            const q = item.searchQuery;
                            const filtered = q
                              ? productOptions.filter((p) =>
                                  p.product_name.toLowerCase().includes(q.toLowerCase())
                                )
                              : productOptions;
                            return (
                              <div
                                key={idx}
                                className="space-y-1.5 rounded-lg border border-amber-200/80 bg-white p-2 dark:border-amber-800/60 dark:bg-gray-800"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                    รายการ {idx + 1}
                                  </span>
                                  {liquorItems.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLiquorItems((prev) => prev.filter((_, i) => i !== idx))
                                      }
                                      className="rounded p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                      title="ลบรายการ"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="relative col-span-2">
                                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                                    <input
                                      type="text"
                                      value={item.searchQuery}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setLiquorItems((prev) => {
                                          const next = [...prev];
                                          next[idx] = {
                                            ...next[idx],
                                            searchQuery: v,
                                            productName: v,
                                            showDropdown: true,
                                          };
                                          return next;
                                        });
                                      }}
                                      onFocus={() =>
                                        setLiquorItems((prev) => {
                                          const next = [...prev];
                                          next[idx] = { ...next[idx], showDropdown: true };
                                          return next;
                                        })
                                      }
                                      onBlur={() => {
                                        setTimeout(() => {
                                          setLiquorItems((prev) => {
                                            const next = [...prev];
                                            next[idx] = { ...next[idx], showDropdown: false };
                                            return next;
                                          });
                                        }, 200);
                                      }}
                                      placeholder="ค้นหาชื่อเหล้า"
                                      className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-7 pr-2 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                                    />
                                    {item.showDropdown && filtered.length > 0 && (
                                      <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                                        {filtered.slice(0, 30).map((p, pIdx) => (
                                          <button
                                            key={pIdx}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() =>
                                              setLiquorItems((prev) => {
                                                const next = [...prev];
                                                next[idx] = {
                                                  ...next[idx],
                                                  productName: p.product_name,
                                                  category: p.category || '',
                                                  searchQuery: p.product_name,
                                                  showDropdown: false,
                                                };
                                                return next;
                                              })
                                            }
                                            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                          >
                                            <span className="truncate font-medium text-gray-800 dark:text-gray-200">
                                              {p.product_name}
                                            </span>
                                            {p.category && (
                                              <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                                {p.category}
                                              </span>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {item.category && (
                                      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                                        หมวด: {item.category}
                                      </p>
                                    )}
                                  </div>
                                  <input
                                    type="number"
                                    min={1}
                                    value={item.quantity}
                                    onChange={(e) =>
                                      setLiquorItems((prev) => {
                                        const next = [...prev];
                                        next[idx] = { ...next[idx], quantity: e.target.value };
                                        return next;
                                      })
                                    }
                                    placeholder="จำนวน"
                                    className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-center text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setLiquorItems((prev) => [...prev, { ...EMPTY_LIQUOR_ITEM }])
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:bg-gray-800 dark:text-amber-300 dark:hover:bg-amber-900/20"
                        >
                          <Plus className="h-3 w-3" />
                          เพิ่มรายการ
                        </button>
                        {storeId && meta.reference_id && (
                          <a
                            href={`/deposit/requests`}
                            className="ml-2 inline-flex items-center gap-1 text-[10px] text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                          >
                            <ExternalLink className="h-3 w-3" />
                            หรือเปิดหน้าฝากเหล้าเพื่อกรอกข้อมูลครบ
                          </a>
                        )}
                      </div>
                    )}
                    {/* Bar step: editable qty + per-bottle % + photo */}
                    {isBarStep && (
                      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/40">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            จำนวนขวด *
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={barConfirmQty}
                            onChange={(e) => setBarConfirmQty(e.target.value)}
                            placeholder={String(summaryQty)}
                            className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-center text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                          <span className="text-xs text-gray-400">ขวด</span>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">% คงเหลือรายขวด *</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {Array.from({ length: validQty }).map((_, i) => {
                              const val = barConfirmBottlePercents[i] ?? '';
                              return (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900"
                                >
                                  <span className="text-xs font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                                    ขวด {i + 1}/{validQty}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={val}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      setBarConfirmBottlePercents((prev) => {
                                        const next = [...prev];
                                        while (next.length < validQty) next.push('');
                                        next[i] = raw;
                                        next.length = validQty;
                                        return next;
                                      });
                                    }}
                                    placeholder="100"
                                    className="ml-auto w-14 rounded border border-gray-200 bg-white px-2 py-1 text-right text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                  />
                                  <span className="text-[10px] text-gray-400">%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                    <PhotoUpload
                      value={photoUrl}
                      onChange={setPhotoUrl}
                      folder="confirmations"
                      placeholder={isBarStep ? 'ถ่ายรูปเหล้า (บังคับ)' : 'ถ่ายรูปยืนยัน (ไม่บังคับ)'}
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
                          isBarStep
                            ? (!photoUrl || !allBottlesFilled)
                            : !staffInputsValid
                        }
                        onClick={() => handleAction('complete')}
                      >
                        {isBarStep
                          ? 'ยืนยันรับฝาก'
                          : isFromCustomer
                            ? 'รับเหล้าและส่งให้ Bar'
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
                  );
                })()}
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
