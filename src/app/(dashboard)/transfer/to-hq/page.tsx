'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import {
  Truck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Package,
  ArrowLeft,
  Send,
  User,
  Wine,
  Calendar,
  Loader2,
  RefreshCw,
  XCircle,
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

interface PendingTransfer {
  id: string;
  transfer_code: string;
  deposit_id: string | null;
  product_name: string | null;
  customer_name: string | null;
  deposit_code: string | null;
  quantity: number | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

interface ConfirmedTransfer extends PendingTransfer {
  confirmed_at: string | null;
  confirm_photo_url: string | null;
}

type SubTab = 'expired' | 'pending' | 'confirmed';

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

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TransferToHqPage() {
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
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [confirmedTransfers, setConfirmedTransfers] = useState<ConfirmedTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferNote, setTransferNote] = useState('');
  const [transferPhoto, setTransferPhoto] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const loadPendingTransfers = useCallback(async () => {
    if (!currentStoreId || !centralStoreId) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('transfers')
      .select('id, deposit_id, product_name, quantity, notes, photo_url, created_at')
      .eq('from_store_id', currentStoreId)
      .eq('to_store_id', centralStoreId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!data || !mountedRef.current) return;

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

    const items: PendingTransfer[] = data.map((t) => {
      const info = t.deposit_id ? depositMap.get(t.deposit_id) : null;
      return {
        id: t.id,
        transfer_code: t.id.slice(0, 8).toUpperCase(),
        deposit_id: t.deposit_id,
        product_name: t.product_name,
        customer_name: info?.customer_name || null,
        deposit_code: info?.deposit_code || null,
        quantity: t.quantity,
        notes: t.notes,
        photo_url: t.photo_url,
        created_at: t.created_at,
      };
    });

    setPendingTransfers(items);
  }, [currentStoreId, centralStoreId]);

  const loadConfirmedTransfers = useCallback(async () => {
    if (!currentStoreId || !centralStoreId) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('transfers')
      .select('id, deposit_id, product_name, quantity, notes, photo_url, confirm_photo_url, created_at')
      .eq('from_store_id', currentStoreId)
      .eq('to_store_id', centralStoreId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!data || !mountedRef.current) return;

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

    const items: ConfirmedTransfer[] = data.map((t) => {
      const info = t.deposit_id ? depositMap.get(t.deposit_id) : null;
      return {
        id: t.id,
        transfer_code: t.id.slice(0, 8).toUpperCase(),
        deposit_id: t.deposit_id,
        product_name: t.product_name,
        customer_name: info?.customer_name || null,
        deposit_code: info?.deposit_code || null,
        quantity: t.quantity,
        notes: t.notes,
        photo_url: t.photo_url,
        confirm_photo_url: t.confirm_photo_url,
        created_at: t.created_at,
        confirmed_at: null,
      };
    });

    setConfirmedTransfers(items);
  }, [currentStoreId, centralStoreId]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([
      loadExpiredDeposits(),
      loadPendingTransfers(),
      loadConfirmedTransfers(),
    ]);
    if (mountedRef.current) setIsLoading(false);
  }, [loadExpiredDeposits, loadPendingTransfers, loadConfirmedTransfers]);

  useEffect(() => {
    loadCentralStore();
  }, [loadCentralStore]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  // -----------------------------------------------------------------------
  // Submit transfer
  // -----------------------------------------------------------------------

  const handleSubmitTransfer = async () => {
    if (!currentStoreId || !centralStoreId || !user || selectedIds.size === 0) return;

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // Create one transfer per deposit
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
      }));

      const { error } = await supabase.from('transfers').insert(transfers);

      if (error) throw error;

      // Log audit
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.TRANSFER_CREATED,
        table_name: 'transfers',
        record_id: selectedDeposits.map((d) => d.id).join(','),
        new_value: {
          to: 'central_warehouse',
          deposit_count: selectedDeposits.length,
          deposit_codes: selectedDeposits.map((d) => d.deposit_code),
        },
        changed_by: user.id,
      });

      toast({ type: 'success', title: 'ส่งโอนสำเร็จ', message: `ส่งโอน ${selectedDeposits.length} รายการไปคลังกลาง` });
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
  // Cancel pending transfer
  // -----------------------------------------------------------------------

  const handleCancelTransfer = async (transferId: string, depositId: string | null) => {
    if (!user) return;
    const supabase = createClient();

    const { error } = await supabase
      .from('transfers')
      .update({ status: 'rejected' })
      .eq('id', transferId);

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด' });
      return;
    }

    // Re-set deposit back to expired if it was transferred
    if (depositId) {
      await supabase
        .from('deposits')
        .update({ status: 'expired' })
        .eq('id', depositId)
        .eq('status', 'transferred_out');
    }

    toast({ type: 'success', title: 'ยกเลิกคำขอโอนแล้ว' });
    await loadAll();
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const tabCounts = {
    expired: expiredDeposits.length,
    pending: pendingTransfers.length,
    confirmed: confirmedTransfers.length,
  };

  const selectedDeposits = expiredDeposits.filter((d) => selectedIds.has(d.id));

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <a
          href="/my-tasks"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        </a>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">โอนคลังกลาง</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            รายการหมดอายุ — ส่งโอนไปคลังกลาง
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

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
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
          <p className="text-xs text-red-600 dark:text-red-400">หมดอายุ</p>
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
          <p className="text-xs text-amber-600 dark:text-amber-400">รอรับ</p>
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
          <p className="text-xs text-emerald-600 dark:text-emerald-400">รับแล้ว</p>
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

      {/* ── Pending Tab ──────────────────────────────────── */}
      {!isLoading && activeTab === 'pending' && (
        <>
          {pendingTransfers.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="ไม่มีรายการรอรับ"
              description="ไม่มีรายการโอนที่รอคลังกลางรับ"
            />
          ) : (
            <div className="space-y-2">
              {pendingTransfers.map((transfer) => (
                <Card key={transfer.id} padding="none">
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {transfer.product_name || 'ไม่ระบุ'}
                          </p>
                          <Badge variant="warning" size="sm">รอรับ</Badge>
                        </div>
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
                          <p className="flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            รหัสโอน: <span className="font-mono font-medium text-amber-600">{transfer.transfer_code}</span>
                          </p>
                          <p>ส่งเมื่อ: {formatThaiDateTime(transfer.created_at)}</p>
                          {transfer.notes && <p>หมายเหตุ: {transfer.notes}</p>}
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => handleCancelTransfer(transfer.id, transfer.deposit_id)}
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Confirmed Tab ────────────────────────────────── */}
      {!isLoading && activeTab === 'confirmed' && (
        <>
          {confirmedTransfers.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="ยังไม่มีรายการที่รับแล้ว"
              description="รายการที่คลังกลางรับแล้วจะแสดงที่นี่"
            />
          ) : (
            <div className="space-y-2">
              {confirmedTransfers.map((transfer) => (
                <Card key={transfer.id} padding="none">
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {transfer.product_name || 'ไม่ระบุ'}
                      </p>
                      <Badge variant="success" size="sm">รับแล้ว</Badge>
                    </div>
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
                      <p className="flex items-center gap-1">
                        <Truck className="h-3 w-3" />
                        รหัสโอน: <span className="font-mono font-medium text-emerald-600">{transfer.transfer_code}</span>
                      </p>
                      <p>ส่งเมื่อ: {formatThaiDateTime(transfer.created_at)}</p>
                      {transfer.notes && <p>หมายเหตุ: {transfer.notes}</p>}
                    </div>
                  </div>
                </Card>
              ))}
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
    </div>
  );
}
