'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Badge,
  Card,
  Modal,
  ModalFooter,
  Textarea,
  EmptyState,
  PhotoUpload,
  toast,
} from '@/components/ui';
import { formatThaiDate, formatThaiDateTime } from '@/lib/utils/format';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { cn } from '@/lib/utils/cn';
import { generateTransferCode } from '@/lib/utils/transfer-code';
import {
  Truck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Package,
  Send,
  User,
  Wine,
  Calendar,
  Loader2,
  RefreshCw,
  XCircle,
  ChevronDown,
  ChevronRight,
  Ban,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpiredDeposit {
  id: string;
  deposit_code: string;
  customer_name: string;
  product_name: string;
  category: string | null;
  quantity: number;
  remaining_qty: number;
  expiry_date: string | null;
  created_at: string;
}

interface TransferItem {
  id: string;
  transfer_code: string | null;
  deposit_id: string | null;
  product_name: string | null;
  customer_name: string | null;
  deposit_code: string | null;
  quantity: number | null;
  notes: string | null;
  photo_url: string | null;
  confirm_photo_url: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface TransferBatch {
  transfer_code: string;
  items: TransferItem[];
  created_at: string;
}

type SubTab = 'expired' | 'pending' | 'confirmed' | 'rejected';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysOverdue(expiryDate: string | null): number {
  if (!expiryDate) return 0;
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = Math.floor((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function groupByTransferCode(transfers: TransferItem[]): TransferBatch[] {
  const map = new Map<string, TransferItem[]>();
  for (const t of transfers) {
    const code = t.transfer_code || t.id.slice(0, 8).toUpperCase();
    const existing = map.get(code);
    if (existing) {
      existing.push(t);
    } else {
      map.set(code, [t]);
    }
  }
  const batches: TransferBatch[] = [];
  for (const [code, items] of map) {
    batches.push({
      transfer_code: code,
      items,
      created_at: items[0].created_at,
    });
  }
  batches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return batches;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TransferPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Sub-tab
  const [activeTab, setActiveTab] = useState<SubTab>('expired');

  // Data
  const [expiredDeposits, setExpiredDeposits] = useState<ExpiredDeposit[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<TransferItem[]>([]);
  const [confirmedTransfers, setConfirmedTransfers] = useState<TransferItem[]>([]);
  const [rejectedTransfers, setRejectedTransfers] = useState<TransferItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferNote, setTransferNote] = useState('');
  const [transferPhoto, setTransferPhoto] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cancel batch modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingBatch, setCancellingBatch] = useState<TransferBatch | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Expanded batches
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  // Central store
  const [centralStoreId, setCentralStoreId] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadCentralStore = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id')
      .eq('is_central', true)
      .eq('active', true)
      .limit(1)
      .single();
    if (data) setCentralStoreId(data.id);
  }, []);

  const loadExpiredDeposits = useCallback(async () => {
    if (!currentStoreId) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('deposits')
      .select('id, deposit_code, customer_name, product_name, category, quantity, remaining_qty, expiry_date, created_at')
      .eq('store_id', currentStoreId)
      .eq('status', 'expired')
      .order('expiry_date', { ascending: true });

    if (data && mountedRef.current) {
      setExpiredDeposits(data);
    }
  }, [currentStoreId]);

  const loadTransfersByStatus = useCallback(async (status: 'pending' | 'confirmed' | 'rejected') => {
    if (!currentStoreId || !centralStoreId) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('transfers')
      .select('id, transfer_code, rejection_reason, deposit_id, product_name, quantity, notes, photo_url, confirm_photo_url, created_at')
      .eq('from_store_id', currentStoreId)
      .eq('to_store_id', centralStoreId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(status === 'confirmed' || status === 'rejected' ? 100 : 500);

    if (!data || !mountedRef.current) return [];

    // Resolve deposit info
    const depositIds = data.map((t) => t.deposit_id).filter(Boolean) as string[];
    let depositMap = new Map<string, { customer_name: string; deposit_code: string }>();
    if (depositIds.length > 0) {
      const { data: deposits } = await supabase
        .from('deposits')
        .select('id, customer_name, deposit_code')
        .in('id', depositIds);
      if (deposits) {
        depositMap = new Map(deposits.map((d) => [d.id, { customer_name: d.customer_name, deposit_code: d.deposit_code }]));
      }
    }

    const items: TransferItem[] = data.map((t) => {
      const info = t.deposit_id ? depositMap.get(t.deposit_id) : null;
      return {
        id: t.id,
        transfer_code: t.transfer_code,
        deposit_id: t.deposit_id,
        product_name: t.product_name,
        customer_name: info?.customer_name || null,
        deposit_code: info?.deposit_code || null,
        quantity: t.quantity,
        notes: t.notes,
        photo_url: t.photo_url,
        confirm_photo_url: t.confirm_photo_url,
        rejection_reason: t.rejection_reason,
        created_at: t.created_at,
      };
    });

    return items;
  }, [currentStoreId, centralStoreId]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    const [, pending, confirmed, rejected] = await Promise.all([
      loadExpiredDeposits(),
      loadTransfersByStatus('pending'),
      loadTransfersByStatus('confirmed'),
      loadTransfersByStatus('rejected'),
    ]);
    if (mountedRef.current) {
      if (pending) setPendingTransfers(pending);
      if (confirmed) setConfirmedTransfers(confirmed);
      if (rejected) setRejectedTransfers(rejected);
      setIsLoading(false);
    }
  }, [loadExpiredDeposits, loadTransfersByStatus]);

  useEffect(() => {
    loadCentralStore();
  }, [loadCentralStore]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Grouped batches
  const pendingBatches = useMemo(() => groupByTransferCode(pendingTransfers), [pendingTransfers]);
  const confirmedBatches = useMemo(() => groupByTransferCode(confirmedTransfers), [confirmedTransfers]);
  const rejectedBatches = useMemo(() => groupByTransferCode(rejectedTransfers), [rejectedTransfers]);

  // -----------------------------------------------------------------------
  // Selection handlers
  // -----------------------------------------------------------------------

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === expiredDeposits.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(expiredDeposits.map((d) => d.id)));
    }
  };

  const toggleBatch = (code: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // -----------------------------------------------------------------------
  // Submit transfer (batch with shared transfer_code)
  // -----------------------------------------------------------------------

  const handleSubmitTransfer = async () => {
    if (!currentStoreId || !centralStoreId || !user || selectedIds.size === 0) return;

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // Generate shared transfer code for the batch
      const transferCode = await generateTransferCode(supabase);

      // Create one transfer per deposit, all sharing the same transfer_code
      const selectedDeposits = expiredDeposits.filter((d) => selectedIds.has(d.id));
      const transfers = selectedDeposits.map((d) => ({
        from_store_id: currentStoreId,
        to_store_id: centralStoreId,
        deposit_id: d.id,
        product_name: d.product_name,
        quantity: d.remaining_qty || d.quantity,
        notes: transferNote || null,
        photo_url: transferPhoto,
        requested_by: user.id,
        transfer_code: transferCode,
      }));

      const { error } = await supabase.from('transfers').insert(transfers);

      if (error) throw error;

      // Update deposit status to transfer_pending
      const depositIds = selectedDeposits.map((d) => d.id);
      await supabase
        .from('deposits')
        .update({ status: 'transfer_pending' })
        .in('id', depositIds);

      // Log audit
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.TRANSFER_CREATED,
        table_name: 'transfers',
        record_id: transferCode,
        new_value: {
          transfer_code: transferCode,
          to: 'central_warehouse',
          deposit_count: selectedDeposits.length,
          deposit_codes: selectedDeposits.map((d) => d.deposit_code),
        },
        changed_by: user.id,
      });

      toast({ type: 'success', title: 'ส่งโอนสำเร็จ', message: `ส่งโอน ${selectedDeposits.length} รายการ (${transferCode})` });
      setShowTransferModal(false);
      setSelectedIds(new Set());
      setTransferNote('');
      setTransferPhoto(null);
      await loadAll();
    } catch (err) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: err instanceof Error ? err.message : 'ไม่สามารถส่งโอนได้' });
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Cancel batch (all transfers in a batch)
  // -----------------------------------------------------------------------

  const handleCancelBatch = async () => {
    if (!user || !cancellingBatch) return;

    setIsCancelling(true);
    const supabase = createClient();

    try {
      const transferIds = cancellingBatch.items.map((t) => t.id);
      const depositIds = cancellingBatch.items.map((t) => t.deposit_id).filter(Boolean) as string[];

      // Set all transfers in batch to rejected
      const { error } = await supabase
        .from('transfers')
        .update({ status: 'rejected' })
        .in('id', transferIds);

      if (error) throw error;

      // Revert deposits back to expired
      if (depositIds.length > 0) {
        await supabase
          .from('deposits')
          .update({ status: 'expired' })
          .in('id', depositIds);
      }

      toast({ type: 'success', title: 'ยกเลิกคำขอโอนแล้ว', message: `ยกเลิก ${cancellingBatch.items.length} รายการ` });
      setShowCancelModal(false);
      setCancellingBatch(null);
      await loadAll();
    } catch (err) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: err instanceof Error ? err.message : 'ไม่สามารถยกเลิกได้' });
    } finally {
      if (mountedRef.current) setIsCancelling(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const tabCounts = {
    expired: expiredDeposits.length,
    pending: pendingTransfers.length,
    confirmed: confirmedTransfers.length,
    rejected: rejectedTransfers.length,
  };

  const selectedDeposits = expiredDeposits.filter((d) => selectedIds.has(d.id));

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">โอนคลังกลาง</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            จัดการรายการหมดอายุ — ส่งโอนไปคลังกลาง
          </p>
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

      {/* Summary Cards — 4 tabs */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => setActiveTab('expired')}
          className={cn(
            'rounded-xl p-3 text-center transition-all',
            activeTab === 'expired'
              ? 'bg-red-100 ring-2 ring-red-400 dark:bg-red-900/40 dark:ring-red-500'
              : 'bg-red-50 dark:bg-red-900/20',
          )}
        >
          <AlertTriangle className="mx-auto h-5 w-5 text-red-600 dark:text-red-400" />
          <p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">{tabCounts.expired}</p>
          <p className="text-[10px] text-red-600 dark:text-red-400">หมดอายุ</p>
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={cn(
            'rounded-xl p-3 text-center transition-all',
            activeTab === 'pending'
              ? 'bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-900/40 dark:ring-amber-500'
              : 'bg-amber-50 dark:bg-amber-900/20',
          )}
        >
          <Clock className="mx-auto h-5 w-5 text-amber-600 dark:text-amber-400" />
          <p className="mt-1 text-xl font-bold text-amber-700 dark:text-amber-300">{tabCounts.pending}</p>
          <p className="text-[10px] text-amber-600 dark:text-amber-400">รอรับ</p>
        </button>
        <button
          onClick={() => setActiveTab('confirmed')}
          className={cn(
            'rounded-xl p-3 text-center transition-all',
            activeTab === 'confirmed'
              ? 'bg-emerald-100 ring-2 ring-emerald-400 dark:bg-emerald-900/40 dark:ring-emerald-500'
              : 'bg-emerald-50 dark:bg-emerald-900/20',
          )}
        >
          <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{tabCounts.confirmed}</p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">รับแล้ว</p>
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={cn(
            'rounded-xl p-3 text-center transition-all',
            activeTab === 'rejected'
              ? 'bg-gray-200 ring-2 ring-gray-400 dark:bg-gray-700 dark:ring-gray-500'
              : 'bg-gray-100 dark:bg-gray-800',
          )}
        >
          <Ban className="mx-auto h-5 w-5 text-gray-600 dark:text-gray-400" />
          <p className="mt-1 text-xl font-bold text-gray-700 dark:text-gray-300">{tabCounts.rejected}</p>
          <p className="text-[10px] text-gray-600 dark:text-gray-400">ปฏิเสธ</p>
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* ── Expired Tab ──────────────────────────────────── */}
      {!isLoading && activeTab === 'expired' && (
        <>
          {expiredDeposits.length === 0 ? (
            <EmptyState
              icon={Package}
              title="ไม่มีรายการหมดอายุ"
              description="ไม่มีเหล้าฝากที่หมดอายุในขณะนี้"
            />
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2 dark:bg-gray-800/50">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === expiredDeposits.length && expiredDeposits.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    เลือกทั้งหมด
                  </span>
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    เลือก {selectedIds.size} รายการ
                  </span>
                )}
              </div>

              {/* List */}
              <div className="space-y-2">
                {expiredDeposits.map((deposit) => {
                  const overdue = getDaysOverdue(deposit.expiry_date);
                  const isSelected = selectedIds.has(deposit.id);
                  return (
                    <button
                      key={deposit.id}
                      type="button"
                      onClick={() => toggleSelect(deposit.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all',
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200 dark:border-indigo-600 dark:bg-indigo-900/20 dark:ring-indigo-800'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-gray-600',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(deposit.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {deposit.product_name}
                          </p>
                          <Badge variant="danger" size="sm">หมดอายุ</Badge>
                        </div>
                        <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                          <p className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {deposit.customer_name}
                            <span className="ml-1 font-mono text-gray-400">
                              {deposit.deposit_code}
                            </span>
                          </p>
                          <p className="flex items-center gap-1">
                            <Wine className="h-3 w-3" />
                            จำนวน: {deposit.remaining_qty || deposit.quantity}
                            {deposit.category && (
                              <span className="ml-1 text-gray-400">({deposit.category})</span>
                            )}
                          </p>
                          {deposit.expiry_date && (
                            <p className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              หมดอายุ: {formatThaiDate(deposit.expiry_date)}
                              {overdue > 0 && (
                                <span className="ml-1 font-medium text-red-600 dark:text-red-400">
                                  (เกิน {overdue} วัน)
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Floating action bar */}
              {selectedIds.size > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <Button
                    className="w-full"
                    icon={<Send className="h-4 w-4" />}
                    onClick={() => setShowTransferModal(true)}
                  >
                    ส่งโอน {selectedIds.size} รายการไปคลังกลาง
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Pending Tab (grouped by transfer_code) ────────── */}
      {!isLoading && activeTab === 'pending' && (
        <>
          {pendingBatches.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="ไม่มีรายการรอรับ"
              description="ไม่มีรายการโอนที่รอคลังกลางรับ"
            />
          ) : (
            <div className="space-y-3">
              {pendingBatches.map((batch) => {
                const isExpanded = expandedBatches.has(batch.transfer_code);
                return (
                  <Card key={batch.transfer_code} padding="none">
                    {/* Batch header */}
                    <button
                      type="button"
                      onClick={() => toggleBatch(batch.transfer_code)}
                      className="flex w-full items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
                              {batch.transfer_code}
                            </span>
                            <Badge variant="warning" size="sm">รอรับ</Badge>
                            <Badge variant="default" size="sm">{batch.items.length} รายการ</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            ส่งเมื่อ: {formatThaiDateTime(batch.created_at)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancellingBatch(batch);
                          setShowCancelModal(true);
                        }}
                      >
                        ยกเลิก
                      </Button>
                    </button>

                    {/* Batch items */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-gray-700">
                        {batch.items.map((transfer) => (
                          <div
                            key={transfer.id}
                            className="border-b border-gray-50 px-4 py-3 last:border-b-0 dark:border-gray-800"
                          >
                            <p className="font-medium text-gray-900 dark:text-white">
                              {transfer.product_name || 'ไม่ระบุ'}
                            </p>
                            <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {transfer.customer_name && (
                                <p className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {transfer.customer_name}
                                  {transfer.deposit_code && (
                                    <span className="ml-1 font-mono text-gray-400">{transfer.deposit_code}</span>
                                  )}
                                </p>
                              )}
                              {transfer.quantity && (
                                <p className="flex items-center gap-1">
                                  <Wine className="h-3 w-3" />
                                  จำนวน: {transfer.quantity}
                                </p>
                              )}
                              {transfer.notes && <p>หมายเหตุ: {transfer.notes}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Confirmed Tab (grouped by transfer_code) ─────── */}
      {!isLoading && activeTab === 'confirmed' && (
        <>
          {confirmedBatches.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="ยังไม่มีรายการที่รับแล้ว"
              description="รายการที่คลังกลางรับแล้วจะแสดงที่นี่"
            />
          ) : (
            <div className="space-y-3">
              {confirmedBatches.map((batch) => {
                const isExpanded = expandedBatches.has(batch.transfer_code);
                return (
                  <Card key={batch.transfer_code} padding="none">
                    <button
                      type="button"
                      onClick={() => toggleBatch(batch.transfer_code)}
                      className="flex w-full items-center gap-3 p-4 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {batch.transfer_code}
                          </span>
                          <Badge variant="success" size="sm">รับแล้ว</Badge>
                          <Badge variant="default" size="sm">{batch.items.length} รายการ</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          ส่งเมื่อ: {formatThaiDateTime(batch.created_at)}
                        </p>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-gray-700">
                        {batch.items.map((transfer) => (
                          <div
                            key={transfer.id}
                            className="border-b border-gray-50 px-4 py-3 last:border-b-0 dark:border-gray-800"
                          >
                            <p className="font-medium text-gray-900 dark:text-white">
                              {transfer.product_name || 'ไม่ระบุ'}
                            </p>
                            <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {transfer.customer_name && (
                                <p className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {transfer.customer_name}
                                  {transfer.deposit_code && (
                                    <span className="ml-1 font-mono text-gray-400">{transfer.deposit_code}</span>
                                  )}
                                </p>
                              )}
                              {transfer.quantity && (
                                <p className="flex items-center gap-1">
                                  <Wine className="h-3 w-3" />
                                  จำนวน: {transfer.quantity}
                                </p>
                              )}
                              {transfer.notes && <p>หมายเหตุ: {transfer.notes}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Rejected Tab (grouped by transfer_code) ──────── */}
      {!isLoading && activeTab === 'rejected' && (
        <>
          {rejectedBatches.length === 0 ? (
            <EmptyState
              icon={Ban}
              title="ไม่มีรายการที่ถูกปฏิเสธ"
              description="รายการที่คลังกลางปฏิเสธจะแสดงที่นี่"
            />
          ) : (
            <div className="space-y-3">
              {rejectedBatches.map((batch) => {
                const isExpanded = expandedBatches.has(batch.transfer_code);
                const rejectionReason = batch.items.find((t) => t.rejection_reason)?.rejection_reason;
                return (
                  <Card key={batch.transfer_code} padding="none">
                    <button
                      type="button"
                      onClick={() => toggleBatch(batch.transfer_code)}
                      className="flex w-full items-start gap-3 p-4 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 text-gray-400" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gray-500 dark:text-gray-400">
                            {batch.transfer_code}
                          </span>
                          <Badge variant="danger" size="sm">ปฏิเสธ</Badge>
                          <Badge variant="default" size="sm">{batch.items.length} รายการ</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          ส่งเมื่อ: {formatThaiDateTime(batch.created_at)}
                        </p>
                        {rejectionReason && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            เหตุผล: {rejectionReason}
                          </p>
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-gray-700">
                        {batch.items.map((transfer) => (
                          <div
                            key={transfer.id}
                            className="border-b border-gray-50 px-4 py-3 last:border-b-0 dark:border-gray-800"
                          >
                            <p className="font-medium text-gray-900 dark:text-white">
                              {transfer.product_name || 'ไม่ระบุ'}
                            </p>
                            <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {transfer.customer_name && (
                                <p className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {transfer.customer_name}
                                  {transfer.deposit_code && (
                                    <span className="ml-1 font-mono text-gray-400">{transfer.deposit_code}</span>
                                  )}
                                </p>
                              )}
                              {transfer.quantity && (
                                <p className="flex items-center gap-1">
                                  <Wine className="h-3 w-3" />
                                  จำนวน: {transfer.quantity}
                                </p>
                              )}
                              {transfer.rejection_reason && (
                                <p className="text-red-500">เหตุผล: {transfer.rejection_reason}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Transfer Modal ───────────────────────────────── */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => {
          if (!isSubmitting) {
            setShowTransferModal(false);
            setTransferNote('');
            setTransferPhoto(null);
          }
        }}
        title="ส่งโอนไปคลังกลาง"
        description={`${selectedDeposits.length} รายการที่เลือก`}
        size="lg"
      >
        <div className="space-y-4">
          {/* Selected items summary */}
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
            {selectedDeposits.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  {d.product_name}
                </span>
                <span className="text-xs text-gray-500">
                  {d.customer_name} · {d.deposit_code}
                </span>
              </div>
            ))}
          </div>

          {/* Photo */}
          <PhotoUpload
            label="แนบรูปภาพ (ถ้ามี)"
            value={transferPhoto}
            onChange={setTransferPhoto}
            folder="transfers"
            compact
          />

          {/* Notes */}
          <Textarea
            label="หมายเหตุ"
            value={transferNote}
            onChange={(e) => setTransferNote(e.target.value)}
            placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)"
            rows={3}
          />
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowTransferModal(false);
              setTransferNote('');
              setTransferPhoto(null);
            }}
            disabled={isSubmitting}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleSubmitTransfer}
            isLoading={isSubmitting}
            icon={<Truck className="h-4 w-4" />}
          >
            ยืนยันส่งโอน
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Cancel Batch Modal ───────────────────────────── */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => {
          if (!isCancelling) {
            setShowCancelModal(false);
            setCancellingBatch(null);
          }
        }}
        title="ยกเลิกคำขอโอน"
        description={cancellingBatch ? `ยกเลิกทั้งหมด ${cancellingBatch.items.length} รายการในชุด ${cancellingBatch.transfer_code}` : ''}
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            รายการทั้งหมดในชุดนี้จะถูกยกเลิก และรายการฝากจะกลับไปเป็นสถานะ &quot;หมดอายุ&quot; เพื่อให้สามารถส่งโอนใหม่ได้
          </p>
          {cancellingBatch && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
              {cancellingBatch.items.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{t.product_name}</span>
                  <span className="text-xs text-gray-500">{t.customer_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowCancelModal(false);
              setCancellingBatch(null);
            }}
            disabled={isCancelling}
          >
            ไม่ยกเลิก
          </Button>
          <Button
            variant="danger"
            onClick={handleCancelBatch}
            isLoading={isCancelling}
            icon={<XCircle className="h-4 w-4" />}
          >
            ยืนยันยกเลิก
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
