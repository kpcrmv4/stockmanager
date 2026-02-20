'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Badge,
  Card,
  Modal,
  ModalFooter,
  Input,
  Textarea,
  EmptyState,
  PhotoUpload,
  toast,
} from '@/components/ui';
import { formatThaiDateTime, formatNumber } from '@/lib/utils/format';
import { DEPOSIT_STATUS_LABELS, WITHDRAWAL_STATUS_LABELS } from '@/lib/utils/constants';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications/client';
import { TableCardGrid, type TableCardItem } from '@/components/deposit/table-card-grid';
import { useRealtime } from '@/hooks/use-realtime';
import { cn } from '@/lib/utils/cn';
import {
  CheckCircle,
  XCircle,
  Wine,
  Package,
  Clock,
  User,
  Loader2,
  Inbox,
  RefreshCw,
  Camera,
  Image as ImageIcon,
  Hash,
  MessageSquare,
  MapPin,
  LayoutGrid,
  List,
} from 'lucide-react';
import { StockCountBanner } from '@/components/stock/stock-count-banner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabType = 'deposit' | 'withdrawal';

interface DepositRow {
  id: string;
  deposit_code: string;
  store_id: string;
  customer_id: string | null;
  line_user_id: string | null;
  customer_name: string;
  product_name: string;
  category: string | null;
  quantity: number;
  remaining_qty: number;
  remaining_percent: number;
  table_number: string | null;
  status: string;
  notes: string | null;
  customer_photo_url: string | null;
  received_photo_url: string | null;
  received_by: string | null;
  created_at: string;
  // joined profile
  received_by_profile?: { display_name: string | null } | null;
}

