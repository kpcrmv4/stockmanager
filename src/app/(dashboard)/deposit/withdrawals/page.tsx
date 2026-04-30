'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Badge,
  Card,
  Tabs,
  EmptyState,
  Modal,
  ModalFooter,
  Input,
  Textarea,
  toast,
  PhotoUpload,
} from '@/components/ui';
import { formatThaiDateTime, formatNumber } from '@/lib/utils/format';
import { WITHDRAWAL_STATUS_LABELS } from '@/lib/utils/constants';
import {
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  ArrowLeft,
  Camera,
  Loader2,
  Inbox,
  Wine,
  Plus,
  Search,
  Minus,
  X,
  ShoppingCart,
  ChevronDown,
  Home,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { notifyStaff } from '@/lib/notifications/client';
import { notifyChatWithdrawalCompleted, notifyChatWithdrawalCompletedAsCard, notifyChatWithdrawalRequest, syncChatActionCardStatus } from '@/lib/chat/bot-client';

interface Withdrawal {
  id: string;
  deposit_id: string;
  store_id: string;
  line_user_id: string | null;
  customer_name: string;
  product_name: string;
  requested_qty: number;
  actual_qty: number | null;
  table_number: string | null;
  status: string;
  processed_by: string | null;
  processed_by_name: string | null;
  notes: string | null;
  photo_url: string | null;
  withdrawal_type: 'in_store' | 'take_home' | null;
  bottle_id: string | null;
  created_at: string;
}

interface DepositForWithdraw {
  id: string;
  deposit_code: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  remaining_qty: number;
  line_user_id: string | null;
  status: string;
  category: string | null;
}

interface BottleRow {
  id: string;
  bottle_no: number;
  remaining_percent: number;
  status: 'sealed' | 'opened' | 'consumed';
}

interface WithdrawItem {
  deposit: DepositForWithdraw;
  qty: string;
  /** Per-bottle picker: bottles loaded for this deposit + which ids are selected to consume */
  bottles: BottleRow[];
  selectedBottleIds: Set<string>;
}

/**
 * Customer LIFF multi-bottle withdrawal creates one `withdrawals` row per
 * picked bottle (so the schema can link `bottle_id` 1:1). On the bar's
 * page we collapse those siblings into a single card — bar fulfils them
 * together anyway, and rendering 3 separate rows for one transaction
 * spammed the customer's LINE with 3 near-identical Flex confirmations.
 */
interface WithdrawalGroup {
  /** Stable key: deposit_id + status bucket (+ minute-bucket for completed
   *  history so a re-withdrawal a week later doesn't merge in). */
  key: string;
  deposit_id: string;
  status: string;
  /** First row in the group — used for display fields that are shared
   *  across siblings (product_name, customer_name, deposit_code, etc.). */
  rep: Withdrawal;
  rows: Withdrawal[];
  totalRequestedQty: number;
  totalActualQty: number | null;
  /** Bottle slot labels like "2/3" (from the deposit's quantity), in
   *  ascending bottle_no order. Empty when no bottle_id targeting (legacy
   *  whole-deposit requests). */
  bottleLabels: string[];
}

function groupWithdrawals(
  rows: Withdrawal[],
  bottleContext: Map<string, { bottle_no: number; remaining_percent: number; deposit_quantity: number; deposit_code: string }>,
): WithdrawalGroup[] {
  const map = new Map<string, WithdrawalGroup>();
  for (const w of rows) {
    // Bucket completed/rejected by minute so re-uses of the same deposit
    // (e.g. customer empties bottles 2+3 today, then comes back next week
    // for bottle 1) don't merge across separate transactions.
    const bucket = w.status === 'pending' || w.status === 'approved'
      ? 'pending'
      : `${w.status}_${w.created_at.slice(0, 16)}`; // 'YYYY-MM-DDTHH:mm'
    const key = `${w.deposit_id}__${bucket}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        deposit_id: w.deposit_id,
        status: w.status,
        rep: w,
        rows: [],
        totalRequestedQty: 0,
        totalActualQty: null,
        bottleLabels: [],
      };
      map.set(key, g);
    }
    g.rows.push(w);
    g.totalRequestedQty += Number(w.requested_qty) || 0;
    if (w.actual_qty !== null) {
      g.totalActualQty = (g.totalActualQty ?? 0) + Number(w.actual_qty);
    }
  }
  // Build bottle labels in bottle_no order using bottleContext
  for (const g of map.values()) {
    const labels: Array<{ no: number; total: number }> = [];
    for (const row of g.rows) {
      if (!row.bottle_id) continue;
      const ctx = bottleContext.get(row.bottle_id);
      if (ctx) labels.push({ no: ctx.bottle_no, total: ctx.deposit_quantity });
    }
    labels.sort((a, b) => a.no - b.no);
    g.bottleLabels = labels.map((x) => (x.total > 0 ? `${x.no}/${x.total}` : String(x.no)));
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.rep.created_at).getTime() - new Date(a.rep.created_at).getTime(),
  );
}

const statusVariantMap: Record<string, 'warning' | 'success' | 'default' | 'danger' | 'info'> = {
  pending: 'warning',
  approved: 'info',
  completed: 'success',
  rejected: 'danger',
};

const WITHDRAWAL_TAB_KEYS: Record<string, string> = {
  pending: 'withdrawals.pending',
  completed: 'withdrawals.completed',
  rejected: 'withdrawals.rejected',
};

export default function WithdrawalsPage() {
  const t = useTranslations('deposit');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  // Land on the pending tab so the bar staff sees actionable rows
  // first; completed/rejected stays one tap away.
  const [activeTab, setActiveTab] = useState('pending');
  const [isLoading, setIsLoading] = useState(true);
  // Bottle context for each withdrawal that targets a specific bottle:
  // bottle_id → { bottle_no, remaining_percent, deposit_quantity, deposit_code }.
  // Loaded alongside withdrawals so each row can show "ขวด 1/3 — 20%".
  const [bottleContext, setBottleContext] = useState<Map<string, { bottle_no: number; remaining_percent: number; deposit_quantity: number; deposit_code: string }>>(new Map());
  // deposit_id → deposit_code for every withdrawal (so even rows
  // without a bottle_id can show #DEP-...).
  const [depositCodeMap, setDepositCodeMap] = useState<Map<string, string>>(new Map());

  // Process withdrawal modal — operates on a *group* (multi-bottle requests
  // collapse into one). selectedGroup.rep mirrors the legacy field for
  // single-row groups so existing UI bits keep working unchanged.
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<WithdrawalGroup | null>(null);
  const [processAction, setProcessAction] = useState<'complete' | 'reject'>('complete');
  const [actualQty, setActualQty] = useState('');
  const [processNotes, setProcessNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawalPhotoUrl, setWithdrawalPhotoUrl] = useState<string | null>(null);

  // Expand/collapse for completed/rejected cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Manual withdrawal modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualStep, setManualStep] = useState<'search' | 'confirm'>('search');
  const [depositSearch, setDepositSearch] = useState('');
  const [depositResults, setDepositResults] = useState<DepositForWithdraw[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [withdrawItems, setWithdrawItems] = useState<WithdrawItem[]>([]);
  const [manualNotes, setManualNotes] = useState('');
  const [manualPhotoUrl, setManualPhotoUrl] = useState<string | null>(null);
  // Required when manualWithdrawalType === 'in_store'.
  const [manualTableNumber, setManualTableNumber] = useState('');
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);

  // Withdrawal blocked days
  const [blockedDayInfo, setBlockedDayInfo] = useState<{ blocked: boolean; businessDay: string } | null>(null);
  const [manualWithdrawalType, setManualWithdrawalType] = useState<'in_store' | 'take_home'>('in_store');

  const loadWithdrawals = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ type: 'error', title: t('loadError'), message: t('withdrawals.loadError') });
    }
    if (data) {
      // Resolve processed_by names
      const userIds = [...new Set(data.map((w) => w.processed_by).filter(Boolean))] as string[];
      let userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, username')
          .in('id', userIds);
        if (profiles) {
          userMap = new Map(profiles.map((p) => [p.id, p.display_name || p.username]));
        }
      }

      setWithdrawals(data.map((w) => ({
        ...w,
        processed_by_name: w.processed_by ? (userMap.get(w.processed_by) || null) : null,
      })) as Withdrawal[]);

      // Pull deposits + bottles in one shot so every row can show
      // its deposit_code, and rows with bottle_id can also show
      // "ขวด X/N".
      const allDepositIds = [...new Set(data.map((w) => w.deposit_id).filter(Boolean))] as string[];
      const bottleIds = [...new Set(data.map((w) => w.bottle_id).filter(Boolean))] as string[];

      const { data: depositsData } = allDepositIds.length > 0
        ? await supabase
            .from('deposits')
            .select('id, quantity, deposit_code')
            .in('id', allDepositIds)
        : { data: [] };
      const depMap = new Map((depositsData || []).map((d) => [d.id, { quantity: d.quantity, deposit_code: d.deposit_code }]));
      setDepositCodeMap(new Map((depositsData || []).map((d) => [d.id, d.deposit_code])));

      if (bottleIds.length > 0) {
        const { data: bottlesData } = await supabase
          .from('deposit_bottles')
          .select('id, bottle_no, remaining_percent, deposit_id')
          .in('id', bottleIds);
        const map = new Map<string, { bottle_no: number; remaining_percent: number; deposit_quantity: number; deposit_code: string }>();
        for (const b of bottlesData || []) {
          const dep = depMap.get(b.deposit_id);
          map.set(b.id, {
            bottle_no: b.bottle_no,
            remaining_percent: b.remaining_percent,
            deposit_quantity: dep?.quantity ?? 1,
            deposit_code: dep?.deposit_code ?? '',
          });
        }
        setBottleContext(map);
      } else {
        setBottleContext(new Map());
      }
    }
    setIsLoading(false);
  }, [currentStoreId]);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  // Check withdrawal blocked days
  useEffect(() => {
    if (!currentStoreId) return;
    const checkBlockedDays = async () => {
      const supabase = createClient();
      const { data: settings } = await supabase
        .from('store_settings')
        .select('withdrawal_blocked_days')
        .eq('store_id', currentStoreId)
        .single();

      const blockedDays = (settings?.withdrawal_blocked_days as string[] | null) ?? ['Fri', 'Sat'];

      // Use actual calendar day in Bangkok — no cutoff
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const calendarDay = dayNames[now.getDay()];
      const blocked = blockedDays.includes(calendarDay);

      setBlockedDayInfo({ blocked, businessDay: calendarDay });
      if (blocked) setManualWithdrawalType('take_home');
    };
    checkBlockedDays();
  }, [currentStoreId]);

  // Search deposits for manual withdrawal
  const searchDeposits = useCallback(async (query: string) => {
    if (!currentStoreId || !query.trim()) {
      setDepositResults([]);
      return;
    }
    setIsSearching(true);
    const supabase = createClient();
    const q = query.trim();

    const { data } = await supabase
      .from('deposits')
      .select('id, deposit_code, customer_name, product_name, quantity, remaining_qty, line_user_id, status, category')
      .eq('store_id', currentStoreId)
      .eq('status', 'in_store')
      .gt('remaining_qty', 0)
      .or(`customer_name.ilike.%${q}%,product_name.ilike.%${q}%,deposit_code.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    setDepositResults((data as DepositForWithdraw[]) || []);
    setIsSearching(false);
  }, [currentStoreId]);

  // Debounced search
  useEffect(() => {
    if (!showManualModal || manualStep !== 'search') return;
    const timer = setTimeout(() => {
      searchDeposits(depositSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [depositSearch, showManualModal, manualStep, searchDeposits]);

  // Load all available deposits when modal opens
  useEffect(() => {
    if (showManualModal && manualStep === 'search' && !depositSearch) {
      const loadAll = async () => {
        if (!currentStoreId) return;
        setIsSearching(true);
        const supabase = createClient();
        const { data } = await supabase
          .from('deposits')
          .select('id, deposit_code, customer_name, product_name, quantity, remaining_qty, line_user_id, status, category')
          .eq('store_id', currentStoreId)
          .eq('status', 'in_store')
          .gt('remaining_qty', 0)
          .order('created_at', { ascending: false })
          .limit(30);
        setDepositResults((data as DepositForWithdraw[]) || []);
        setIsSearching(false);
      };
      loadAll();
    }
  }, [showManualModal, manualStep, currentStoreId, depositSearch]);

  const openManualModal = () => {
    setShowManualModal(true);
    setManualStep('search');
    setDepositSearch('');
    setDepositResults([]);
    setWithdrawItems([]);
    setManualNotes('');
    setManualPhotoUrl(null);
    setManualTableNumber('');
    setManualWithdrawalType(blockedDayInfo?.blocked ? 'take_home' : 'in_store');
  };

  const toggleDeposit = async (deposit: DepositForWithdraw) => {
    const exists = withdrawItems.find((w) => w.deposit.id === deposit.id);
    if (exists) {
      setWithdrawItems((prev) => prev.filter((w) => w.deposit.id !== deposit.id));
      return;
    }
    // Pull live bottles for this deposit; pick all non-consumed by default
    // (matches the legacy "qty = remaining_qty" behavior).
    const supabase = createClient();
    const { data } = await supabase
      .from('deposit_bottles')
      .select('id, bottle_no, remaining_percent, status')
      .eq('deposit_id', deposit.id)
      .order('bottle_no');
    const bottles = (data || []) as BottleRow[];
    const defaultSelected = new Set(
      bottles.filter((b) => b.status !== 'consumed').map((b) => b.id),
    );
    setWithdrawItems((prev) => [
      ...prev,
      {
        deposit,
        qty: String(deposit.remaining_qty),
        bottles,
        selectedBottleIds: defaultSelected,
      },
    ]);
  };

  const updateItemQty = (depositId: string, qty: string) => {
    setWithdrawItems((prev) =>
      prev.map((w) => (w.deposit.id === depositId ? { ...w, qty } : w))
    );
  };

  const removeItem = (depositId: string) => {
    setWithdrawItems((prev) => prev.filter((w) => w.deposit.id !== depositId));
  };

  const validItems = withdrawItems.filter((w) => {
    const q = parseFloat(w.qty);
    return !isNaN(q) && q > 0 && q <= w.deposit.remaining_qty;
  });

  const handleManualWithdrawal = async () => {
    if (validItems.length === 0 || !user || !currentStoreId) return;

    // Block in-store withdrawal on blocked days
    if (blockedDayInfo?.blocked && manualWithdrawalType !== 'take_home') {
      toast({ type: 'error', title: t('withdrawals.blockedDayInlineError'), message: t('withdrawals.blockedDaySelectTakeHome') });
      return;
    }

    // Require a table number when serving in store so bar knows where
    // to deliver the bottle.
    if (manualWithdrawalType === 'in_store' && !manualTableNumber.trim()) {
      toast({
        type: 'error',
        title: t('withdrawals.manual.tableLabel'),
        message: t('withdrawals.manual.tableRequired'),
      });
      return;
    }

    // Validate all items
    for (const item of withdrawItems) {
      const q = parseFloat(item.qty);
      if (isNaN(q) || q <= 0) {
        toast({ type: 'error', title: t('withdrawals.manual.qtyError'), message: item.deposit.product_name });
        return;
      }
      if (q > item.deposit.remaining_qty) {
        toast({ type: 'error', title: t('withdrawals.manual.qtyExceedsError'), message: `${item.deposit.product_name}: ${formatNumber(item.deposit.remaining_qty)}` });
        return;
      }
    }

    setIsManualSubmitting(true);
    const supabase = createClient();

    // Staff submits a "request" only — the bar still has to confirm
    // and physically dispense. This mirrors the legacy GAS behaviour
    // where staff's "เบิกแบบ Manual" button created a pending row that
    // showed up on bar's "รอเบิก" tab. Bar / manager / owner stay on the
    // direct-completion path: the row goes straight to status=completed
    // with bottles consumed and the customer flex push fired.
    const isStaff = user.role === 'staff';
    const finalTable = manualWithdrawalType === 'in_store'
      ? (manualTableNumber.trim() || null)
      : null;
    const userName = user.displayName || user.username || 'พนักงาน';

    for (const item of withdrawItems) {
      const qty = parseFloat(item.qty);
      const dep = item.deposit;
      const selectedIds = Array.from(item.selectedBottleIds);

      // Insert withdrawals: one row per picked bottle so the row's
      // bottle_id stays linked (used by the list + history to show
      // "ขวด X/N"). For deposits with no bottle picker (legacy or
      // qty-based), fall back to a single row with bottle_id=null.
      const baseRow = isStaff
        ? {
            deposit_id: dep.id,
            store_id: currentStoreId,
            line_user_id: dep.line_user_id,
            customer_name: dep.customer_name,
            product_name: dep.product_name,
            withdrawal_type: manualWithdrawalType,
            table_number: finalTable,
            status: 'pending' as const,
            // processed_by stays NULL — bar fills it in on confirm.
            notes: manualNotes.trim() || null,
            photo_url: manualPhotoUrl,
          }
        : {
            deposit_id: dep.id,
            store_id: currentStoreId,
            line_user_id: dep.line_user_id,
            customer_name: dep.customer_name,
            product_name: dep.product_name,
            withdrawal_type: manualWithdrawalType,
            table_number: finalTable,
            status: 'completed' as const,
            processed_by: user.id,
            notes: manualNotes.trim() || null,
            photo_url: manualPhotoUrl,
          };
      const rows = selectedIds.length > 0
        ? selectedIds.map((bid) => isStaff
            ? { ...baseRow, requested_qty: 1, bottle_id: bid }
            : { ...baseRow, requested_qty: 1, actual_qty: 1, bottle_id: bid })
        : [isStaff
            ? { ...baseRow, requested_qty: qty, bottle_id: null }
            : { ...baseRow, requested_qty: qty, actual_qty: qty, bottle_id: null }];

      const { error: withdrawalError } = await supabase.from('withdrawals').insert(rows);

      if (withdrawalError) {
        toast({ type: 'error', title: t('loadError'), message: t('withdrawals.manual.processError', { product: dep.product_name }) });
        setIsManualSubmitting(false);
        return;
      }

      const bottleLabels = selectedIds.length > 0
        ? item.bottles
            .filter((b) => selectedIds.includes(b.id))
            .map((b) => `${b.bottle_no}/${dep.quantity}`)
        : undefined;

      if (isStaff) {
        // Staff path — flag deposit as awaiting bar, post a pending
        // withdrawal_claim card to chat. No bottles are consumed yet:
        // bar will mark them off when they handle the request.
        await supabase
          .from('deposits')
          .update({ status: 'pending_withdrawal' })
          .eq('id', dep.id);

        notifyChatWithdrawalRequest(currentStoreId, {
          deposit_code: dep.deposit_code,
          customer_name: dep.customer_name,
          product_name: dep.product_name,
          requested_qty: qty,
          table_number: finalTable,
          withdrawal_type: manualWithdrawalType,
          bottle_labels: bottleLabels,
        });

        await logAudit({
          store_id: currentStoreId,
          action_type: AUDIT_ACTIONS.WITHDRAWAL_REQUESTED,
          table_name: 'withdrawals',
          record_id: dep.id,
          new_value: {
            customer_name: dep.customer_name,
            product_name: dep.product_name,
            requested_qty: qty,
            withdrawal_type: manualWithdrawalType,
            table_number: finalTable,
            manual: true,
            requested_by: userName,
          },
          changed_by: user.id,
        });
        continue;
      }

      // Bar / manager / owner path — direct completion (legacy behaviour).
      // Mark selected bottles as consumed (per-bottle tracking).
      if (selectedIds.length > 0) {
        await supabase
          .from('deposit_bottles')
          .update({
            status: 'consumed',
            remaining_percent: 0,
            consumed_at: new Date().toISOString(),
            consumed_by: user.id,
          })
          .in('id', selectedIds);
      }

      // Re-derive deposit aggregates from bottles (source of truth now).
      const { data: liveBottles } = await supabase
        .from('deposit_bottles')
        .select('status, remaining_percent')
        .eq('deposit_id', dep.id);
      const remaining = (liveBottles || []).filter((b) => b.status !== 'consumed');
      const newRemainingQty = remaining.length;
      const newPercent =
        remaining.length > 0
          ? Math.round(
              (remaining.reduce((s, b) => s + Number(b.remaining_percent), 0) / remaining.length) * 100,
            ) / 100
          : 0;
      const newStatus = newRemainingQty <= 0 ? 'withdrawn' : 'in_store';

      await supabase
        .from('deposits')
        .update({
          remaining_qty: newRemainingQty,
          remaining_percent: newPercent,
          status: newStatus,
        })
        .eq('id', dep.id);

      // Send chat notification per item
      notifyChatWithdrawalCompleted(currentStoreId, {
        customer_name: dep.customer_name,
        product_name: dep.product_name,
        actual_qty: qty,
        processed_by_name: userName,
      });

      // If a customer/staff had previously requested a withdrawal for
      // this deposit and the chat card is still hanging around as
      // pending, mark it completed too — manual processing here is
      // effectively the resolution.
      syncChatActionCardStatus({
        storeId: currentStoreId,
        referenceId: dep.deposit_code,
        actionType: 'withdrawal_claim',
        newStatus: 'completed',
        completedBy: user.id,
        completedByName: userName,
      });

      // Drop a pre-completed action card so the รายการงาน tab keeps a
      // record of this manual withdrawal alongside customer-initiated
      // ones. Includes bottle labels when available.
      notifyChatWithdrawalCompletedAsCard(currentStoreId, {
        deposit_code: dep.deposit_code,
        customer_name: dep.customer_name,
        product_name: dep.product_name,
        actual_qty: qty,
        bottle_labels: bottleLabels,
        completed_by: user.id,
        completed_by_name: userName,
      });

      // Flex push to the customer's LINE OA (per-store toggle).
      fetch('/api/line/notify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'withdrawal_completed', deposit_id: dep.id, actual_qty: qty }),
      }).catch(() => {});

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_COMPLETED,
        table_name: 'withdrawals',
        record_id: dep.id,
        new_value: {
          customer_name: dep.customer_name,
          product_name: dep.product_name,
          actual_qty: qty,
          manual: true,
        },
        changed_by: user.id,
      });
    }

    const summary = withdrawItems.map((w) => `${w.deposit.product_name} x${w.qty}`).join(', ');

    if (isStaff) {
      toast({
        type: 'success',
        title: t('withdrawals.manual.staffRequestTitle'),
        message: t('withdrawals.manual.staffRequestMessage'),
      });
    } else {
      toast({
        type: 'success',
        title: t('withdrawals.manual.successTitle'),
        message: t('withdrawals.manual.successMessage', { count: withdrawItems.length, summary }),
      });
    }

    // Notify other staff (single notification for batch)
    notifyStaff({
      storeId: currentStoreId,
      type: 'withdrawal_request',
      title: isStaff ? t('withdrawals.manual.staffNotifyTitle') : t('withdrawals.manual.notifyTitle'),
      body: t('withdrawals.manual.notifyBody', { count: withdrawItems.length, summary }),
      data: {},
      excludeUserId: user.id,
    });

    setIsManualSubmitting(false);
    setShowManualModal(false);
    loadWithdrawals();
  };

  const openProcessModal = (group: WithdrawalGroup, action: 'complete' | 'reject') => {
    setSelectedGroup(group);
    setProcessAction(action);
    // Total requested qty across all sibling rows (1 per bottle for
    // multi-bottle requests).
    setActualQty(action === 'complete' ? String(group.totalRequestedQty) : '');
    setProcessNotes('');
    setWithdrawalPhotoUrl(null);
    setShowProcessModal(true);
  };

  /**
   * Process the whole group in one shot — all sibling rows close
   * simultaneously, exactly one Flex confirmation goes to the customer,
   * exactly one chat sync. Bar fulfils them together anyway, so this
   * matches the physical workflow and avoids spamming the customer's
   * LINE with N near-identical confirmations.
   */
  const handleProcess = async () => {
    if (!selectedGroup || !user || !currentStoreId) return;
    setIsSubmitting(true);
    const supabase = createClient();
    const rep = selectedGroup.rep;
    const rowIds = selectedGroup.rows.map((r) => r.id);
    const bottleIds = selectedGroup.rows
      .map((r) => r.bottle_id)
      .filter((id): id is string => !!id);

    if (processAction === 'complete') {
      const qty = parseFloat(actualQty);
      if (isNaN(qty) || qty <= 0) {
        toast({ type: 'error', title: t('withdrawals.invalidQty') });
        setIsSubmitting(false);
        return;
      }

      // Per-row qty: distribute across siblings if the bar trimmed the
      // total below the requested sum (rare); otherwise each row keeps
      // its requested_qty. Single-row groups behave exactly like before.
      const totalRequested = selectedGroup.totalRequestedQty;
      const rowQtys: number[] = selectedGroup.rows.map((r) =>
        Number(r.requested_qty) || 0,
      );
      if (qty !== totalRequested) {
        // Spread proportionally — keep the math simple, last row absorbs
        // the rounding remainder.
        let remaining = qty;
        for (let i = 0; i < rowQtys.length; i++) {
          if (i === rowQtys.length - 1) {
            rowQtys[i] = Math.max(0, remaining);
          } else {
            const share = totalRequested > 0
              ? Math.round((rowQtys[i] / totalRequested) * qty * 100) / 100
              : 0;
            rowQtys[i] = share;
            remaining -= share;
          }
        }
      }

      // Update every sibling withdrawal in parallel.
      const updateResults = await Promise.all(
        selectedGroup.rows.map((row, idx) =>
          supabase
            .from('withdrawals')
            .update({
              status: 'completed',
              actual_qty: rowQtys[idx],
              processed_by: user.id,
              notes: processNotes || null,
              photo_url: withdrawalPhotoUrl,
            })
            .eq('id', row.id),
        ),
      );
      const firstErr = updateResults.find((r) => r.error);
      if (firstErr?.error) {
        toast({ type: 'error', title: t('loadError'), message: t('withdrawals.processError') });
        setIsSubmitting(false);
        return;
      }

      // Mark every targeted bottle consumed in one batch update.
      if (bottleIds.length > 0) {
        await supabase
          .from('deposit_bottles')
          .update({
            status: 'consumed',
            remaining_percent: 0,
            consumed_at: new Date().toISOString(),
            consumed_by: user.id,
          })
          .in('id', bottleIds);
      }

      // Re-derive deposit aggregates from bottles (source of truth) so we
      // don't drift if any sibling was previously partial-completed.
      const { data: deposit } = await supabase
        .from('deposits')
        .select('id, deposit_code, quantity')
        .eq('id', rep.deposit_id)
        .single();

      const { count: stillPending } = await supabase
        .from('withdrawals')
        .select('id', { count: 'exact', head: true })
        .eq('deposit_id', rep.deposit_id)
        .eq('status', 'pending');

      if (deposit) {
        const { data: liveBottles } = await supabase
          .from('deposit_bottles')
          .select('status, remaining_percent')
          .eq('deposit_id', deposit.id);
        const remaining = (liveBottles || []).filter((b) => b.status !== 'consumed');
        const newRemainingQty = remaining.length;
        const newPercent =
          remaining.length > 0
            ? Math.round(
                (remaining.reduce((s, b) => s + Number(b.remaining_percent), 0) / remaining.length) * 100,
              ) / 100
            : 0;
        const newStatus = newRemainingQty <= 0
          ? 'withdrawn'
          : (stillPending && stillPending > 0 ? 'pending_withdrawal' : 'in_store');

        await supabase
          .from('deposits')
          .update({
            remaining_qty: newRemainingQty,
            remaining_percent: newPercent,
            status: newStatus,
          })
          .eq('id', deposit.id);
      }

      toast({ type: 'success', title: t('withdrawals.processSuccess'), message: t('withdrawals.processSuccessMessage', { qty }) });

      // ONE Flex confirmation — totals + bottle labels are already on the
      // deposit row (we just updated remaining_qty). The customer no
      // longer sees N duplicate Flex pushes for one batch withdrawal.
      fetch('/api/line/notify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'withdrawal_completed', deposit_id: rep.deposit_id, actual_qty: qty }),
      }).catch(() => {});

      // ONE chat system message + ONE card sync.
      notifyChatWithdrawalCompleted(currentStoreId, {
        customer_name: rep.customer_name,
        product_name: rep.product_name,
        actual_qty: qty,
        processed_by_name: user.displayName || user.username || 'พนักงาน',
      });
      if (deposit?.deposit_code) {
        syncChatActionCardStatus({
          storeId: currentStoreId,
          referenceId: deposit.deposit_code,
          actionType: 'withdrawal_claim',
          newStatus: 'completed',
          completedBy: user.id,
          completedByName: user.displayName || user.username || 'พนักงาน',
        });
      }

      notifyStaff({
        storeId: currentStoreId,
        type: 'withdrawal_request',
        title: 'มีคำขอเบิกเหล้า',
        body: `${rep.customer_name} ขอเบิก ${rep.product_name} x${qty}`,
        data: { withdrawal_id: rep.id },
        excludeUserId: user?.id,
      });

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_COMPLETED,
        table_name: 'withdrawals',
        record_id: rep.id,
        new_value: {
          customer_name: rep.customer_name,
          product_name: rep.product_name,
          actual_qty: qty,
          row_ids: rowIds,
          bottle_labels: selectedGroup.bottleLabels,
        },
        changed_by: user?.id || null,
      });
    } else {
      // Reject every sibling row in the group together.
      const { error } = await supabase
        .from('withdrawals')
        .update({
          status: 'rejected',
          processed_by: user.id,
          notes: processNotes || null,
        })
        .in('id', rowIds);

      if (error) {
        toast({ type: 'error', title: t('loadError'), message: t('withdrawals.rejectError') });
        setIsSubmitting(false);
        return;
      }

      // Roll the deposit back to in_store if it was pending_withdrawal.
      const { data: rejectedDeposit } = await supabase
        .from('deposits')
        .select('deposit_code')
        .eq('id', rep.deposit_id)
        .single();

      await supabase
        .from('deposits')
        .update({ status: 'in_store' })
        .eq('id', rep.deposit_id)
        .eq('status', 'pending_withdrawal');

      toast({ type: 'warning', title: t('withdrawals.rejectSuccess') });

      if (rejectedDeposit?.deposit_code) {
        syncChatActionCardStatus({
          storeId: currentStoreId,
          referenceId: rejectedDeposit.deposit_code,
          actionType: 'withdrawal_claim',
          newStatus: 'rejected',
        });
      }

      fetch('/api/line/notify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'withdrawal_rejected',
          deposit_id: rep.deposit_id,
          reason: processNotes || 'ยกเลิกจากร้าน',
        }),
      }).catch(() => {});

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_REJECTED,
        table_name: 'withdrawals',
        record_id: rep.id,
        new_value: {
          customer_name: rep.customer_name,
          product_name: rep.product_name,
          reason: processNotes || null,
          row_ids: rowIds,
        },
        changed_by: user?.id || null,
      });
    }

    setIsSubmitting(false);
    setShowProcessModal(false);
    setSelectedGroup(null);
    loadWithdrawals();
  };

  const pendingCount = withdrawals.filter((w) => w.status === 'pending' || w.status === 'approved').length;
  const completedCount = withdrawals.filter((w) => w.status === 'completed').length;
  const rejectedCount = withdrawals.filter((w) => w.status === 'rejected').length;

  const filteredWithdrawals = useMemo(() => {
    if (activeTab === 'pending') return withdrawals.filter((w) => w.status === 'pending' || w.status === 'approved');
    if (activeTab === 'completed') return withdrawals.filter((w) => w.status === 'completed');
    if (activeTab === 'rejected') return withdrawals.filter((w) => w.status === 'rejected');
    return withdrawals;
  }, [withdrawals, activeTab]);

  const groupedWithdrawals = useMemo(
    () => groupWithdrawals(filteredWithdrawals, bottleContext),
    [filteredWithdrawals, bottleContext],
  );

  const withdrawalTabs = ['pending', 'completed', 'rejected'].map((id) => ({ id, label: t(WITHDRAWAL_TAB_KEYS[id]) }));
  const tabsWithCounts = withdrawalTabs.map((tab) => {
    if (tab.id === 'pending') return { ...tab, count: pendingCount };
    if (tab.id === 'completed') return { ...tab, count: completedCount };
    if (tab.id === 'rejected') return { ...tab, count: rejectedCount };
    return tab;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-4">
          <Link
            href="/deposit"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('withdrawals.backToDeposit')}
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('withdrawals.title')}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('withdrawals.subtitle')}
            </p>
          </div>
          <Button
            className="min-h-[44px]"
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={openManualModal}
          >
            {t('withdrawals.newWithdrawal')}
          </Button>
        </div>
      </div>

      {/* Blocked day warning banner */}
      {blockedDayInfo?.blocked && (
        <Card padding="md" className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                {t('withdrawals.blockedDayTitle')}
              </p>
              <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">
                {t('withdrawals.blockedDaySubtitle')}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('withdrawals.pending')}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {completedCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('withdrawals.completed')}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {rejectedCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('withdrawals.rejected')}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={setActiveTab} />

      {/* Withdrawal List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        </div>
      ) : filteredWithdrawals.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t('withdrawals.noWithdrawals')}
          description={
            activeTab === 'pending'
              ? t('withdrawals.noPending')
              : activeTab === 'completed'
                ? t('withdrawals.noCompleted')
                : t('withdrawals.noRejected')
          }
        />
      ) : (
        <div className="space-y-3">
          {groupedWithdrawals.map((group) => {
            const rep = group.rep;
            const isPending = rep.status === 'pending' || rep.status === 'approved';
            const isExpanded = isPending || expandedIds.has(group.key);
            const code = depositCodeMap.get(rep.deposit_id);
            const isMulti = group.rows.length > 1;

            return (
              <Card key={group.key} padding="none">
                <div
                  className={cn(
                    'flex items-center gap-3 p-4 sm:p-5',
                    !isPending && 'cursor-pointer select-none',
                    isExpanded && !isPending && 'border-b border-gray-100 dark:border-gray-800'
                  )}
                  onClick={!isPending ? () => toggleExpand(group.key) : undefined}
                >
                  <div className="min-w-0 flex-1">
                    {/* Top: deposit code as the main heading + status. The
                        code is what bar / staff actually look for in
                        receipts and chat — promote it above the product
                        name. */}
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-mono text-base font-bold text-gray-900 dark:text-white">
                        {code ? `#${code}` : '—'}
                      </h3>
                      <Badge variant={statusVariantMap[rep.status] || 'default'}>
                        {WITHDRAWAL_STATUS_LABELS[rep.status] || rep.status}
                      </Badge>
                    </div>

                    {/* Product name + bottle chips + % all on one wrapping
                        row. Multi-bottle rows render one chip per bottle. */}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                      <span className="font-medium">{rep.product_name}</span>
                      {group.rows.map((row) => {
                        const ctx = row.bottle_id ? bottleContext.get(row.bottle_id) : null;
                        if (!ctx) return null;
                        const showPct = row.status === 'pending' || row.status === 'approved';
                        const pctClass = ctx.remaining_percent >= 70
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : ctx.remaining_percent >= 30
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
                        return (
                          <span key={row.id} className="inline-flex items-center gap-1 text-[11px]">
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                              <Wine className="h-3 w-3" />
                              {t('withdrawals.bottleNoLabel', { no: ctx.bottle_no, total: ctx.deposit_quantity })}
                            </span>
                            {showPct && (
                              <span className={cn('inline-block rounded-full px-1.5 py-0.5 font-semibold', pctClass)}>
                                {ctx.remaining_percent}%
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* Customer + qty */}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {rep.customer_name} · x{formatNumber(group.totalRequestedQty)}
                    </p>

                    {/* Bottom row: date / time + table or take-home pill */}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatThaiDateTime(rep.created_at)}</span>
                      {rep.withdrawal_type === 'take_home' ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          <Home className="h-2.5 w-2.5" /> {t('withdrawals.takeHome')}
                        </span>
                      ) : rep.table_number ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          <MapPin className="h-2.5 w-2.5" /> โต๊ะ {rep.table_number}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {!isPending && (
                    <ChevronDown
                      className={cn(
                        'h-5 w-5 shrink-0 text-gray-400 transition-transform',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  )}
                </div>

                {isExpanded && (
                  <div className="p-4 pt-0 sm:p-5 sm:pt-0">
                    {/* Outcome-only grid — every "request" field
                        (customer / qty / table / date) already lives in
                        the header above. We only render extras: the
                        actual quantity that was withdrawn (when it
                        differs from requested), the qty-vs-bottles
                        split for multi-bottle requests, and who
                        processed it. */}
                    {(group.totalActualQty !== null ||
                      isMulti ||
                      rep.processed_by_name) && (
                      <div className="mb-4 mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                        {isMulti && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.requestedQty')}</span>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatNumber(group.totalRequestedQty)}
                              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                                ({group.rows.length} {t('withdrawals.bottlesUnitShort') || 'ขวด'})
                              </span>
                            </p>
                          </div>
                        )}
                        {group.totalActualQty !== null && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.actualQty')}</span>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatNumber(group.totalActualQty)}
                            </p>
                          </div>
                        )}
                        {rep.processed_by_name && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.processedBy')}</span>
                            <p className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
                              <User className="h-3.5 w-3.5 text-gray-400" />
                              {rep.processed_by_name}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {rep.photo_url && (
                      <div className="mb-3">
                        <img
                          src={rep.photo_url}
                          alt={t('withdrawals.photoAlt')}
                          className="h-20 w-20 rounded-lg object-cover"
                        />
                      </div>
                    )}

                    {rep.notes && (
                      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                        {t('withdrawals.notesPrefix', { notes: rep.notes })}
                      </p>
                    )}

                    {isPending && (
                      <div className="pt-3">
                        {user?.role === 'staff' && (
                          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            {t('withdrawals.staffWaitForBar')}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            className="min-h-[44px] flex-1"
                            variant="danger"
                            icon={<XCircle className="h-4 w-4" />}
                            onClick={() => openProcessModal(group, 'reject')}
                          >
                            {t('withdrawals.rejectButton')}
                          </Button>
                          {user?.role !== 'staff' && (
                            <Button
                              className="min-h-[44px] flex-1"
                              variant="primary"
                              icon={<CheckCircle2 className="h-4 w-4" />}
                              onClick={() => openProcessModal(group, 'complete')}
                            >
                              {t('withdrawals.processButton')}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Process Withdrawal Modal */}
      <Modal
        isOpen={showProcessModal}
        onClose={() => {
          setShowProcessModal(false);
          setSelectedGroup(null);
        }}
        title={processAction === 'complete' ? t('withdrawals.processTitle') : t('withdrawals.rejectTitle')}
        description={
          selectedGroup
            ? `${selectedGroup.rep.product_name} - ${selectedGroup.rep.customer_name}`
            : undefined
        }
        size="md"
      >
        <div className="space-y-4">
          {/* Summary — group-aware: lists every bottle in the request */}
          {selectedGroup && (() => {
            const rep = selectedGroup.rep;
            const code = depositCodeMap.get(rep.deposit_id);
            return (
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                <div className="space-y-2 text-sm">
                  {code && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.depositCodeLabel')}</span>
                      <span className="font-mono text-gray-900 dark:text-white">#{code}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.productLabel')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{rep.product_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.customerLabel')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{rep.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.requestedQty')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatNumber(selectedGroup.totalRequestedQty)}
                    </span>
                  </div>
                  {selectedGroup.rows.some((r) => r.bottle_id) && (
                    <div className="border-t border-gray-200 pt-2 dark:border-gray-600">
                      <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.bottleLabel')}</span>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {selectedGroup.rows.map((row) => {
                          const ctx = row.bottle_id ? bottleContext.get(row.bottle_id) : null;
                          if (!ctx) return null;
                          const showPct = row.status === 'pending' || row.status === 'approved';
                          const pctClass = ctx.remaining_percent >= 70
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : ctx.remaining_percent >= 30
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
                          return (
                            <span key={row.id} className="inline-flex items-center gap-1">
                              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                                {t('withdrawals.bottleNoLabel', { no: ctx.bottle_no, total: ctx.deposit_quantity })}
                              </span>
                              {showPct && (
                                <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold', pctClass)}>
                                  {ctx.remaining_percent}%
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {processAction === 'complete' && (
            <>
              <Input
                label={t('withdrawals.actualQtyLabel')}
                type="number"
                value={actualQty}
                onChange={(e) => setActualQty(e.target.value)}
                placeholder="0"
                hint={t('withdrawals.actualQtyHint')}
              />

              <PhotoUpload
                value={withdrawalPhotoUrl}
                onChange={(url) => setWithdrawalPhotoUrl(url)}
                folder="withdrawals"
                label={t('withdrawals.photoLabel')}
                compact={true}
              />
            </>
          )}

          <Textarea
            label={t('withdrawals.notesLabel')}
            value={processNotes}
            onChange={(e) => setProcessNotes(e.target.value)}
            placeholder={
              processAction === 'complete'
                ? t('withdrawals.completeNotesPlaceholder')
                : t('withdrawals.rejectNotesPlaceholder')
            }
            rows={3}
          />
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowProcessModal(false);
              setSelectedGroup(null);
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            variant={processAction === 'complete' ? 'primary' : 'danger'}
            onClick={handleProcess}
            isLoading={isSubmitting}
            disabled={processAction === 'complete' && (!actualQty || parseFloat(actualQty) <= 0)}
            icon={
              processAction === 'complete'
                ? <CheckCircle2 className="h-4 w-4" />
                : <XCircle className="h-4 w-4" />
            }
          >
            {processAction === 'complete' ? t('withdrawals.confirmWithdraw') : t('withdrawals.rejectButton')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Manual Withdrawal Modal */}
      <Modal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        title={manualStep === 'search' ? t('withdrawals.manual.searchTitle') : t('withdrawals.manual.confirmTitle', { count: withdrawItems.length })}
        description={
          manualStep === 'search'
            ? t('withdrawals.manual.searchDesc')
            : t('withdrawals.manual.confirmDesc')
        }
        size="lg"
      >
        {manualStep === 'search' ? (
          <div className="space-y-4">
            {/* Selected items summary bar */}
            {withdrawItems.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-4 py-2.5 dark:bg-indigo-900/20">
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                  <ShoppingCart className="h-4 w-4" />
                  {t('withdrawals.manual.selectedCount', { count: withdrawItems.length })}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setManualStep('confirm')}
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                >
                  {t('withdrawals.manual.next')}
                </Button>
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={depositSearch}
                onChange={(e) => setDepositSearch(e.target.value)}
                placeholder={t('withdrawals.manual.searchPlaceholder')}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus:border-indigo-400"
                autoFocus
              />
            </div>

            {/* Results */}
            <div className="max-h-[320px] space-y-2 overflow-y-auto">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : depositResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {depositSearch ? t('withdrawals.manual.noSearchResults') : t('withdrawals.manual.noDepositsAvailable')}
                </div>
              ) : (
                depositResults.map((dep) => {
                  const isSelected = withdrawItems.some((w) => w.deposit.id === dep.id);
                  return (
                    <button
                      key={dep.id}
                      type="button"
                      onClick={() => toggleDeposit(dep)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/30'
                          : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/20'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                              isSelected
                                ? 'border-indigo-500 bg-indigo-500 text-white'
                                : 'border-gray-300 dark:border-gray-600'
                            )}>
                              {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </div>
                            <Wine className="h-4 w-4 shrink-0 text-indigo-500" />
                            <span className="font-medium text-gray-900 dark:text-white">{dep.product_name}</span>
                          </div>
                          <div className="ml-7 mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {dep.customer_name}
                            </span>
                            <span className="font-mono">{dep.deposit_code}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="info">
                            {t('withdrawals.manual.remaining', { remaining: formatNumber(dep.remaining_qty), total: formatNumber(dep.quantity) })}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Items with qty inputs */}
            <div className="max-h-[280px] space-y-3 overflow-y-auto">
              {withdrawItems.map((item) => {
                const q = parseFloat(item.qty);
                const hasError = item.qty !== '' && (isNaN(q) || q <= 0 || q > item.deposit.remaining_qty);
                return (
                  <div
                    key={item.deposit.id}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Wine className="h-4 w-4 shrink-0 text-indigo-500" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{item.deposit.product_name}</span>
                        </div>
                        <div className="ml-6 mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>{item.deposit.customer_name}</span>
                          <span className="font-mono">{item.deposit.deposit_code}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.deposit.id)}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateItemQty(item.deposit.id, e.target.value)}
                        className={cn(
                          'w-24 rounded-lg border bg-white px-3 py-1.5 text-sm transition-colors',
                          'focus:outline-none focus:ring-1',
                          'dark:bg-gray-800 dark:text-white',
                          hasError
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600'
                        )}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        / {formatNumber(item.deposit.remaining_qty)} {t('withdrawals.manual.unit')}
                      </span>
                      {hasError && q > item.deposit.remaining_qty && (
                        <span className="text-xs text-red-500">{t('withdrawals.manual.exceedsRemaining')}</span>
                      )}
                    </div>

                    {/* Per-bottle selector */}
                    {item.bottles.length > 0 && (
                      <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-700">
                        <p className="mb-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                          เลือกขวดที่จะเบิก ({item.selectedBottleIds.size} / {item.bottles.filter(b => b.status !== 'consumed').length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.bottles.map((b) => {
                            const isConsumed = b.status === 'consumed';
                            const isSelected = item.selectedBottleIds.has(b.id);
                            return (
                              <button
                                key={b.id}
                                type="button"
                                disabled={isConsumed}
                                onClick={() => {
                                  setWithdrawItems((prev) =>
                                    prev.map((w) => {
                                      if (w.deposit.id !== item.deposit.id) return w;
                                      const next = new Set(w.selectedBottleIds);
                                      if (next.has(b.id)) next.delete(b.id);
                                      else next.add(b.id);
                                      return { ...w, qty: String(next.size), selectedBottleIds: next };
                                    }),
                                  );
                                }}
                                className={cn(
                                  'flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors',
                                  isConsumed
                                    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600'
                                    : isSelected
                                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300'
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
                                )}
                              >
                                <span className="font-semibold">
                                  {b.bottle_no}/{item.bottles.length}
                                </span>
                                <span className="text-[10px]">
                                  {isConsumed ? 'เบิกแล้ว' : `${b.remaining_percent}%`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {withdrawItems.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('withdrawals.manual.noItemsSelected')}
              </div>
            )}

            {/* Withdrawal type selector */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('withdrawals.manual.withdrawType')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => !blockedDayInfo?.blocked && setManualWithdrawalType('in_store')}
                  disabled={blockedDayInfo?.blocked}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    manualWithdrawalType === 'in_store'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-300'
                      : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400',
                    blockedDayInfo?.blocked && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <Wine className="h-4 w-4" />
                  {t('withdrawals.manual.inStore')}
                </button>
                <button
                  type="button"
                  onClick={() => setManualWithdrawalType('take_home')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    manualWithdrawalType === 'take_home'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-300'
                      : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400',
                  )}
                >
                  <Home className="h-4 w-4" />
                  {t('withdrawals.manual.takeHome')}
                </button>
              </div>
              {blockedDayInfo?.blocked && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {t('withdrawals.blockedDayOnly')}
                </p>
              )}
            </div>

            {/* Table number — required when serving in store so bar
                knows where to deliver the bottle. */}
            {manualWithdrawalType === 'in_store' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('withdrawals.manual.tableLabel')}
                </label>
                <input
                  type="text"
                  value={manualTableNumber}
                  onChange={(e) => setManualTableNumber(e.target.value)}
                  placeholder={t('withdrawals.manual.tablePlaceholder')}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            )}

            <PhotoUpload
              value={manualPhotoUrl}
              onChange={(url) => setManualPhotoUrl(url)}
              folder="withdrawals"
              label={t('withdrawals.manual.photoLabel')}
              compact={true}
            />

            <Textarea
              label={t('withdrawals.manual.notesLabel')}
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder={t('withdrawals.manual.notesPlaceholder')}
              rows={2}
            />
          </div>
        )}

        <ModalFooter>
          {manualStep === 'confirm' ? (
            <>
              <Button
                variant="outline"
                onClick={() => setManualStep('search')}
              >
                {t('withdrawals.manual.backToSearch')}
              </Button>
              <Button
                variant="primary"
                onClick={handleManualWithdrawal}
                isLoading={isManualSubmitting}
                disabled={validItems.length === 0}
                icon={<Minus className="h-4 w-4" />}
              >
                {t('withdrawals.manual.confirmItems', { count: validItems.length })}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setShowManualModal(false)}
              >
                {t('withdrawals.manual.close')}
              </Button>
              {withdrawItems.length > 0 && (
                <Button
                  variant="primary"
                  onClick={() => setManualStep('confirm')}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                >
                  {t('withdrawals.manual.nextCount', { count: withdrawItems.length })}
                </Button>
              )}
            </>
          )}
        </ModalFooter>
      </Modal>
    </div>
  );
}
