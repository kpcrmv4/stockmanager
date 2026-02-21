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
  CardHeader,
  CardContent,
  Input,
  Modal,
  ModalFooter,
  Textarea,
  EmptyState,
  toast,
} from '@/components/ui';
import { formatThaiDate, formatThaiDateTime, formatNumber, daysUntil } from '@/lib/utils/format';
import { DEPOSIT_STATUS_LABELS, WITHDRAWAL_STATUS_LABELS } from '@/lib/utils/constants';
import {
  ArrowLeft,
  Wine,
  User,
  Phone,
  Package,
  Calendar,
  CalendarPlus,
  Clock,
  Hash,
  MapPin,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRightLeft,
  Minus,
  History,
  Printer,
  Tag,
  Image as ImageIcon,
  Crown,
  Truck,
} from 'lucide-react';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { extendExpiryISO } from '@/lib/utils/date';
import type { ReceiptSettings } from '@/types/database';

interface Deposit {
  id: string;
  store_id: string;
  deposit_code: string;
  customer_id: string | null;
  line_user_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  remaining_qty: number;
  remaining_percent: number | null;
  table_number: string | null;
  status: string;
  expiry_date: string | null;
  received_by: string | null;
  notes: string | null;
  photo_url: string | null;
  customer_photo_url: string | null;
  received_photo_url: string | null;
  confirm_photo_url: string | null;
  is_vip: boolean;
  created_at: string;
}

interface Withdrawal {
  id: string;
  deposit_id: string;
  customer_name: string;
  product_name: string;
  requested_qty: number;
  actual_qty: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface DepositDetailProps {
  deposit: Deposit;
  onBack: () => void;
  storeName?: string;
}

const statusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending_confirm: 'warning',
  in_store: 'success',
  pending_withdrawal: 'info',
  withdrawn: 'default',
  expired: 'danger',
  transfer_pending: 'warning',
  transferred_out: 'info',
};

const withdrawalVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  approved: 'info',
  completed: 'success',
  rejected: 'danger',
};

// Status timeline order
const statusTimeline = [
  { key: 'pending_confirm', label: 'รอยืนยัน', icon: Clock },
  { key: 'in_store', label: 'อยู่ในร้าน', icon: Wine },
  { key: 'pending_withdrawal', label: 'รอเบิก', icon: Package },
  { key: 'withdrawn', label: 'เบิกแล้ว', icon: CheckCircle2 },
];