interface WithdrawalRow {
  id: string;
  deposit_id: string;
  store_id: string;
  customer_id: string | null;
  line_user_id: string | null;
  customer_name: string | null;
  product_name: string | null;
  requested_qty: number | null;
  actual_qty: number | null;
  table_number: string | null;
  status: string;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  // joined deposit for context
  deposits?: {
    id: string;
    deposit_code: string;
    remaining_qty: number;
    status: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Confirm deposit modal state
// ---------------------------------------------------------------------------

interface ConfirmDepositState {
  deposit: DepositRow;
  photoUrl: string | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Reject deposit modal state
// ---------------------------------------------------------------------------

interface RejectDepositState {
  deposit: DepositRow;
  reason: string;
}

// ---------------------------------------------------------------------------
// Complete withdrawal modal state
// ---------------------------------------------------------------------------

interface CompleteWithdrawalState {
  withdrawal: WithdrawalRow;
  actualQty: string;
  photoUrl: string | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Reject withdrawal modal state
// ---------------------------------------------------------------------------

interface RejectWithdrawalState {
  withdrawal: WithdrawalRow;
  reason: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BarApprovalPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabType>('deposit');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

  // Modal states
  const [confirmDeposit, setConfirmDeposit] = useState<ConfirmDepositState | null>(null);
  const [rejectDeposit, setRejectDeposit] = useState<RejectDepositState | null>(null);
  const [completeWithdrawal, setCompleteWithdrawal] = useState<CompleteWithdrawalState | null>(null);
  const [rejectWithdrawal, setRejectWithdrawal] = useState<RejectWithdrawalState | null>(null);

  // Expanded photo state - which deposit id has its photo expanded
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  // Ref to track mounted state for safe async setState
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadDeposits = useCallback(async () => {
    if (!currentStoreId) return;
    const supabase = createClient();

    const { data, error } = await supabase
      .from('deposits')
      .select('id, deposit_code, store_id, customer_id, line_user_id, customer_name, product_name, category, quantity, remaining_qty, remaining_percent, table_number, status, notes, customer_photo_url, received_photo_url, received_by, created_at, received_by_profile:profiles!deposits_received_by_fkey(display_name)')
      .eq('store_id', currentStoreId)
      .eq('status', 'pending_confirm')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load deposits:', error);
      // Try simpler query without join if foreign key doesn't exist
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('deposits')
        .select('*')
        .eq('store_id', currentStoreId)
        .eq('status', 'pending_confirm')
        .order('created_at', { ascending: true });

      if (fallbackError) {
        toast({ type: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', message: 'ไม่สามารถโหลดรายการฝากเหล้ารอยืนยันได้' });
        return;
      }
      setDeposits((fallbackData ?? []) as unknown as DepositRow[]);
      return;
    }

    // Supabase may return joined fields as arrays; normalize to single objects
    const normalized = (data ?? []).map((row: Record<string, unknown>) => {
      const profile = Array.isArray(row.received_by_profile)
        ? row.received_by_profile[0] ?? null
        : row.received_by_profile ?? null;
      return { ...row, received_by_profile: profile };
    });
    setDeposits(normalized as unknown as DepositRow[]);
  }, [currentStoreId]);

  const loadWithdrawals = useCallback(async () => {
    if (!currentStoreId) return;
    const supabase = createClient();

    const { data, error } = await supabase
      .from('withdrawals')
      .select('id, deposit_id, store_id, customer_id, line_user_id, customer_name, product_name, requested_qty, actual_qty, table_number, status, notes, photo_url, created_at, deposits(id, deposit_code, remaining_qty, status)')
      .eq('store_id', currentStoreId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load withdrawals:', error);
      // Fallback without join
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('store_id', currentStoreId)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: true });

      if (fallbackError) {
        toast({ type: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', message: 'ไม่สามารถโหลดรายการเบิกเหล้ารอดำเนินการได้' });
        return;
      }
      setWithdrawals((fallbackData ?? []) as unknown as WithdrawalRow[]);
      return;
    }

    // Supabase may return joined deposit as array; normalize to single object
    const normalized = (data ?? []).map((row: Record<string, unknown>) => {
      const dep = Array.isArray(row.deposits)
        ? row.deposits[0] ?? null
        : row.deposits ?? null;
      return { ...row, deposits: dep };
    });
    setWithdrawals(normalized as unknown as WithdrawalRow[]);
  }, [currentStoreId]);

  const loadAll = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    await Promise.all([loadDeposits(), loadWithdrawals()]);
    if (mountedRef.current) setIsLoading(false);
  }, [loadDeposits, loadWithdrawals]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime updates
  useRealtime({
    table: 'deposits',
    filter: `store_id=eq.${currentStoreId}`,
    onInsert: () => loadAll(),
    onUpdate: () => loadAll(),
    enabled: !!currentStoreId,
  });

  useRealtime({
    table: 'withdrawals',
    filter: `store_id=eq.${currentStoreId}`,
    onInsert: () => loadAll(),
    onUpdate: () => loadAll(),
    enabled: !!currentStoreId,
  });

  // -----------------------------------------------------------------------
  // Deposit: confirm
  // -----------------------------------------------------------------------

  const handleConfirmDeposit = async () => {
    if (!confirmDeposit || !user) return;
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { deposit, photoUrl, notes } = confirmDeposit;

      const { error } = await supabase
        .from('deposits')
        .update({
          status: 'in_store',
          confirm_photo_url: photoUrl,
          notes: notes
            ? deposit.notes
              ? `${deposit.notes}\n[บาร์ยืนยัน] ${notes}`
              : `[บาร์ยืนยัน] ${notes}`
            : deposit.notes,
        })
        .eq('id', deposit.id);

      if (error) throw error;

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_BAR_CONFIRMED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { status: 'pending_confirm' },
        new_value: { status: 'in_store', confirm_photo_url: photoUrl },
        changed_by: user.id,
      });

      toast({ type: 'success', title: 'ยืนยันสำเร็จ', message: `ฝากเหล้า ${deposit.product_name} ยืนยันเรียบร้อย` });

      // Notify the customer that their deposit has been confirmed
      if (deposit.customer_id) {
        sendNotification({
          userId: deposit.customer_id,
          storeId: deposit.store_id,
          type: 'deposit_confirmed',
          title: 'ฝากเหล้าสำเร็จ',
          body: `${deposit.product_name} (${deposit.deposit_code}) ได้รับการยืนยัน`,
          data: { deposit_id: deposit.id, deposit_code: deposit.deposit_code },
          lineUserId: deposit.line_user_id ?? undefined,
        });
      }

      setConfirmDeposit(null);
      await loadAll();
    } catch (err) {
      console.error('Confirm deposit error:', err);
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถยืนยันรายการได้ กรุณาลองใหม่' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Deposit: reject (use status='expired' as workaround)
  // -----------------------------------------------------------------------

  const handleRejectDeposit = async () => {
    if (!rejectDeposit || !user) return;
    if (!rejectDeposit.reason.trim()) {
      toast({ type: 'warning', title: 'กรุณาระบุเหตุผล', message: 'ต้องระบุเหตุผลในการปฏิเสธ' });
      return;
    }
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { deposit, reason } = rejectDeposit;

      const rejectNote = `บาร์ปฏิเสธ: ${reason.trim()}`;
      const updatedNotes = deposit.notes ? `${deposit.notes}\n${rejectNote}` : rejectNote;

      const { error } = await supabase
        .from('deposits')
        .update({
          status: 'expired',
          remaining_qty: 0,
          notes: updatedNotes,
        })
        .eq('id', deposit.id);

      if (error) throw error;

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_BAR_REJECTED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { status: 'pending_confirm' },
        new_value: { status: 'expired', reason: reason.trim() },
        changed_by: user.id,
      });

      toast({ type: 'success', title: 'ปฏิเสธสำเร็จ', message: `รายการฝากเหล้า ${deposit.product_name} ถูกปฏิเสธ` });

      // Notify the customer that their deposit has been rejected
      if (deposit.customer_id) {
        sendNotification({
          userId: deposit.customer_id,
          storeId: deposit.store_id,
          type: 'deposit_confirmed',
          title: 'การฝากเหล้าถูกปฏิเสธ',
          body: `${deposit.product_name} (${deposit.deposit_code}) ไม่ได้รับการยืนยัน`,
          data: { deposit_id: deposit.id, deposit_code: deposit.deposit_code },
          lineUserId: deposit.line_user_id ?? undefined,
        });
      }

      setRejectDeposit(null);
      await loadAll();
    } catch (err) {
      console.error('Reject deposit error:', err);
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถปฏิเสธรายการได้ กรุณาลองใหม่' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Withdrawal: complete
  // -----------------------------------------------------------------------

  const handleCompleteWithdrawal = async () => {
    if (!completeWithdrawal || !user) return;

    const actualQty = parseInt(completeWithdrawal.actualQty, 10);
    if (isNaN(actualQty) || actualQty <= 0) {
      toast({ type: 'warning', title: 'จำนวนไม่ถูกต้อง', message: 'กรุณาระบุจำนวนที่เบิกจริง' });
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { withdrawal, photoUrl, notes } = completeWithdrawal;

      // Update withdrawal
      const { error: wError } = await supabase
        .from('withdrawals')
        .update({
          status: 'completed',
          actual_qty: actualQty,
          processed_by: user.id,
          photo_url: photoUrl,
          notes: notes
            ? withdrawal.notes
              ? `${withdrawal.notes}\n[บาร์ดำเนินการ] ${notes}`
              : `[บาร์ดำเนินการ] ${notes}`
            : withdrawal.notes,
        })
        .eq('id', withdrawal.id);

      if (wError) throw wError;

      // Update deposit remaining_qty
      if (withdrawal.deposit_id) {
        // Fetch current deposit to get fresh remaining_qty
        const { data: depositData } = await supabase
          .from('deposits')
          .select('remaining_qty')
          .eq('id', withdrawal.deposit_id)
          .single();

        if (depositData) {
          const newRemaining = Math.max(0, depositData.remaining_qty - actualQty);
          const newStatus = newRemaining <= 0 ? 'withdrawn' : 'in_store';

          const { error: dError } = await supabase
            .from('deposits')
            .update({
              remaining_qty: newRemaining,
              status: newStatus,
            })
            .eq('id', withdrawal.deposit_id);

          if (dError) {
            console.error('Failed to update deposit remaining qty:', dError);
          }
        }
      }

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_COMPLETED,
        table_name: 'withdrawals',
        record_id: withdrawal.id,
        old_value: { status: withdrawal.status, requested_qty: withdrawal.requested_qty },
        new_value: { status: 'completed', actual_qty: actualQty, photo_url: photoUrl },
        changed_by: user.id,
      });

      toast({ type: 'success', title: 'เบิกเหล้าสำเร็จ', message: `${withdrawal.product_name} เบิก ${formatNumber(actualQty)} เรียบร้อย` });

      // Notify the customer that their withdrawal has been completed
      if (withdrawal.customer_id) {
        sendNotification({
          userId: withdrawal.customer_id,
          storeId: withdrawal.store_id,
          type: 'withdrawal_completed',
          title: 'เบิกเหล้าสำเร็จ',
          body: `${withdrawal.product_name} จำนวน ${formatNumber(actualQty)}`,
          data: { withdrawal_id: withdrawal.id, deposit_id: withdrawal.deposit_id },
          lineUserId: withdrawal.line_user_id ?? undefined,
        });
      }

      setCompleteWithdrawal(null);
      await loadAll();
    } catch (err) {
      console.error('Complete withdrawal error:', err);
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถดำเนินการเบิกได้ กรุณาลองใหม่' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Withdrawal: reject
  // -----------------------------------------------------------------------

  const handleRejectWithdrawal = async () => {
    if (!rejectWithdrawal || !user) return;
    if (!rejectWithdrawal.reason.trim()) {
      toast({ type: 'warning', title: 'กรุณาระบุเหตุผล', message: 'ต้องระบุเหตุผลในการปฏิเสธ' });
      return;
    }
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { withdrawal, reason } = rejectWithdrawal;

      const rejectNote = `บาร์ปฏิเสธ: ${reason.trim()}`;
      const updatedNotes = withdrawal.notes ? `${withdrawal.notes}\n${rejectNote}` : rejectNote;

      // Update withdrawal to rejected
      const { error: wError } = await supabase
        .from('withdrawals')
        .update({
          status: 'rejected',
          processed_by: user.id,
          notes: updatedNotes,
        })
        .eq('id', withdrawal.id);

      if (wError) throw wError;

      // Reset deposit status from pending_withdrawal back to in_store
      if (withdrawal.deposit_id) {
        const { error: dError } = await supabase
          .from('deposits')
          .update({ status: 'in_store' })
          .eq('id', withdrawal.deposit_id)
          .eq('status', 'pending_withdrawal');

        if (dError) {
          console.error('Failed to reset deposit status:', dError);
        }
      }

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_REJECTED,
        table_name: 'withdrawals',
        record_id: withdrawal.id,
        old_value: { status: withdrawal.status },
        new_value: { status: 'rejected', reason: reason.trim() },
        changed_by: user.id,
      });

      toast({ type: 'success', title: 'ปฏิเสธสำเร็จ', message: `การเบิก ${withdrawal.product_name} ถูกปฏิเสธ` });

      // Notify the customer that their withdrawal has been rejected
      if (withdrawal.customer_id) {
        sendNotification({
          userId: withdrawal.customer_id,
          storeId: withdrawal.store_id,
          type: 'withdrawal_completed',
          title: 'การเบิกเหล้าถูกปฏิเสธ',
          body: `${withdrawal.product_name} - การเบิกถูกปฏิเสธ`,
          data: { withdrawal_id: withdrawal.id, deposit_id: withdrawal.deposit_id },
          lineUserId: withdrawal.line_user_id ?? undefined,
        });
      }

      setRejectWithdrawal(null);
      await loadAll();
    } catch (err) {
      console.error('Reject withdrawal error:', err);
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถปฏิเสธการเบิกได้ กรุณาลองใหม่' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Grid view data mapping
  // -----------------------------------------------------------------------

  // Map deposits to TableCardItem for grid view
  const depositGridItems = useMemo<TableCardItem[]>(() => deposits.map((d) => ({
    id: d.id,
    type: 'deposit' as const,
    tableNumber: d.table_number,
    customerName: d.customer_name,
    customerPhone: null,
    productName: d.product_name,
    quantity: d.quantity,
    status: d.status,
    notes: d.notes,
    photoUrl: d.customer_photo_url || d.received_photo_url,
    createdAt: d.created_at,
    depositCode: d.deposit_code,
    storeId: d.store_id,
    rawData: d as unknown as Record<string, unknown>,
  })), [deposits]);

  const withdrawalGridItems = useMemo<TableCardItem[]>(() => withdrawals.map((w) => ({
    id: w.id,
    type: 'withdrawal' as const,
    tableNumber: w.table_number,
    customerName: w.customer_name || 'ลูกค้า',
    productName: w.product_name,
    quantity: w.requested_qty,
    status: w.status,
    notes: w.notes,
    photoUrl: w.photo_url,
    createdAt: w.created_at,
    depositCode: w.deposits?.deposit_code,
    depositId: w.deposit_id,
    storeId: w.store_id,
    rawData: w as unknown as Record<string, unknown>,
  })), [withdrawals]);

  // -----------------------------------------------------------------------
  // Grid item click handler
  // -----------------------------------------------------------------------

  const handleGridItemClick = useCallback((item: TableCardItem) => {
    if (item.type === 'deposit') {
      const deposit = deposits.find((d) => d.id === item.id);
      if (deposit) {
        setConfirmDeposit({ deposit, photoUrl: null, notes: '' });
      }
    } else {
      const withdrawal = withdrawals.find((w) => w.id === item.id);
      if (withdrawal) {
        setCompleteWithdrawal({
          withdrawal,
          actualQty: String(withdrawal.requested_qty ?? 1),
          photoUrl: null,
          notes: '',
        });
      }
    }
  }, [deposits, withdrawals]);

  // -----------------------------------------------------------------------
  // Counts
  // -----------------------------------------------------------------------

  const depositCount = deposits.length;
  const withdrawalCount = withdrawals.length;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            รายการรออนุมัติ
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            ตรวจสอบและอนุมัติรายการฝาก-เบิกเหล้า
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === 'grid'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-400'
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-400'
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />}
            onClick={loadAll}
            disabled={isLoading}
          >
            รีเฟรช
          </Button>
        </div>
      </div>

