'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { useRealtime } from '@/hooks/use-realtime';
import {
  TableCardGrid,
  type TableCardItem,
} from '@/components/deposit/table-card-grid';
import { RequestDetailModal } from '@/components/deposit/request-detail-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { notifyStaff } from '@/lib/notifications/client';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { formatThaiDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { bangkokDateParts, expiryDateISO } from '@/lib/utils/date';
import { ScanLine, Wine, Package } from 'lucide-react';
import { StockCountBanner } from '@/components/stock/stock-count-banner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DepositRequestRow {
  id: string;
  store_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  table_number: string | null;
  product_name: string | null;
  quantity: number | null;
  status: string;
  notes: string | null;
  customer_photo_url: string | null;
  line_user_id: string | null;
  created_at: string;
}

interface WithdrawalRow {
  id: string;
  store_id: string;
  deposit_id: string;
  customer_name: string | null;
  product_name: string | null;
  requested_qty: number | null;
  table_number: string | null;
  status: string;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  deposits?: { deposit_code: string } | null;
}

interface AcceptFormState {
  productName: string;
  category: string;
  quantity: string;
  remainingPercent: string;
  storageDays: string;
}

interface RejectState {
  item: TableCardItem;
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: 'whisky', label: 'Whisky' },
  { value: 'vodka', label: 'Vodka' },
  { value: 'wine', label: 'Wine' },
  { value: 'beer', label: 'Beer' },
  { value: 'brandy', label: 'Brandy' },
  { value: 'rum', label: 'Rum' },
  { value: 'gin', label: 'Gin' },
  { value: 'tequila', label: 'Tequila' },
  { value: 'soju', label: 'Soju' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
];

