'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';

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
  notes: string | null;
  created_at: string;
}

const statusVariantMap: Record<string, 'warning' | 'success' | 'default' | 'danger' | 'info'> = {
  pending: 'warning',
  approved: 'info',
  completed: 'success',
  rejected: 'danger',
};

const withdrawalTabs = [
  { id: 'pending', label: 'รอดำเนินการ' },
  { id: 'completed', label: 'สำเร็จ' },
  { id: 'rejected', label: 'ปฏิเสธ' },
];

export default function WithdrawalsPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [isLoading, setIsLoading] = useState(true);

  // Process withdrawal modal
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [processAction, setProcessAction] = useState<'complete' | 'reject'>('complete');
  const [actualQty, setActualQty] = useState('');
  const [processNotes, setProcessNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadWithdrawals = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('withdrawals')
      .select('*')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false });

    if (activeTab === 'pending') {
      query = query.in('status', ['pending', 'approved']);
    } else if (activeTab === 'completed') {
      query = query.eq('status', 'completed');
    } else if (activeTab === 'rejected') {
      query = query.eq('status', 'rejected');
    }

    const { data, error } = await query;
    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถโหลดรายการเบิกเหล้าได้' });
    }
    if (data) {
      setWithdrawals(data as Withdrawal[]);
    }
    setIsLoading(false);
  }, [currentStoreId, activeTab]);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  const openProcessModal = (withdrawal: Withdrawal, action: 'complete' | 'reject') => {
    setSelectedWithdrawal(withdrawal);
    setProcessAction(action);
    setActualQty(action === 'complete' ? String(withdrawal.requested_qty) : '');
    setProcessNotes('');
    setShowProcessModal(true);
  };

  const handleProcess = async () => {
    if (!selectedWithdrawal || !user) return;
    setIsSubmitting(true);
    const supabase = createClient();

    if (processAction === 'complete') {
      const qty = parseFloat(actualQty);
      if (isNaN(qty) || qty <= 0) {
        toast({ type: 'error', title: 'กรุณาระบุจำนวนที่ถูกต้อง' });
        setIsSubmitting(false);
        return;
      }

      // Update withdrawal
      const { error: withdrawalError } = await supabase
        .from('withdrawals')
        .update({
          status: 'completed',
          actual_qty: qty,
          processed_by: user.id,
          notes: processNotes || null,
        })
        .eq('id', selectedWithdrawal.id);

      if (withdrawalError) {
        toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถดำเนินการเบิกเหล้าได้' });
        setIsSubmitting(false);
        return;
      }

      // Update deposit remaining quantity
      const { data: deposit } = await supabase
        .from('deposits')
        .select('remaining_qty, quantity')
        .eq('id', selectedWithdrawal.deposit_id)
        .single();

      if (deposit) {
        const newRemaining = Math.max(0, deposit.remaining_qty - qty);
        const newPercent = deposit.quantity > 0 ? (newRemaining / deposit.quantity) * 100 : 0;
        const newStatus = newRemaining <= 0 ? 'withdrawn' : 'in_store';

        await supabase
          .from('deposits')
          .update({
            remaining_qty: newRemaining,
            remaining_percent: newPercent,
            status: newStatus,
          })
          .eq('id', selectedWithdrawal.deposit_id);
      }

      toast({ type: 'success', title: 'เบิกเหล้าสำเร็จ', message: `เบิก ${qty} หน่วย` });
    } else {
      // Reject withdrawal
      const { error } = await supabase
        .from('withdrawals')
        .update({
          status: 'rejected',
          processed_by: user.id,
          notes: processNotes || null,
        })
        .eq('id', selectedWithdrawal.id);

      if (error) {
        toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถปฏิเสธรายการได้' });
        setIsSubmitting(false);
        return;
      }

      // Reset deposit status back to in_store if it was pending_withdrawal
      await supabase
        .from('deposits')
        .update({ status: 'in_store' })
        .eq('id', selectedWithdrawal.deposit_id)
        .eq('status', 'pending_withdrawal');

      toast({ type: 'warning', title: 'ปฏิเสธรายการเบิกเหล้าแล้ว' });
    }

    setIsSubmitting(false);
    setShowProcessModal(false);
    setSelectedWithdrawal(null);
    loadWithdrawals();
  };

  const pendingCount = withdrawals.filter((w) => w.status === 'pending' || w.status === 'approved').length;

  const tabsWithCounts = withdrawalTabs.map((t) => {
    if (t.id === 'pending') return { ...t, count: activeTab !== 'pending' ? pendingCount : undefined };
    return t;
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
            กลับหน้าฝากเหล้า
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">เบิกเหล้า</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          ประวัติและจัดการรายการเบิกเหล้าของลูกค้า
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">รอดำเนินการ</p>
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
                {withdrawals.filter((w) => w.status === 'completed').length}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">สำเร็จ</p>
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
                {withdrawals.filter((w) => w.status === 'rejected').length}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ปฏิเสธ</p>
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
      ) : withdrawals.length === 0 ? (
        <EmptyState
          icon={Package}
          title="ไม่มีรายการเบิกเหล้า"
          description={
            activeTab === 'pending'
              ? 'ไม่มีรายการเบิกเหล้าที่รอดำเนินการ'
              : activeTab === 'completed'
                ? 'ไม่มีรายการเบิกเหล้าที่สำเร็จ'
                : 'ไม่มีรายการเบิกเหล้าที่ถูกปฏิเสธ'
          }
        />
      ) : (
        <div className="space-y-3">
          {withdrawals.map((withdrawal) => {
            const isPending = withdrawal.status === 'pending' || withdrawal.status === 'approved';

            return (
              <Card key={withdrawal.id} padding="none">
                <div className="p-4 sm:p-5">
                  {/* Withdrawal Info */}
                  <div className="mb-3 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {withdrawal.product_name}
                        </h3>
                        <Badge variant={statusVariantMap[withdrawal.status] || 'default'}>
                          {WITHDRAWAL_STATUS_LABELS[withdrawal.status] || withdrawal.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">ลูกค้า</span>
                      <p className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        {withdrawal.customer_name}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">จำนวนขอเบิก</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatNumber(withdrawal.requested_qty)}
                      </p>
                    </div>
                    {withdrawal.actual_qty !== null && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">จำนวนจริง</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {formatNumber(withdrawal.actual_qty)}
                        </p>
                      </div>
                    )}
                    {withdrawal.table_number && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">โต๊ะ</span>
                        <p className="font-medium text-gray-900 dark:text-white">{withdrawal.table_number}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">วันที่</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatThaiDateTime(withdrawal.created_at)}
                      </p>
                    </div>
                  </div>

                  {withdrawal.notes && (
                    <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                      หมายเหตุ: {withdrawal.notes}
                    </p>
                  )}

                  {/* Action Buttons for Pending */}
                  {isPending && (
                    <div className="flex gap-2">
                      <Button
                        className="min-h-[44px] flex-1"
                        variant="primary"
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        onClick={() => openProcessModal(withdrawal, 'complete')}
                      >
                        ดำเนินการเบิก
                      </Button>
                      <Button
                        className="min-h-[44px] flex-1"
                        variant="danger"
                        icon={<XCircle className="h-4 w-4" />}
                        onClick={() => openProcessModal(withdrawal, 'reject')}
                      >
                        ปฏิเสธ
                      </Button>
                    </div>
                  )}
                </div>
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
          setSelectedWithdrawal(null);
        }}
        title={processAction === 'complete' ? 'ดำเนินการเบิกเหล้า' : 'ปฏิเสธการเบิกเหล้า'}
        description={
          selectedWithdrawal
            ? `${selectedWithdrawal.product_name} - ${selectedWithdrawal.customer_name}`
            : undefined
        }
        size="md"
      >
        <div className="space-y-4">
          {/* Summary */}
          {selectedWithdrawal && (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">สินค้า</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedWithdrawal.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">ลูกค้า</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedWithdrawal.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">จำนวนขอเบิก</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatNumber(selectedWithdrawal.requested_qty)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {processAction === 'complete' && (
            <>
              <Input
                label="จำนวนที่เบิกจริง"
                type="number"
                value={actualQty}
                onChange={(e) => setActualQty(e.target.value)}
                placeholder="0"
                hint="ระบุจำนวนที่เบิกให้ลูกค้าจริง"
              />

              {/* Photo Upload Placeholder */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  ถ่ายรูปประกอบ (ไม่บังคับ)
                </label>
                <div className="flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-gray-600 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/10">
                  <div className="text-center">
                    <Camera className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      แตะเพื่อถ่ายรูปหรือเลือกรูป
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          <Textarea
            label="หมายเหตุ"
            value={processNotes}
            onChange={(e) => setProcessNotes(e.target.value)}
            placeholder={
              processAction === 'complete'
                ? 'หมายเหตุเพิ่มเติม (ไม่บังคับ)'
                : 'ระบุเหตุผลในการปฏิเสธ'
            }
            rows={3}
          />
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowProcessModal(false);
              setSelectedWithdrawal(null);
            }}
          >
            ยกเลิก
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
            {processAction === 'complete' ? 'ยืนยันเบิก' : 'ปฏิเสธ'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