export function DepositDetail({ deposit: initialDeposit, onBack, storeName = '' }: DepositDetailProps) {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [deposit, setDeposit] = useState<Deposit>(initialDeposit);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(true);

  // Withdrawal modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawQty, setWithdrawQty] = useState('');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expiry modal
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [expiryNotifyCustomer, setExpiryNotifyCustomer] = useState(false);

  // Transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferNotes, setTransferNotes] = useState('');

  // Extend expiry modal
  const [showExtendExpiryModal, setShowExtendExpiryModal] = useState(false);
  const [extendDays, setExtendDays] = useState('30');

  // Print state
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);

  // Receipt settings (for print payload QR)
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);

  const refreshDeposit = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('deposits')
      .select('*')
      .eq('id', deposit.id)
      .single();
    if (data) setDeposit(data as Deposit);
  }, [deposit.id]);

  const loadWithdrawals = useCallback(async () => {
    setIsLoadingWithdrawals(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('deposit_id', deposit.id)
      .order('created_at', { ascending: false });

    if (data) setWithdrawals(data as Withdrawal[]);
    setIsLoadingWithdrawals(false);
  }, [deposit.id]);

  // Load receipt settings for print payload
  const loadReceiptSettings = useCallback(async () => {
    if (!currentStoreId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('store_settings')
      .select('receipt_settings')
      .eq('store_id', currentStoreId)
      .single();
    if (data?.receipt_settings) {
      setReceiptSettings(data.receipt_settings as unknown as ReceiptSettings);
    }
  }, [currentStoreId]);

  useEffect(() => {
    loadWithdrawals();
    loadReceiptSettings();
  }, [loadWithdrawals, loadReceiptSettings]);

  const expiryDays = deposit.expiry_date ? daysUntil(deposit.expiry_date) : null;
  const isExpiringSoon = expiryDays !== null && expiryDays <= 7 && expiryDays > 0 && deposit.status === 'in_store';
  const isExpired = expiryDays !== null && expiryDays <= 0;
  const remainingPercent = deposit.quantity > 0
    ? Math.round((deposit.remaining_qty / deposit.quantity) * 100)
    : 0;

  // Determine current timeline step
  const currentStatusIndex = statusTimeline.findIndex((s) => s.key === deposit.status);
  const effectiveIndex = deposit.status === 'expired' || deposit.status === 'transfer_pending' || deposit.status === 'transferred_out' ? -1 : currentStatusIndex;

  const handleWithdrawal = async () => {
    if (!user || !currentStoreId) return;
    const qty = parseFloat(withdrawQty);
    if (isNaN(qty) || qty <= 0) {
      toast({ type: 'error', title: 'กรุณาระบุจำนวนที่ถูกต้อง' });
      return;
    }
    if (qty > deposit.remaining_qty) {
      toast({ type: 'error', title: 'จำนวนเกินกว่าที่คงเหลือ', message: `คงเหลือ ${formatNumber(deposit.remaining_qty)} หน่วย` });
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    // Create withdrawal record
    const { error: withdrawalError } = await supabase.from('withdrawals').insert({
      deposit_id: deposit.id,
      store_id: currentStoreId,
      line_user_id: deposit.line_user_id,
      customer_name: deposit.customer_name,
      product_name: deposit.product_name,
      requested_qty: qty,
      actual_qty: qty,
      status: 'completed',
      processed_by: user.id,
      notes: withdrawNotes.trim() || null,
    });

    if (withdrawalError) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถสร้างรายการเบิกได้' });
      setIsSubmitting(false);
      return;
    }

    // Update deposit
    const newRemaining = Math.max(0, deposit.remaining_qty - qty);
    const newPercent = deposit.quantity > 0 ? (newRemaining / deposit.quantity) * 100 : 0;
    const newStatus = newRemaining <= 0 ? 'withdrawn' : 'in_store';

    const { error: updateError } = await supabase
      .from('deposits')
      .update({
        remaining_qty: newRemaining,
        remaining_percent: newPercent,
        status: newStatus,
      })
      .eq('id', deposit.id);

    if (updateError) {
      toast({ type: 'warning', title: 'บันทึกรายการเบิกแล้ว', message: 'แต่อัปเดตยอดคงเหลือไม่สำเร็จ' });
    } else {
      toast({ type: 'success', title: 'เบิกเหล้าสำเร็จ', message: `เบิก ${formatNumber(qty)} หน่วย` });
    }

    setShowWithdrawModal(false);
    setWithdrawQty('');
    setWithdrawNotes('');
    setIsSubmitting(false);
    refreshDeposit();
    loadWithdrawals();
  };

  const handleMarkExpired = async () => {
    if (!user || !currentStoreId) return;
    setIsSubmitting(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('deposits')
      .update({ status: 'expired' })
      .eq('id', deposit.id);

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถเปลี่ยนสถานะได้' });
    } else {
      // Audit log
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_STATUS_CHANGED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { status: deposit.status },
        new_value: { status: 'expired', notify_customer: expiryNotifyCustomer },
        changed_by: user.id,
      });

      // Customer notification (if toggled on)
      if (expiryNotifyCustomer && deposit.line_user_id) {
        await supabase.from('notifications').insert({
          user_id: deposit.line_user_id,
          store_id: currentStoreId,
          title: 'รายการฝากเหล้าหมดอายุ',
          body: `รายการ ${deposit.deposit_code} (${deposit.product_name}) หมดอายุแล้ว`,
          type: 'deposit_expired',
          data: { deposit_id: deposit.id, deposit_code: deposit.deposit_code },
        });
      }

      toast({ type: 'warning', title: 'เปลี่ยนสถานะเป็นหมดอายุแล้ว' });
    }

    setShowExpiryModal(false);
    setExpiryNotifyCustomer(false);
    setIsSubmitting(false);
    refreshDeposit();
  };

  const handleToggleVip = async () => {
    if (!user || !currentStoreId) return;
    setIsSubmitting(true);
    const supabase = createClient();

    const newIsVip = !deposit.is_vip;
    const updateData: Record<string, unknown> = { is_vip: newIsVip };
    if (newIsVip) {
      updateData.expiry_date = null;
      // VIP should never be expired — revert to in_store
      if (deposit.status === 'expired') {
        updateData.status = 'in_store';
      }
    }

    const { error } = await supabase
      .from('deposits')
      .update(updateData)
      .eq('id', deposit.id);

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถเปลี่ยนสถานะ VIP ได้' });
    } else {
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_STATUS_CHANGED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { is_vip: deposit.is_vip, expiry_date: deposit.expiry_date, status: deposit.status },
        new_value: { is_vip: newIsVip, expiry_date: newIsVip ? null : deposit.expiry_date, status: newIsVip && deposit.status === 'expired' ? 'in_store' : deposit.status },
        changed_by: user.id,
      });
      toast({
        type: 'success',
        title: newIsVip ? 'เปลี่ยนเป็น VIP แล้ว' : 'ยกเลิก VIP แล้ว',
        message: newIsVip ? 'ไม่มีวันหมดอายุ' : 'กรุณาตั้งค่าวันหมดอายุใหม่',
      });
    }

    setIsSubmitting(false);
    refreshDeposit();
  };

  const handleTransfer = async () => {
    if (!user) return;
    setIsSubmitting(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('deposits')
      .update({
        status: 'transferred_out',
        notes: deposit.notes
          ? `${deposit.notes}\nโอนออก: ${transferNotes || '-'}`
          : `โอนออก: ${transferNotes || '-'}`,
      })
      .eq('id', deposit.id);

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถโอนรายการได้' });
    } else {
      toast({ type: 'success', title: 'โอนรายการฝากเหล้าสำเร็จ' });
    }

    setShowTransferModal(false);
    setTransferNotes('');
    setIsSubmitting(false);
    refreshDeposit();
  };

  const handleExtendExpiry = async () => {
    if (!user || !currentStoreId) return;
    const days = parseInt(extendDays);
    if (isNaN(days) || days <= 0) {
      toast({ type: 'error', title: 'กรุณาระบุจำนวนวันที่ถูกต้อง' });
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const oldExpiryDate = deposit.expiry_date;
    const newExpiryISO = extendExpiryISO(oldExpiryDate, days);

    const { error } = await supabase
      .from('deposits')
      .update({ expiry_date: newExpiryISO })
      .eq('id', deposit.id);

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถขยายวันหมดอายุได้' });
    } else {
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_STATUS_CHANGED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { expiry_date: oldExpiryDate },
        new_value: { expiry_date: newExpiryISO, extended_days: days },
        changed_by: user?.id || null,
      });
      toast({
        type: 'success',
        title: 'ขยายวันหมดอายุสำเร็จ',
        message: `ขยายเพิ่ม ${days} วัน`,
      });
    }

    setShowExtendExpiryModal(false);
    setExtendDays('30');
    setIsSubmitting(false);
    refreshDeposit();
  };

  // --- Print handlers ---
  const handlePrint = async (jobType: 'receipt' | 'label') => {
    if (!user || !currentStoreId) return;
    const setLoading = jobType === 'receipt' ? setIsPrintingReceipt : setIsPrintingLabel;
    setLoading(true);

    const supabase = createClient();
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
      store_name: storeName,
      received_by_name: null,
      qr_code_image_url: receiptSettings?.qr_code_image_url ?? null,
      line_oa_id: receiptSettings?.line_oa_id ?? null,
    };

    const { error } = await supabase.from('print_queue').insert({
      store_id: currentStoreId,
      deposit_id: deposit.id,
      job_type: jobType,
      status: 'pending',
      copies: 1,
      payload,
      requested_by: user.id,
    });

    if (error) {
      toast({ type: 'error', title: 'ไม่สามารถส่งคำสั่งพิมพ์ได้', message: error.message });
    } else {
      toast({
        type: 'success',
        title: jobType === 'receipt' ? 'ส่งพิมพ์ใบรับฝากแล้ว' : 'ส่งพิมพ์ป้ายขวดแล้ว',
        message: 'รอเครื่องพิมพ์ที่บาร์ดำเนินการ',
      });
    }

    setLoading(false);
  };

  const canWithdraw = deposit.status === 'in_store' && deposit.remaining_qty > 0;
  const canMarkExpired = (deposit.status === 'in_store' || deposit.status === 'pending_confirm') && !deposit.is_vip;
  const canTransfer = deposit.status === 'in_store';
  const canExtendExpiry = deposit.status === 'in_store' && !deposit.is_vip;
  const canToggleVip = deposit.status === 'in_store' || deposit.status === 'pending_confirm';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับหน้ารายการ
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
              <Wine className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {deposit.deposit_code}
                </h1>
                <Badge variant={statusVariantMap[deposit.status] || 'default'}>
                  {DEPOSIT_STATUS_LABELS[deposit.status] || deposit.status}
                </Badge>
                {deposit.is_vip && (
                  <Badge variant="warning">
                    <Crown className="mr-0.5 h-3 w-3" />
                    VIP
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {deposit.product_name}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Expiry Warning */}
      {isExpiringSoon && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            รายการนี้จะหมดอายุใน {expiryDays} วัน กรุณาแจ้งลูกค้า
          </p>
        </div>
      )}

      {/* Photo Gallery */}
      {(deposit.customer_photo_url || deposit.received_photo_url || deposit.confirm_photo_url || deposit.photo_url) && (
        <Card padding="none">
          <CardHeader title="รูปถ่าย" />
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {/* รูปหลัก (จากลูกค้า) — customer_photo_url preferred, photo_url as legacy fallback */}
              {(deposit.customer_photo_url || deposit.photo_url) && (
                <div className="space-y-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={deposit.customer_photo_url || deposit.photo_url!}
                      alt="รูปหลัก (จากลูกค้า)"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">รูปหลัก (จากลูกค้า)</p>
                </div>
              )}
              {/* Show legacy photo_url separately only if both exist */}
              {deposit.customer_photo_url && deposit.photo_url && deposit.customer_photo_url !== deposit.photo_url && (
                <div className="space-y-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={deposit.photo_url}
                      alt="รูปเพิ่มเติม"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">รูปเพิ่มเติม</p>
                </div>
              )}
              {deposit.received_photo_url && (
                <div className="space-y-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={deposit.received_photo_url}
                      alt="รูปรับเข้าร้าน (Staff)"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">รูปรับเข้าร้าน</p>
                </div>
              )}
              {deposit.confirm_photo_url && (
                <div className="space-y-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={deposit.confirm_photo_url}
                      alt="รูปยืนยัน (Bar)"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">รูปยืนยัน (Bar)</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Info */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Deposit Info */}
        <Card padding="none">
          <CardHeader title="ข้อมูลการฝาก" />
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Hash className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">รหัสฝาก</p>
                    <p className="font-mono font-medium text-gray-900 dark:text-white">{deposit.deposit_code}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">ลูกค้า</p>
                    <p className="font-medium text-gray-900 dark:text-white">{deposit.customer_name}</p>
                  </div>
                </div>
              </div>

              {deposit.customer_phone && (
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">เบอร์โทรศัพท์</p>
                    <p className="font-medium text-gray-900 dark:text-white">{deposit.customer_phone}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Wine className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">สินค้า</p>
                    <p className="font-medium text-gray-900 dark:text-white">{deposit.product_name}</p>
                    {deposit.category && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{deposit.category}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">จำนวน</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatNumber(deposit.remaining_qty)} / {formatNumber(deposit.quantity)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Remaining bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>คงเหลือ</span>
                  <span>{remainingPercent}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      remainingPercent > 50
                        ? 'bg-emerald-500'
                        : remainingPercent > 20
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    )}
                    style={{ width: `${remainingPercent}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {deposit.table_number && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">โต๊ะ</p>
                      <p className="font-medium text-gray-900 dark:text-white">{deposit.table_number}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">วันที่ฝาก</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatThaiDate(deposit.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                {deposit.is_vip ? (
                  <>
                    <Crown className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">สถานะ VIP</p>
                      <p className="font-medium text-amber-600 dark:text-amber-400">
                        ไม่มีวันหมดอายุ
                      </p>
                    </div>
                  </>
                ) : deposit.expiry_date ? (
                  <>
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">วันหมดอายุ</p>
                      <p className={cn(
                        'font-medium',
                        isExpiringSoon || isExpired
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-900 dark:text-white'
                      )}>
                        {formatThaiDate(deposit.expiry_date)}
                        {expiryDays !== null && expiryDays > 0 && (
                          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                            (เหลือ {expiryDays} วัน)
                          </span>
                        )}
                        {isExpired && (
                          <span className="ml-1 text-xs text-red-500">(หมดอายุแล้ว)</span>
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">วันหมดอายุ</p>
                      <p className="font-medium text-gray-400 dark:text-gray-500">ไม่ระบุ</p>
                    </div>
                  </>
                )}
              </div>

              {deposit.notes && (
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">หมายเหตุ</p>
                    <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                      {deposit.notes}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Status Timeline + Actions */}
        <div className="space-y-6">
          {/* Status Timeline */}
          <Card padding="none">
            <CardHeader title="สถานะการฝาก" />
            <CardContent>
              <div className="space-y-0">
                {statusTimeline.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = step.key === deposit.status;
                  const isPast = effectiveIndex >= 0 && index < effectiveIndex;
                  const isCurrent = effectiveIndex >= 0 && index === effectiveIndex;
                  const isFuture = effectiveIndex >= 0 && index > effectiveIndex;

                  return (
                    <div key={step.key} className="flex gap-3">
                      {/* Timeline line and dot */}
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            isCurrent
                              ? 'bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-900/30'
                              : isPast
                                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                : 'bg-gray-100 dark:bg-gray-700'
                          )}
                        >
                          <StepIcon
                            className={cn(
                              'h-4 w-4',
                              isCurrent
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : isPast
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-400 dark:text-gray-500'
                            )}
                          />
                        </div>
                        {index < statusTimeline.length - 1 && (
                          <div
                            className={cn(
                              'h-8 w-0.5',
                              isPast
                                ? 'bg-emerald-300 dark:bg-emerald-700'
                                : 'bg-gray-200 dark:bg-gray-700'
                            )}
                          />
                        )}
                      </div>

                      {/* Label */}
                      <div className="pb-8">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            isCurrent
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : isPast
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-gray-400 dark:text-gray-500'
                          )}
                        >
                          {step.label}
                        </p>
                        {isCurrent && (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            สถานะปัจจุบัน
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Special status badges for expired/transfer_pending/transferred */}
                {(deposit.status === 'expired' || deposit.status === 'transfer_pending' || deposit.status === 'transferred_out') && (
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full',
                        deposit.status === 'expired'
                          ? 'bg-red-100 ring-2 ring-red-500 dark:bg-red-900/30'
                          : deposit.status === 'transfer_pending'
                            ? 'bg-amber-100 ring-2 ring-amber-500 dark:bg-amber-900/30'
                            : 'bg-blue-100 ring-2 ring-blue-500 dark:bg-blue-900/30'
                      )}
                    >
                      {deposit.status === 'expired' ? (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : deposit.status === 'transfer_pending' ? (
                        <Truck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <ArrowRightLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        deposit.status === 'expired'
                          ? 'text-red-600 dark:text-red-400'
                          : deposit.status === 'transfer_pending'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-blue-600 dark:text-blue-400'
                      )}
                    >
                      {DEPOSIT_STATUS_LABELS[deposit.status] || deposit.status}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {(canWithdraw || canMarkExpired || canTransfer || canExtendExpiry || canToggleVip) && (
            <Card padding="none">
              <CardHeader title="ดำเนินการ" />
              <CardContent>
                <div className="space-y-2">
                  {canWithdraw && (
                    <Button
                      className="min-h-[44px] w-full justify-start"
                      variant="outline"
                      icon={<Minus className="h-4 w-4" />}
                      onClick={() => setShowWithdrawModal(true)}
                    >
                      เบิกเหล้า
                    </Button>
                  )}
                  {canToggleVip && (
                    <Button
                      className="min-h-[44px] w-full justify-start"
                      variant="outline"
                      icon={<Crown className="h-4 w-4" />}
                      onClick={handleToggleVip}
                      isLoading={isSubmitting}
                    >
                      {deposit.is_vip ? 'ยกเลิก VIP' : 'เปลี่ยนเป็น VIP'}
                    </Button>
                  )}
                  {canMarkExpired && (
                    <Button
                      className="min-h-[44px] w-full justify-start"
                      variant="outline"
                      icon={<AlertTriangle className="h-4 w-4" />}
                      onClick={() => setShowExpiryModal(true)}
                    >
                      ทำเครื่องหมายหมดอายุ
                    </Button>
                  )}
                  {canTransfer && (
                    <Button
                      className="min-h-[44px] w-full justify-start"
                      variant="outline"
                      icon={<ArrowRightLeft className="h-4 w-4" />}
                      onClick={() => setShowTransferModal(true)}
                    >
                      โอนรายการ
                    </Button>
                  )}
                  {canExtendExpiry && (
                    <Button
                      className="min-h-[44px] w-full justify-start"
                      variant="outline"
                      icon={<CalendarPlus className="h-4 w-4" />}
                      onClick={() => setShowExtendExpiryModal(true)}
                    >
                      ขยายวันหมดอายุ
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Print Actions */}
          <Card padding="none">
            <CardHeader title="พิมพ์เอกสาร" />
            <CardContent>
              <div className="space-y-2">
                <Button
                  className="min-h-[44px] w-full justify-start"
                  variant="outline"
                  icon={<Printer className="h-4 w-4" />}
                  onClick={() => handlePrint('receipt')}
                  isLoading={isPrintingReceipt}
                >
                  พิมพ์ใบรับฝาก
                </Button>
                <Button
                  className="min-h-[44px] w-full justify-start"
                  variant="outline"
                  icon={<Tag className="h-4 w-4" />}
                  onClick={() => handlePrint('label')}
                  isLoading={isPrintingLabel}
                >
                  พิมพ์ป้ายขวด
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Withdrawal History */}
      <Card padding="none">
        <CardHeader
          title="ประวัติการเบิก"
          description={`${withdrawals.length} รายการ`}
        />
        {isLoadingWithdrawals ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={History}
              title="ยังไม่มีประวัติการเบิก"
              description="ยังไม่มีรายการเบิกเหล้าสำหรับการฝากนี้"
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      เบิก {formatNumber(w.actual_qty ?? w.requested_qty)} หน่วย
                    </p>
                    <Badge variant={withdrawalVariantMap[w.status] || 'default'} size="sm">
                      {WITHDRAWAL_STATUS_LABELS[w.status] || w.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {formatThaiDateTime(w.created_at)}
                  </p>
                  {w.notes && (
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {w.notes}
                    </p>
                  )}
                </div>
                <div className="text-right text-sm">
                  {w.actual_qty !== null && w.actual_qty !== w.requested_qty && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      ขอเบิก: {formatNumber(w.requested_qty)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Withdraw Modal */}
      <Modal
        isOpen={showWithdrawModal}
        onClose={() => {
          setShowWithdrawModal(false);
          setWithdrawQty('');
          setWithdrawNotes('');
        }}
        title="เบิกเหล้า"
        description={`${deposit.product_name} - คงเหลือ ${formatNumber(deposit.remaining_qty)} หน่วย`}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="จำนวนที่ต้องการเบิก"
            type="number"
            value={withdrawQty}
            onChange={(e) => setWithdrawQty(e.target.value)}
            placeholder="0"
            hint={`สูงสุด ${formatNumber(deposit.remaining_qty)} หน่วย`}
            error={
              withdrawQty && parseFloat(withdrawQty) > deposit.remaining_qty
                ? `เกินจำนวนคงเหลือ (${formatNumber(deposit.remaining_qty)})`
                : undefined
            }
          />
          <Textarea
            label="หมายเหตุ"
            value={withdrawNotes}
            onChange={(e) => setWithdrawNotes(e.target.value)}
            placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
            rows={3}
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowWithdrawModal(false);
              setWithdrawQty('');
              setWithdrawNotes('');
            }}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleWithdrawal}
            isLoading={isSubmitting}
            disabled={!withdrawQty || parseFloat(withdrawQty) <= 0 || parseFloat(withdrawQty) > deposit.remaining_qty}
            icon={<Minus className="h-4 w-4" />}
          >
            ยืนยันเบิก
          </Button>
        </ModalFooter>
      </Modal>

      {/* Mark Expired Modal */}
      <Modal
        isOpen={showExpiryModal}
        onClose={() => {
          setShowExpiryModal(false);
          setExpiryNotifyCustomer(false);
        }}
        title="ทำเครื่องหมายหมดอายุ"
        description="ต้องการเปลี่ยนสถานะรายการนี้เป็นหมดอายุหรือไม่?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="font-medium">คำเตือน</p>
            <p className="mt-1">
              การทำเครื่องหมายหมดอายุจะไม่สามารถเบิกเหล้าได้อีก กรุณาตรวจสอบก่อนดำเนินการ
            </p>
          </div>
          {deposit.line_user_id && (
            <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <input
                type="checkbox"
                checked={expiryNotifyCustomer}
                onChange={(e) => setExpiryNotifyCustomer(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">แจ้งเตือนลูกค้า</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ส่งการแจ้งเตือนไปยังลูกค้าว่ารายการฝากหมดอายุแล้ว
                </p>
              </div>
            </label>
          )}
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => {
            setShowExpiryModal(false);
            setExpiryNotifyCustomer(false);
          }}>
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            onClick={handleMarkExpired}
            isLoading={isSubmitting}
            icon={<AlertTriangle className="h-4 w-4" />}
          >
            ยืนยันหมดอายุ
          </Button>
        </ModalFooter>
      </Modal>

      {/* Transfer Modal */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          setTransferNotes('');
        }}
        title="โอนรายการฝากเหล้า"
        description="โอนรายการฝากเหล้าออกจากร้าน"
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">สินค้า</span>
                <span className="font-medium text-gray-900 dark:text-white">{deposit.product_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">ลูกค้า</span>
                <span className="font-medium text-gray-900 dark:text-white">{deposit.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">คงเหลือ</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatNumber(deposit.remaining_qty)} หน่วย
                </span>
              </div>
            </div>
          </div>
          <Textarea
            label="หมายเหตุการโอน"
            value={transferNotes}
            onChange={(e) => setTransferNotes(e.target.value)}
            placeholder="ระบุเหตุผลหรือปลายทางในการโอน"
            rows={3}
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowTransferModal(false);
              setTransferNotes('');
            }}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleTransfer}
            isLoading={isSubmitting}
            icon={<ArrowRightLeft className="h-4 w-4" />}
          >
            ยืนยันโอน
          </Button>
        </ModalFooter>
      </Modal>

      {/* Extend Expiry Modal */}
      <Modal
        isOpen={showExtendExpiryModal}
        onClose={() => {
          setShowExtendExpiryModal(false);
          setExtendDays('30');
        }}
        title="ขยายวันหมดอายุ"
        description={deposit.product_name}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">วันหมดอายุปัจจุบัน</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {deposit.expiry_date ? formatThaiDate(deposit.expiry_date) : 'ไม่ระบุ'}
                </span>
              </div>
            </div>
          </div>
          <Input
            label="จำนวนวันที่ต้องการขยาย"
            type="number"
            value={extendDays}
            onChange={(e) => setExtendDays(e.target.value)}
            placeholder="30"
            hint={
              extendDays && parseInt(extendDays) > 0 && deposit.expiry_date
                ? `วันหมดอายุใหม่: ${formatThaiDate(
                    new Date(
                      new Date(deposit.expiry_date).getTime() + parseInt(extendDays) * 86400000
                    ).toISOString()
                  )}`
                : 'ระบุจำนวนวันที่ต้องการขยาย'
            }
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowExtendExpiryModal(false);
              setExtendDays('30');
            }}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleExtendExpiry}
            isLoading={isSubmitting}
            disabled={!extendDays || parseInt(extendDays) <= 0}
            icon={<CalendarPlus className="h-4 w-4" />}
          >
            ยืนยันขยาย
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