      {/* Stock Count Banner */}
      <StockCountBanner />

      {/* Summary Counts */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setActiveTab('deposit')}
          className={cn(
            'rounded-xl p-4 text-left transition-all',
            activeTab === 'deposit'
              ? 'bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-900/40 dark:ring-amber-500'
              : 'bg-amber-50 dark:bg-amber-900/20'
          )}
        >
          <div className="flex items-center gap-2">
            <Wine className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              ฝากรอยืนยัน
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">
            {depositCount}
          </p>
        </button>
        <button
          onClick={() => setActiveTab('withdrawal')}
          className={cn(
            'rounded-xl p-4 text-left transition-all',
            activeTab === 'withdrawal'
              ? 'bg-blue-100 ring-2 ring-blue-400 dark:bg-blue-900/40 dark:ring-blue-500'
              : 'bg-blue-50 dark:bg-blue-900/20'
          )}
        >
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              เบิกรอดำเนินการ
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">
            {withdrawalCount}
          </p>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        <button
          onClick={() => setActiveTab('deposit')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors',
            activeTab === 'deposit'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
              : 'text-gray-500 dark:text-gray-400'
          )}
        >
          <Wine className="h-4 w-4" />
          ฝากรอยืนยัน
          {depositCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {depositCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('withdrawal')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors',
            activeTab === 'withdrawal'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
              : 'text-gray-500 dark:text-gray-400'
          )}
        >
          <Package className="h-4 w-4" />
          เบิกรอดำเนินการ
          {withdrawalCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {withdrawalCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : viewMode === 'grid' ? (
        // GRID VIEW
        <TableCardGrid
          items={activeTab === 'deposit' ? depositGridItems : withdrawalGridItems}
          onItemClick={handleGridItemClick}
          isLoading={isLoading}
          emptyMessage={
            activeTab === 'deposit'
              ? 'ไม่มีรายการฝากรอยืนยัน'
              : 'ไม่มีรายการเบิกรอดำเนินการ'
          }
        />
      ) : activeTab === 'deposit' ? (
        /* ================================================================
         *  DEPOSITS TAB
         * ================================================================ */
        <div className="space-y-3">
          {deposits.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="ไม่มีรายการฝากรอยืนยัน"
              description="รายการฝากเหล้าที่พนักงานสร้างจะแสดงที่นี่"
            />
          ) : (
            deposits.map((deposit) => {
              const staffName =
                deposit.received_by_profile?.display_name || 'ไม่ระบุ';

              return (
                <Card key={deposit.id} padding="none">
                  <div className="p-4">
                    {/* Product + status */}
                    <div className="mb-3 flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {deposit.product_name}
                        </h3>
                        {deposit.category && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {deposit.category}
                          </p>
                        )}
                      </div>
                      <Badge variant="warning" size="sm">
                        {DEPOSIT_STATUS_LABELS[deposit.status] || deposit.status}
                      </Badge>
                    </div>

                    {/* Info rows */}
                    <div className="mb-3 space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>{deposit.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Hash className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>จำนวน: {formatNumber(deposit.quantity)}{deposit.remaining_percent != null ? ` (${deposit.remaining_percent}%)` : ''}</span>
                      </div>
                      {deposit.table_number && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span>{deposit.table_number}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="text-gray-400 dark:text-gray-500">ผู้รับ:</span>
                        <span>{staffName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>{formatThaiDateTime(deposit.created_at)}</span>
                      </div>
                      {deposit.notes && (
                        <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span>{deposit.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Customer photo thumbnail */}
                    {deposit.customer_photo_url && (
                      <div className="mb-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPhoto(
                              expandedPhoto === deposit.id ? null : deposit.id
                            )
                          }
                          className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          {expandedPhoto === deposit.id ? 'ซ่อนรูปลูกค้า' : 'ดูรูปจากลูกค้า'}
                        </button>
                        {expandedPhoto === deposit.id && (
                          <img
                            src={deposit.customer_photo_url}
                            alt="รูปจากลูกค้า"
                            className="mt-2 max-h-48 w-full rounded-lg object-cover"
                          />
                        )}
                      </div>
                    )}

                    {/* Received photo thumbnail */}
                    {deposit.received_photo_url && !deposit.customer_photo_url && (
                      <div className="mb-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPhoto(
                              expandedPhoto === `recv-${deposit.id}` ? null : `recv-${deposit.id}`
                            )
                          }
                          className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          {expandedPhoto === `recv-${deposit.id}` ? 'ซ่อนรูปรับของ' : 'ดูรูปรับของ'}
                        </button>
                        {expandedPhoto === `recv-${deposit.id}` && (
                          <img
                            src={deposit.received_photo_url}
                            alt="รูปรับของ"
                            className="mt-2 max-h-48 w-full rounded-lg object-cover"
                          />
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Button
                        className="min-h-[44px] flex-1"
                        variant="primary"
                        icon={<CheckCircle className="h-4 w-4" />}
                        onClick={() =>
                          setConfirmDeposit({
                            deposit,
                            photoUrl: null,
                            notes: '',
                          })
                        }
                      >
                        ยืนยันรับ
                      </Button>
                      <Button
                        className="min-h-[44px] flex-1"
                        variant="danger"
                        icon={<XCircle className="h-4 w-4" />}
                        onClick={() =>
                          setRejectDeposit({
                            deposit,
                            reason: '',
                          })
                        }
                      >
                        ปฏิเสธ
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* ================================================================
         *  WITHDRAWALS TAB
         * ================================================================ */
        <div className="space-y-3">
          {withdrawals.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="ไม่มีรายการเบิกรอดำเนินการ"
              description="รายการเบิกเหล้าที่ลูกค้าหรือพนักงานร้องขอจะแสดงที่นี่"
            />
          ) : (
            withdrawals.map((withdrawal) => {
              const depositCode = withdrawal.deposits?.deposit_code;
              const statusVariant: 'warning' | 'info' =
                withdrawal.status === 'pending' ? 'warning' : 'info';

              return (
                <Card key={withdrawal.id} padding="none">
                  <div className="p-4">
                    {/* Product + status */}
                    <div className="mb-3 flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {withdrawal.product_name || 'ไม่ระบุสินค้า'}
                        </h3>
                        {depositCode && (
                          <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                            {depositCode}
                          </p>
                        )}
                      </div>
                      <Badge variant={statusVariant} size="sm">
                        {WITHDRAWAL_STATUS_LABELS[withdrawal.status] || withdrawal.status}
                      </Badge>
                    </div>

                    {/* Info rows */}
                    <div className="mb-3 space-y-1.5 text-sm">
                      {withdrawal.customer_name && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span>{withdrawal.customer_name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Hash className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>ขอเบิก: {withdrawal.requested_qty != null ? formatNumber(withdrawal.requested_qty) : '-'}</span>
                      </div>
                      {withdrawal.table_number && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span>{withdrawal.table_number}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>{formatThaiDateTime(withdrawal.created_at)}</span>
                      </div>
                      {withdrawal.notes && (
                        <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span>{withdrawal.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Button
                        className="min-h-[44px] flex-1"
                        variant="primary"
                        icon={<CheckCircle className="h-4 w-4" />}
                        onClick={() =>
                          setCompleteWithdrawal({
                            withdrawal,
                            actualQty: String(withdrawal.requested_qty ?? 1),
                            photoUrl: null,
                            notes: '',
                          })
                        }
                      >
                        ดำเนินการ
                      </Button>
                      <Button
                        className="min-h-[44px] flex-1"
                        variant="danger"
                        icon={<XCircle className="h-4 w-4" />}
                        onClick={() =>
                          setRejectWithdrawal({
                            withdrawal,
                            reason: '',
                          })
                        }
                      >
                        ปฏิเสธ
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ==================================================================
       *  MODAL: Confirm Deposit
       * ================================================================== */}
      <Modal
        isOpen={!!confirmDeposit}
        onClose={() => !isSubmitting && setConfirmDeposit(null)}
        title="ยืนยันรับฝากเหล้า"
        description={confirmDeposit ? `${confirmDeposit.deposit.product_name} - ${confirmDeposit.deposit.customer_name}` : undefined}
        size="md"
      >
        {confirmDeposit && (
          <div className="space-y-4">
            <PhotoUpload
              value={confirmDeposit.photoUrl}
              onChange={(url) =>
                setConfirmDeposit((prev) =>
                  prev ? { ...prev, photoUrl: url } : null
                )
              }
              folder="deposits"
              label="ถ่ายรูปยืนยัน"
              compact={false}
            />

            <Textarea
              label="หมายเหตุ (ไม่บังคับ)"
              placeholder="เช่น ตรวจสอบแล้ว ขวดสมบูรณ์..."
              rows={3}
              value={confirmDeposit.notes}
              onChange={(e) =>
                setConfirmDeposit((prev) =>
                  prev ? { ...prev, notes: e.target.value } : null
                )
              }
              disabled={isSubmitting}
            />

            <ModalFooter className="px-0 pb-0 border-t-0">
              <Button
                variant="outline"
                onClick={() => setConfirmDeposit(null)}
                disabled={isSubmitting}
                className="min-h-[44px]"
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmDeposit}
                isLoading={isSubmitting}
                icon={<CheckCircle className="h-4 w-4" />}
                className="min-h-[44px]"
              >
                ยืนยันรับ
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>

      {/* ==================================================================
       *  MODAL: Reject Deposit
       * ================================================================== */}
      <Modal
        isOpen={!!rejectDeposit}
        onClose={() => !isSubmitting && setRejectDeposit(null)}
        title="ปฏิเสธรายการฝากเหล้า"
        description={rejectDeposit ? `${rejectDeposit.deposit.product_name} - ${rejectDeposit.deposit.customer_name}` : undefined}
        size="md"
      >
        {rejectDeposit && (
          <div className="space-y-4">
            <Textarea
              label="เหตุผลในการปฏิเสธ"
              placeholder="เช่น ขวดไม่ตรงกับที่แจ้ง, สินค้าเสียหาย..."
              rows={3}
              value={rejectDeposit.reason}
              onChange={(e) =>
                setRejectDeposit((prev) =>
                  prev ? { ...prev, reason: e.target.value } : null
                )
              }
              disabled={isSubmitting}
              error={rejectDeposit.reason.trim() === '' ? undefined : undefined}
            />

            <ModalFooter className="px-0 pb-0 border-t-0">
              <Button
                variant="outline"
                onClick={() => setRejectDeposit(null)}
                disabled={isSubmitting}
                className="min-h-[44px]"
              >
                ยกเลิก
              </Button>
              <Button
                variant="danger"
                onClick={handleRejectDeposit}
                isLoading={isSubmitting}
                icon={<XCircle className="h-4 w-4" />}
                className="min-h-[44px]"
              >
                ปฏิเสธ
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>

      {/* ==================================================================
       *  MODAL: Complete Withdrawal
       * ================================================================== */}
      <Modal
        isOpen={!!completeWithdrawal}
        onClose={() => !isSubmitting && setCompleteWithdrawal(null)}
        title="ดำเนินการเบิกเหล้า"
        description={completeWithdrawal ? `${completeWithdrawal.withdrawal.product_name} - ${completeWithdrawal.withdrawal.customer_name}` : undefined}
        size="md"
      >
        {completeWithdrawal && (
          <div className="space-y-4">
            <Input
              label="จำนวนที่เบิกจริง"
              type="number"
              min={1}
              value={completeWithdrawal.actualQty}
              onChange={(e) =>
                setCompleteWithdrawal((prev) =>
                  prev ? { ...prev, actualQty: e.target.value } : null
                )
              }
              disabled={isSubmitting}
              hint={`ลูกค้าขอเบิก: ${completeWithdrawal.withdrawal.requested_qty ?? '-'}`}
            />

            <PhotoUpload
              value={completeWithdrawal.photoUrl}
              onChange={(url) =>
                setCompleteWithdrawal((prev) =>
                  prev ? { ...prev, photoUrl: url } : null
                )
              }
              folder="withdrawals"
              label="ถ่ายรูปประกอบการเบิก"
              compact
            />

            <Textarea
              label="หมายเหตุ (ไม่บังคับ)"
              placeholder="เช่น เบิกบางส่วน, ลูกค้ามารับเอง..."
              rows={2}
              value={completeWithdrawal.notes}
              onChange={(e) =>
                setCompleteWithdrawal((prev) =>
                  prev ? { ...prev, notes: e.target.value } : null
                )
              }
              disabled={isSubmitting}
            />

            <ModalFooter className="px-0 pb-0 border-t-0">
              <Button
                variant="outline"
                onClick={() => setCompleteWithdrawal(null)}
                disabled={isSubmitting}
                className="min-h-[44px]"
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                onClick={handleCompleteWithdrawal}
                isLoading={isSubmitting}
                icon={<CheckCircle className="h-4 w-4" />}
                className="min-h-[44px]"
              >
                เบิกสำเร็จ
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>

      {/* ==================================================================
       *  MODAL: Reject Withdrawal
       * ================================================================== */}
      <Modal
        isOpen={!!rejectWithdrawal}
        onClose={() => !isSubmitting && setRejectWithdrawal(null)}
        title="ปฏิเสธการเบิกเหล้า"
        description={rejectWithdrawal ? `${rejectWithdrawal.withdrawal.product_name} - ${rejectWithdrawal.withdrawal.customer_name}` : undefined}
        size="md"
      >
        {rejectWithdrawal && (
          <div className="space-y-4">
            <Textarea
              label="เหตุผลในการปฏิเสธ"
              placeholder="เช่น ขวดไม่พบในร้าน, ข้อมูลไม่ตรง..."
              rows={3}
              value={rejectWithdrawal.reason}
              onChange={(e) =>
                setRejectWithdrawal((prev) =>
                  prev ? { ...prev, reason: e.target.value } : null
                )
              }
              disabled={isSubmitting}
            />

            <ModalFooter className="px-0 pb-0 border-t-0">
              <Button
                variant="outline"
                onClick={() => setRejectWithdrawal(null)}
                disabled={isSubmitting}
                className="min-h-[44px]"
              >
                ยกเลิก
              </Button>
              <Button
                variant="danger"
                onClick={handleRejectWithdrawal}
                isLoading={isSubmitting}
                icon={<XCircle className="h-4 w-4" />}
                className="min-h-[44px]"
              >
                ปฏิเสธ
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>
    </div>
  );
}