const defaultAcceptForm: AcceptFormState = {
  productName: '',
  category: 'whisky',
  quantity: '1',
  remainingPercent: '100',
  storageDays: '30',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateDepositCode(): string {
  const { year, month, day } = bangkokDateParts();
  const dateStr = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `DEP-${dateStr}-${random}`;
}

function mapDepositRequest(req: DepositRequestRow): TableCardItem {
  return {
    id: req.id,
    type: 'deposit_request',
    tableNumber: req.table_number,
    customerName: req.customer_name || 'ลูกค้า',
    customerPhone: req.customer_phone,
    productName: req.product_name,
    quantity: req.quantity,
    status: req.status,
    notes: req.notes,
    photoUrl: req.customer_photo_url,
    createdAt: req.created_at,
    storeId: req.store_id,
    rawData: req as unknown as Record<string, unknown>,
  };
}

function mapWithdrawal(w: WithdrawalRow): TableCardItem {
  return {
    id: w.id,
    type: 'withdrawal',
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
  };
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function MyTasksPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const today = formatThaiDate(new Date());

  // Data state
  const [depositRequests, setDepositRequests] = useState<TableCardItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<TableCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<'deposits' | 'withdrawals'>('deposits');

  // Detail modal state
  const [selectedItem, setSelectedItem] = useState<TableCardItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Accept form state (for deposit requests)
  const [acceptForm, setAcceptForm] = useState<AcceptFormState>(defaultAcceptForm);
  const [isAccepting, setIsAccepting] = useState(false);

  // Reject modal state
  const [rejectState, setRejectState] = useState<RejectState | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);

  // Withdrawal action loading
  const [isApprovingWithdrawal, setIsApprovingWithdrawal] = useState(false);

  // Ref to track mounted state for safe async setState
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadAll = useCallback(async () => {
    if (!currentStoreId) return;

    const supabase = createClient();

    try {
      const [depRes, wdRes] = await Promise.all([
        supabase
          .from('deposit_requests')
          .select('*')
          .eq('store_id', currentStoreId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true }),
        supabase
          .from('withdrawals')
          .select('*, deposits(deposit_code)')
          .eq('store_id', currentStoreId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true }),
      ]);

      if (!mountedRef.current) return;

      if (depRes.error) {
        console.error('[MyTasks] Failed to load deposit_requests:', depRes.error);
      } else {
        setDepositRequests(
          (depRes.data as DepositRequestRow[]).map(mapDepositRequest),
        );
      }

      if (wdRes.error) {
        console.error('[MyTasks] Failed to load withdrawals:', wdRes.error);
      } else {
        setWithdrawals(
          (wdRes.data as WithdrawalRow[]).map(mapWithdrawal),
        );
      }
    } catch (err) {
      console.error('[MyTasks] Unexpected error loading data:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ---------------------------------------------------------------------------
  // Realtime subscriptions
  // ---------------------------------------------------------------------------

  useRealtime({
    table: 'deposit_requests',
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

  // ---------------------------------------------------------------------------
  // Card click handler
  // ---------------------------------------------------------------------------

  const handleCardClick = useCallback((item: TableCardItem) => {
    setSelectedItem(item);
    setAcceptForm(defaultAcceptForm);
    setIsDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setIsDetailOpen(false);
    setSelectedItem(null);
    setAcceptForm(defaultAcceptForm);
  }, []);

  // ---------------------------------------------------------------------------
  // Deposit Request: Accept
  // ---------------------------------------------------------------------------

  const handleAcceptDeposit = useCallback(async () => {
    if (!selectedItem || !currentStoreId || !user) return;

    const { productName, category, quantity, remainingPercent, storageDays } = acceptForm;
    if (!productName.trim()) {
      toast({ type: 'warning', title: 'กรุณาระบุชื่อเหล้า' });
      return;
    }

    const qty = parseInt(quantity, 10) || 1;
    const pct = parseInt(remainingPercent, 10) || 100;
    const days = parseInt(storageDays, 10) || 30;

    setIsAccepting(true);
    const supabase = createClient();
    const depositCode = generateDepositCode();

    const expiryISO = expiryDateISO(days);

    const raw = selectedItem.rawData as Record<string, unknown>;

    try {
      // 1. Create deposit
      const { error: depositErr } = await supabase.from('deposits').insert({
        store_id: currentStoreId,
        customer_name: selectedItem.customerName,
        customer_phone: selectedItem.customerPhone || null,
        product_name: productName.trim(),
        category,
        quantity: qty,
        remaining_qty: qty,
        remaining_percent: pct,
        table_number: selectedItem.tableNumber || null,
        line_user_id: (raw.line_user_id as string) || null,
        status: 'pending_confirm',
        customer_photo_url: selectedItem.photoUrl || null,
        received_by: user.id,
        expiry_date: expiryISO,
        deposit_code: depositCode,
      });

      if (depositErr) throw depositErr;

      // 2. Update deposit_request status to 'approved'
      const { error: updateErr } = await supabase
        .from('deposit_requests')
        .update({ status: 'approved' })
        .eq('id', selectedItem.id);

      if (updateErr) throw updateErr;

      // 3. Log audit
      logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_REQUEST_APPROVED,
        table_name: 'deposit_requests',
        record_id: selectedItem.id,
        old_value: { status: 'pending' },
        new_value: {
          status: 'approved',
          deposit_code: depositCode,
          product_name: productName.trim(),
          category,
          quantity: qty,
        },
        changed_by: user.id,
      });

      // 4. Notify bar
      notifyStaff({
        storeId: currentStoreId,
        type: 'new_deposit',
        title: 'มีรายการฝากใหม่',
        body: `${selectedItem.customerName} ฝาก ${productName.trim()} (${depositCode})`,
        data: { deposit_code: depositCode },
        excludeUserId: user.id,
      });

      // 5. Toast success
      toast({
        type: 'success',
        title: 'รับเข้าระบบสำเร็จ',
        message: `${productName.trim()} — รหัส ${depositCode}`,
      });

      // 6. Close and reload
      closeDetail();
      await loadAll();
    } catch (err) {
      console.error('[MyTasks] Accept deposit failed:', err);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถรับเข้าระบบได้ กรุณาลองใหม่',
      });
    } finally {
      setIsAccepting(false);
    }
  }, [selectedItem, currentStoreId, user, acceptForm, closeDetail, loadAll]);

  // ---------------------------------------------------------------------------
  // Deposit Request: Reject
  // ---------------------------------------------------------------------------

  const openRejectModal = useCallback((item: TableCardItem) => {
    setRejectState({ item, reason: '' });
  }, []);

  const handleRejectDeposit = useCallback(async () => {
    if (!rejectState || !currentStoreId || !user) return;

    if (!rejectState.reason.trim()) {
      toast({ type: 'warning', title: 'กรุณาระบุเหตุผลในการปฏิเสธ' });
      return;
    }

    setIsRejecting(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('deposit_requests')
        .update({
          status: 'rejected',
          notes: rejectState.reason.trim(),
        })
        .eq('id', rejectState.item.id);

      if (error) throw error;

      logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_REQUEST_REJECTED,
        table_name: 'deposit_requests',
        record_id: rejectState.item.id,
        old_value: { status: 'pending' },
        new_value: { status: 'rejected', notes: rejectState.reason.trim() },
        changed_by: user.id,
      });

      toast({
        type: 'success',
        title: 'ปฏิเสธคำขอฝากสำเร็จ',
      });

      setRejectState(null);
      closeDetail();
      await loadAll();
    } catch (err) {
      console.error('[MyTasks] Reject deposit request failed:', err);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถปฏิเสธคำขอได้ กรุณาลองใหม่',
      });
    } finally {
      setIsRejecting(false);
    }
  }, [rejectState, currentStoreId, user, closeDetail, loadAll]);

  // ---------------------------------------------------------------------------
  // Withdrawal: Approve
  // ---------------------------------------------------------------------------

  const handleApproveWithdrawal = useCallback(async () => {
    if (!selectedItem || !currentStoreId || !user) return;

    setIsApprovingWithdrawal(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('withdrawals')
        .update({ status: 'approved' })
        .eq('id', selectedItem.id);

      if (error) throw error;

      logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_COMPLETED,
        table_name: 'withdrawals',
        record_id: selectedItem.id,
        old_value: { status: 'pending' },
        new_value: { status: 'approved' },
        changed_by: user.id,
      });

      notifyStaff({
        storeId: currentStoreId,
        type: 'withdrawal_request',
        title: 'อนุมัติคำขอเบิก',
        body: `${selectedItem.customerName} เบิก ${selectedItem.productName || 'เหล้า'}`,
        data: { withdrawal_id: selectedItem.id },
        excludeUserId: user.id,
      });

      toast({
        type: 'success',
        title: 'อนุมัติคำขอเบิกสำเร็จ',
      });

      closeDetail();
      await loadAll();
    } catch (err) {
      console.error('[MyTasks] Approve withdrawal failed:', err);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถอนุมัติคำขอเบิกได้ กรุณาลองใหม่',
      });
    } finally {
      setIsApprovingWithdrawal(false);
    }
  }, [selectedItem, currentStoreId, user, closeDetail, loadAll]);

  // ---------------------------------------------------------------------------
  // Withdrawal: Reject
  // ---------------------------------------------------------------------------

  const openRejectWithdrawal = useCallback((item: TableCardItem) => {
    setRejectState({ item, reason: '' });
  }, []);

  const handleRejectWithdrawal = useCallback(async () => {
    if (!rejectState || !currentStoreId || !user) return;

    if (!rejectState.reason.trim()) {
      toast({ type: 'warning', title: 'กรุณาระบุเหตุผลในการปฏิเสธ' });
      return;
    }

    setIsRejecting(true);
    const supabase = createClient();
    const raw = rejectState.item.rawData as Record<string, unknown>;
    const depositId = (raw.deposit_id as string) || rejectState.item.depositId;

    try {
      // 1. Update withdrawal status to 'rejected'
      const { error: wdErr } = await supabase
        .from('withdrawals')
        .update({
          status: 'rejected',
          notes: rejectState.reason.trim(),
        })
        .eq('id', rejectState.item.id);

      if (wdErr) throw wdErr;

      // 2. Update deposit status back to 'in_store'
      if (depositId) {
        const { error: depErr } = await supabase
          .from('deposits')
          .update({ status: 'in_store' })
          .eq('id', depositId);

        if (depErr) {
          console.error('[MyTasks] Failed to revert deposit status:', depErr);
        }
      }

      // 3. Log audit
      logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_REJECTED,
        table_name: 'withdrawals',
        record_id: rejectState.item.id,
        old_value: { status: 'pending' },
        new_value: { status: 'rejected', notes: rejectState.reason.trim() },
        changed_by: user.id,
      });

      toast({
        type: 'success',
        title: 'ปฏิเสธคำขอเบิกสำเร็จ',
      });

      setRejectState(null);
      closeDetail();
      await loadAll();
    } catch (err) {
      console.error('[MyTasks] Reject withdrawal failed:', err);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถปฏิเสธคำขอเบิกได้ กรุณาลองใหม่',
      });
    } finally {
      setIsRejecting(false);
    }
  }, [rejectState, currentStoreId, user, closeDetail, loadAll]);

  // ---------------------------------------------------------------------------
  // Reject handler (dispatches to deposit or withdrawal)
  // ---------------------------------------------------------------------------

  const handleRejectConfirm = useCallback(() => {
    if (!rejectState) return;
    if (rejectState.item.type === 'deposit_request') {
      handleRejectDeposit();
    } else {
      handleRejectWithdrawal();
    }
  }, [rejectState, handleRejectDeposit, handleRejectWithdrawal]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const activeItems = useMemo(
    () => (activeTab === 'deposits' ? depositRequests : withdrawals),
    [activeTab, depositRequests, withdrawals],
  );
  const depositCount = depositRequests.length;
  const withdrawalCount = withdrawals.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4 pb-8">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">งานของฉัน</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          สวัสดี, {user?.displayName || user?.username || 'พนักงาน'} &mdash; {today}
        </p>
      </div>

      {/* ── Stock Count Banner ────────────────────────────────────── */}
      <StockCountBanner />

      {/* ── Quick Actions ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <a
          href="/stock/count"
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-white transition-all',
            'bg-gradient-to-r from-purple-500 to-indigo-600',
            'active:scale-[0.97]',
          )}
        >
          <ScanLine className="h-6 w-6" />
          <span className="text-xs font-medium">นับสต๊อก</span>
        </a>
        <a
          href="/deposit/new"
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-white transition-all',
            'bg-gradient-to-r from-teal-500 to-emerald-500',
            'active:scale-[0.97]',
          )}
        >
          <Wine className="h-6 w-6" />
          <span className="text-xs font-medium">ฝากใหม่</span>
        </a>
        <a
          href="/deposit?action=withdraw"
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-white transition-all',
            'bg-gradient-to-r from-red-500 to-orange-500',
            'active:scale-[0.97]',
          )}
        >
          <Package className="h-6 w-6" />
          <span className="text-xs font-medium">เบิกเหล้า</span>
        </a>
      </div>

      {/* ── Summary Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('deposits')}
          className={cn(
            'rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 transition-all',
            activeTab === 'deposits'
              ? 'ring-teal-500 shadow-teal-100'
              : 'ring-gray-200 hover:ring-gray-300',
          )}
        >
          <p className="text-2xl font-bold text-teal-600">{depositCount}</p>
          <p className="mt-0.5 text-xs text-gray-500">คำขอฝาก</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('withdrawals')}
          className={cn(
            'rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 transition-all',
            activeTab === 'withdrawals'
              ? 'ring-red-500 shadow-red-100'
              : 'ring-gray-200 hover:ring-gray-300',
          )}
        >
          <p className="text-2xl font-bold text-red-600">{withdrawalCount}</p>
          <p className="mt-0.5 text-xs text-gray-500">คำขอเบิก</p>
        </button>
      </div>

      {/* ── Tab Toggle ──────────────────────────────────────────────── */}
      <div className="flex rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('deposits')}
          className={cn(
            'flex-1 rounded-lg py-2 text-center text-sm font-medium transition-all',
            activeTab === 'deposits'
              ? 'bg-white text-teal-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          ฝากรอตรวจสอบ
          {depositCount > 0 && (
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
              {depositCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('withdrawals')}
          className={cn(
            'flex-1 rounded-lg py-2 text-center text-sm font-medium transition-all',
            activeTab === 'withdrawals'
              ? 'bg-white text-red-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          เบิกรอดำเนินการ
          {withdrawalCount > 0 && (
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-700">
              {withdrawalCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Table Card Grid ─────────────────────────────────────────── */}
      <TableCardGrid
        items={activeItems}
        onItemClick={handleCardClick}
        isLoading={isLoading}
        emptyMessage={
          activeTab === 'deposits'
            ? 'ไม่มีคำขอฝากที่รอตรวจสอบ'
            : 'ไม่มีคำขอเบิกที่รอดำเนินการ'
        }
      />

      {/* ── Request Detail Modal ────────────────────────────────────── */}
      <RequestDetailModal
        item={selectedItem}
        isOpen={isDetailOpen}
        onClose={closeDetail}
      >
        {/* ----- Deposit Request Actions ----- */}
        {selectedItem?.type === 'deposit_request' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              กรอกข้อมูลสินค้าเพื่อรับเข้าระบบ
            </h3>

            <Input
              label="ชื่อเหล้า *"
              placeholder="เช่น Johnnie Walker Black Label"
              value={acceptForm.productName}
              onChange={(e) =>
                setAcceptForm((prev) => ({ ...prev, productName: e.target.value }))
              }
            />

            <Select
              label="ประเภท"
              options={CATEGORY_OPTIONS}
              value={acceptForm.category}
              onChange={(e) =>
                setAcceptForm((prev) => ({ ...prev, category: e.target.value }))
              }
            />

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="จำนวน"
                type="number"
                min="1"
                value={acceptForm.quantity}
                onChange={(e) =>
                  setAcceptForm((prev) => ({ ...prev, quantity: e.target.value }))
                }
              />
              <Input
                label="% คงเหลือ"
                type="number"
                min="0"
                max="100"
                value={acceptForm.remainingPercent}
                onChange={(e) =>
                  setAcceptForm((prev) => ({
                    ...prev,
                    remainingPercent: e.target.value,
                  }))
                }
              />
              <Input
                label="ระยะเวลา (วัน)"
                type="number"
                min="1"
                value={acceptForm.storageDays}
                onChange={(e) =>
                  setAcceptForm((prev) => ({
                    ...prev,
                    storageDays: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600"
                onClick={handleAcceptDeposit}
                isLoading={isAccepting}
                disabled={isAccepting}
              >
                รับเข้าระบบ
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  if (selectedItem) openRejectModal(selectedItem);
                }}
                disabled={isAccepting}
              >
                ปฏิเสธ
              </Button>
            </div>
          </div>
        )}

        {/* ----- Withdrawal Actions ----- */}
        {selectedItem?.type === 'withdrawal' && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={handleApproveWithdrawal}
                isLoading={isApprovingWithdrawal}
                disabled={isApprovingWithdrawal}
              >
                อนุมัติ
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  if (selectedItem) openRejectWithdrawal(selectedItem);
                }}
                disabled={isApprovingWithdrawal}
              >
                ปฏิเสธ
              </Button>
            </div>
          </div>
        )}
      </RequestDetailModal>

      {/* ── Reject Reason Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={!!rejectState}
        onClose={() => setRejectState(null)}
        title="ระบุเหตุผลที่ปฏิเสธ"
        size="sm"
      >
        <div className="space-y-4">
          <Textarea
            label="เหตุผล"
            placeholder="กรุณาระบุเหตุผลที่ปฏิเสธ..."
            rows={3}
            value={rejectState?.reason || ''}
            onChange={(e) =>
              setRejectState((prev) =>
                prev ? { ...prev, reason: e.target.value } : null,
              )
            }
          />
          <div className="flex gap-3">
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleRejectConfirm}
              isLoading={isRejecting}
              disabled={isRejecting}
            >
              ยืนยันปฏิเสธ
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setRejectState(null)}
              disabled={isRejecting}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
