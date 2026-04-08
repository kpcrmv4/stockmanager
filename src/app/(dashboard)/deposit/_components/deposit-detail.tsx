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
  PhotoUpload,
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
  ShieldCheck,
  Warehouse,
  Send,
} from 'lucide-react';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { useTranslations } from 'next-intl';
import { notifyChatWithdrawalCompleted, notifyChatWithdrawalRequest, sendChatBotMessage, syncChatActionCardStatus } from '@/lib/chat/bot-client';
import { notifyChatTransferBatch, notifyChatTransferSubmitted } from '@/lib/chat/transfer-bot-client';
import { notifyStaff } from '@/lib/notifications/client';
import { extendExpiryISO } from '@/lib/utils/date';
import { generateTransferCode } from '@/lib/utils/transfer-code';
import type { ReceiptSettings } from '@/types/database';
import type { TransferCardItem } from '@/types/transfer-chat';

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

// Status timeline keys — labels resolved via i18n in component
const statusTimelineKeys = [
  { key: 'pending_confirm', labelKey: 'detail.statusPendingConfirm', icon: Clock },
  { key: 'in_store', labelKey: 'detail.statusInStore', icon: Wine },
  { key: 'pending_withdrawal', labelKey: 'detail.statusPendingWithdrawal', icon: Package },
  { key: 'withdrawn', labelKey: 'detail.statusWithdrawn', icon: CheckCircle2 },
];

const expiredTimelineKeys = [
  { key: 'expired', labelKey: 'detail.statusExpired', icon: XCircle },
  { key: 'transfer_pending', labelKey: 'detail.statusTransferPending', icon: Truck },
  { key: 'transferred_out', labelKey: 'detail.statusTransferredOut', icon: Warehouse },
];

export function DepositDetail({ deposit: initialDeposit, onBack, storeName = '' }: DepositDetailProps) {
  const t = useTranslations('deposit');
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

  // Transfer to HQ modal (for expired deposits)
  const [showTransferHqModal, setShowTransferHqModal] = useState(false);
  const [transferHqNotes, setTransferHqNotes] = useState('');
  const [transferHqPhoto, setTransferHqPhoto] = useState<string | null>(null);

  // Reject deposit modal (for pending_confirm)
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Extend expiry modal
  const [showExtendExpiryModal, setShowExtendExpiryModal] = useState(false);
  const [extendDays, setExtendDays] = useState('30');

  // Print state
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);

  // Print preview modal
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printPreviewType, setPrintPreviewType] = useState<'receipt' | 'label'>('receipt');

  // Bar confirm modal
  const [showBarConfirmModal, setShowBarConfirmModal] = useState(false);
  const [barConfirmPercent, setBarConfirmPercent] = useState('');
  const [barConfirmQty, setBarConfirmQty] = useState('');
  const [barConfirmPhoto, setBarConfirmPhoto] = useState<string | null>(null);

  // Staff/Bar names
  const [receivedByName, setReceivedByName] = useState<string | null>(null);
  const [confirmedByName, setConfirmedByName] = useState<string | null>(null);

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

  // Load staff/bar names
  const loadStaffNames = useCallback(async () => {
    const supabase = createClient();

    // Staff who received the deposit
    if (deposit.received_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', deposit.received_by)
        .single();
      if (profile) setReceivedByName(profile.display_name || profile.username);
    }

    // Bar who confirmed — check audit_logs
    const { data: auditLog } = await supabase
      .from('audit_logs')
      .select('changed_by')
      .eq('record_id', deposit.id)
      .eq('action_type', 'DEPOSIT_BAR_CONFIRMED')
      .limit(1)
      .maybeSingle();

    if (auditLog?.changed_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', auditLog.changed_by)
        .single();
      if (profile) setConfirmedByName(profile.display_name || profile.username);
    }
  }, [deposit.id, deposit.received_by]);

  useEffect(() => {
    loadWithdrawals();
    loadReceiptSettings();
    loadStaffNames();
  }, [loadWithdrawals, loadReceiptSettings, loadStaffNames]);

  const expiryDays = deposit.expiry_date ? daysUntil(deposit.expiry_date) : null;
  const isExpiringSoon = expiryDays !== null && expiryDays <= 7 && expiryDays > 0 && deposit.status === 'in_store';
  const isExpired = expiryDays !== null && expiryDays <= 0;
  const remainingPercent = deposit.quantity > 0
    ? Math.round((deposit.remaining_qty / deposit.quantity) * 100)
    : 0;

  // Determine current timeline step
  const currentStatusIndex = statusTimelineKeys.findIndex((s) => s.key === deposit.status);
  const effectiveIndex = deposit.status === 'expired' || deposit.status === 'transfer_pending' || deposit.status === 'transferred_out' ? -1 : currentStatusIndex;

  const handleBarConfirm = async () => {
    if (!user || !currentStoreId) return;
    const percent = parseFloat(barConfirmPercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      toast({ type: 'error', title: t('detail.errorPercentRange') });
      return;
    }
    if (!barConfirmPhoto) {
      toast({ type: 'error', title: t('detail.errorPhotoRequired') });
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const qty = barConfirmQty ? parseFloat(barConfirmQty) : deposit.quantity;
    const updateData: Record<string, unknown> = {
      status: 'in_store',
      confirm_photo_url: barConfirmPhoto,
      remaining_percent: percent,
    };
    if (barConfirmQty && !isNaN(qty) && qty > 0) {
      updateData.quantity = qty;
      updateData.remaining_qty = qty;
    }

    const { error } = await supabase
      .from('deposits')
      .update(updateData)
      .eq('id', deposit.id);

    if (error) {
      toast({ type: 'error', title: t('detail.error'), message: t('detail.errorCannotConfirm') });
      setIsSubmitting(false);
      return;
    }

    // Audit log
    await logAudit({
      action_type: AUDIT_ACTIONS.DEPOSIT_BAR_CONFIRMED,
      record_id: deposit.id,
      table_name: 'deposits',
      changed_by: user.id,
      store_id: currentStoreId,
      new_value: {
        deposit_code: deposit.deposit_code,
        remaining_percent: percent,
        quantity: qty,
        confirm_photo_url: barConfirmPhoto,
      },
    });

    // Chat system message
    const displayName = user.displayName || user.username || 'Bar';
    sendChatBotMessage({
      storeId: currentStoreId,
      type: 'system',
      content: `✅ ${displayName} ยืนยันรับฝาก ${deposit.product_name} x${qty} (${deposit.deposit_code}) — ${deposit.customer_name} — คงเหลือ ${percent}%`,
    });

    // Push notification
    notifyStaff({
      storeId: currentStoreId,
      type: 'deposit_confirmed',
      title: t('detail.depositConfirmed'),
      body: `${displayName} ยืนยันรับฝาก ${deposit.product_name} — ${deposit.customer_name} (${deposit.deposit_code})`,
      data: { deposit_code: deposit.deposit_code },
      excludeUserId: user.id,
    });

    // Sync action card ในแชทให้เป็น completed
    syncChatActionCardStatus({
      storeId: currentStoreId,
      referenceId: deposit.deposit_code,
      actionType: 'deposit_claim',
      newStatus: 'completed',
      completedBy: user.id,
      completedByName: displayName,
    });

    toast({ type: 'success', title: t('detail.confirmSuccess') });
    setShowBarConfirmModal(false);
    setBarConfirmPercent('');
    setBarConfirmQty('');
    setBarConfirmPhoto(null);
    setIsSubmitting(false);
    refreshDeposit();
    loadStaffNames();
  };

  const handleWithdrawal = async () => {
    if (!user || !currentStoreId) return;
    const qty = parseFloat(withdrawQty);
    if (isNaN(qty) || qty <= 0) {
      toast({ type: 'error', title: t('detail.errorInvalidQty') });
      return;
    }
    if (qty > deposit.remaining_qty) {
      toast({ type: 'error', title: t('detail.errorExceedsRemaining'), message: t('detail.remainingUnits', { qty: formatNumber(deposit.remaining_qty) }) });
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    // Create withdrawal record as pending (requires Bar approval)
    const { error: withdrawalError } = await supabase.from('withdrawals').insert({
      deposit_id: deposit.id,
      store_id: currentStoreId,
      line_user_id: deposit.line_user_id,
      customer_name: deposit.customer_name,
      product_name: deposit.product_name,
      requested_qty: qty,
      status: 'pending',
      notes: withdrawNotes.trim() || null,
    });

    if (withdrawalError) {
      toast({ type: 'error', title: t('detail.error'), message: t('detail.errorCreateWithdrawal') });
      setIsSubmitting(false);
      return;
    }

    // Update deposit status to pending_withdrawal
    await supabase
      .from('deposits')
      .update({ status: 'pending_withdrawal' })
      .eq('id', deposit.id);

    toast({ type: 'success', title: t('detail.withdrawalRequestCreated'), message: t('detail.waitingBarApproval') });

    // Send action card to chat + push notification for Bar approval
    if (currentStoreId) {
      notifyChatWithdrawalRequest(currentStoreId, {
        deposit_code: deposit.deposit_code,
        customer_name: deposit.customer_name,
        product_name: deposit.product_name,
        requested_qty: qty,
        table_number: deposit.table_number,
        notes: withdrawNotes.trim() || null,
      });

      notifyStaff({
        storeId: currentStoreId,
        type: 'withdrawal_request',
        title: t('detail.notifyWithdrawalRequest'),
        body: `${deposit.customer_name} ขอเบิก ${deposit.product_name} x${qty} (${deposit.deposit_code})`,
        data: { deposit_code: deposit.deposit_code },
        excludeUserId: user?.id,
        roles: ['bar', 'manager', 'owner'],
      });
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
      toast({ type: 'error', title: t('detail.error'), message: t('detail.errorChangeStatus') });
    } else {
      // Audit log
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_STATUS_CHANGED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { status: deposit.status },
        new_value: {
          status: 'expired',
          notify_customer: expiryNotifyCustomer,
          deposit_code: deposit.deposit_code,
          customer_name: deposit.customer_name,
          product_name: deposit.product_name,
        },
        changed_by: user.id,
      });

      // Customer notification (if toggled on)
      if (expiryNotifyCustomer && deposit.line_user_id) {
        await supabase.from('notifications').insert({
          user_id: deposit.line_user_id,
          store_id: currentStoreId,
          title: t('detail.depositExpiredNotify'),
          body: `รายการ ${deposit.deposit_code} (${deposit.product_name}) หมดอายุแล้ว`,
          type: 'deposit_expired',
          data: { deposit_id: deposit.id, deposit_code: deposit.deposit_code },
        });
      }

      toast({ type: 'warning', title: t('detail.markedExpired') });
    }

    setShowExpiryModal(false);
    setExpiryNotifyCustomer(false);
    setIsSubmitting(false);
    refreshDeposit();
  };

  // Reject a pending_confirm deposit (bar/manager/owner)
  const handleRejectDeposit = async () => {
    if (!user || !currentStoreId || !rejectReason.trim()) return;
    setIsSubmitting(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('deposits')
      .update({
        status: 'withdrawn',
        notes: deposit.notes
          ? `${deposit.notes}\nปฏิเสธรับฝาก: ${rejectReason}`
          : `ปฏิเสธรับฝาก: ${rejectReason}`,
      })
      .eq('id', deposit.id);

    if (error) {
      toast({ type: 'error', title: t('detail.error'), message: t('detail.errorReject') });
    } else {
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_STATUS_CHANGED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { status: 'pending_confirm' },
        new_value: {
          status: 'withdrawn',
          reason: rejectReason,
          deposit_code: deposit.deposit_code,
          product_name: deposit.product_name,
        },
        changed_by: user.id,
      });
      toast({ type: 'success', title: t('detail.rejectSuccess') });
    }

    setShowRejectModal(false);
    setRejectReason('');
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
      toast({ type: 'error', title: t('detail.error'), message: t('detail.errorToggleVip') });
    } else {
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_STATUS_CHANGED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { is_vip: deposit.is_vip, expiry_date: deposit.expiry_date, status: deposit.status },
        new_value: {
          is_vip: newIsVip,
          expiry_date: newIsVip ? null : deposit.expiry_date,
          status: newIsVip && deposit.status === 'expired' ? 'in_store' : deposit.status,
          deposit_code: deposit.deposit_code,
          customer_name: deposit.customer_name,
          product_name: deposit.product_name,
        },
        changed_by: user.id,
      });
      toast({
        type: 'success',
        title: newIsVip ? t('detail.vipEnabled') : t('detail.vipDisabled'),
        message: newIsVip ? t('detail.noExpiryDate') : t('detail.pleaseSetExpiry'),
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
      toast({ type: 'error', title: t('detail.error'), message: t('detail.errorTransfer') });
    } else {
      toast({ type: 'success', title: t('detail.transferSuccess') });
    }

    setShowTransferModal(false);
    setTransferNotes('');
    setIsSubmitting(false);
    refreshDeposit();
  };

  // Transfer expired deposit to central warehouse (HQ)
  const handleTransferToHq = async () => {
    if (!user || !currentStoreId) return;
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // Find central store
      const { data: centralStore } = await supabase
        .from('stores')
        .select('id')
        .eq('is_central', true)
        .eq('active', true)
        .limit(1)
        .single();

      if (!centralStore) {
        toast({ type: 'error', title: t('detail.noHQ'), message: t('detail.noHQMessage') });
        setIsSubmitting(false);
        return;
      }

      // Get current store name
      const { data: storeData } = await supabase
        .from('stores')
        .select('store_name')
        .eq('id', currentStoreId)
        .single();
      const storeName = storeData?.store_name || t('detail.branch');

      // Generate transfer code
      const transferCode = await generateTransferCode(supabase);

      // Create transfer record
      const { data: insertedTransfer, error } = await supabase
        .from('transfers')
        .insert({
          from_store_id: currentStoreId,
          to_store_id: centralStore.id,
          deposit_id: deposit.id,
          product_name: deposit.product_name,
          quantity: deposit.remaining_qty || deposit.quantity,
          notes: transferHqNotes || null,
          photo_url: transferHqPhoto,
          requested_by: user.id,
          transfer_code: transferCode,
        })
        .select('id, deposit_id, product_name, quantity')
        .single();

      if (error) throw error;

      // Update deposit status to transfer_pending
      await supabase
        .from('deposits')
        .update({ status: 'transfer_pending' })
        .eq('id', deposit.id);

      // Audit log
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.TRANSFER_CREATED,
        table_name: 'transfers',
        record_id: transferCode,
        new_value: {
          transfer_code: transferCode,
          to: 'central_warehouse',
          deposit_count: 1,
          deposit_codes: [deposit.deposit_code],
        },
        changed_by: user.id,
      });

      // Notify store chat
      const submitterName = user.displayName || user.username || t('detail.staff');
      notifyChatTransferSubmitted(currentStoreId, {
        transfer_code: transferCode,
        deposit_count: 1,
        submitted_by_name: submitterName,
      });

      // Send transfer action card to HQ chat
      if (insertedTransfer) {
        const cardItems: TransferCardItem[] = [{
          transfer_id: insertedTransfer.id,
          deposit_id: insertedTransfer.deposit_id,
          deposit_code: deposit.deposit_code || null,
          product_name: insertedTransfer.product_name || deposit.product_name || '',
          customer_name: deposit.customer_name || null,
          quantity: insertedTransfer.quantity || deposit.quantity || 0,
          category: deposit.category || null,
        }];

        notifyChatTransferBatch(centralStore.id, {
          transfer_code: transferCode,
          from_store_id: currentStoreId,
          from_store_name: storeName,
          items: cardItems,
          submitted_by: user.id,
          submitted_by_name: submitterName,
          photo_url: transferHqPhoto,
          notes: transferHqNotes || null,
        });
      }

      toast({ type: 'success', title: t('detail.transferHqSuccess'), message: t('detail.transferCode', { code: transferCode }) });
      setShowTransferHqModal(false);
      setTransferHqNotes('');
      setTransferHqPhoto(null);
      refreshDeposit();
    } catch (err) {
      toast({ type: 'error', title: t('detail.error'), message: err instanceof Error ? err.message : t('detail.errorCannotTransfer') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtendExpiry = async () => {
    if (!user || !currentStoreId) return;
    const days = parseInt(extendDays);
    if (isNaN(days) || days <= 0) {
      toast({ type: 'error', title: t('detail.errorInvalidDays') });
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
      toast({ type: 'error', title: t('detail.error'), message: t('detail.errorExtendExpiry') });
    } else {
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_STATUS_CHANGED,
        table_name: 'deposits',
        record_id: deposit.id,
        old_value: { expiry_date: oldExpiryDate },
        new_value: {
          expiry_date: newExpiryISO,
          extended_days: days,
          deposit_code: deposit.deposit_code,
          customer_name: deposit.customer_name,
          product_name: deposit.product_name,
        },
        changed_by: user?.id || null,
      });
      toast({
        type: 'success',
        title: t('detail.extendExpirySuccess'),
        message: t('detail.extendedDays', { days }),
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
      received_by_name: receivedByName,
      qr_code_image_url: receiptSettings?.qr_code_image_url ?? null,
      line_oa_id: receiptSettings?.line_oa_id ?? null,
    };

    const copies = jobType === 'label' ? (deposit.remaining_qty || 1) : 1;

    const { error } = await supabase.from('print_queue').insert({
      store_id: currentStoreId,
      deposit_id: deposit.id,
      job_type: jobType,
      status: 'pending',
      copies,
      payload,
      requested_by: user.id,
    });

    if (error) {
      toast({ type: 'error', title: t('detail.errorPrint'), message: error.message });
    } else {
      toast({
        type: 'success',
        title: jobType === 'receipt' ? t('detail.printReceiptSent') : t('detail.printLabelSent'),
        message: t('detail.waitingPrinter'),
      });
    }

    setLoading(false);
  };

  const canBarConfirm = deposit.status === 'pending_confirm' && user && ['bar', 'manager', 'owner'].includes(user.role);
  const canRejectDeposit = deposit.status === 'pending_confirm' && user && ['bar', 'manager', 'owner'].includes(user.role);
  const canWithdraw = deposit.status === 'in_store' && deposit.remaining_qty > 0;
  const canMarkExpired = (deposit.status === 'in_store' || deposit.status === 'pending_confirm') && !deposit.is_vip;
  const canTransfer = deposit.status === 'expired';
  const canTransferToHq = deposit.status === 'expired';
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
          {t('detail.backToList')}
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
            {t('detail.expiringWarning', { days: expiryDays })}
          </p>
        </div>
      )}

      {/* Photo Gallery */}
      {(deposit.customer_photo_url || deposit.received_photo_url || deposit.confirm_photo_url || deposit.photo_url) && (
        <Card padding="none">
          <CardHeader title={t('detail.photos')} />
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {/* รูปหลัก (จากลูกค้า) — customer_photo_url preferred, photo_url as legacy fallback */}
              {(deposit.customer_photo_url || deposit.photo_url) && (
                <div className="space-y-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={deposit.customer_photo_url || deposit.photo_url!}
                      alt="Customer photo"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t('detail.photoCustomer')}</p>
                </div>
              )}
              {/* Show legacy photo_url separately only if both exist */}
              {deposit.customer_photo_url && deposit.photo_url && deposit.customer_photo_url !== deposit.photo_url && (
                <div className="space-y-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={deposit.photo_url}
                      alt="Additional photo"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t('detail.photoAdditional')}</p>
                </div>
              )}
              {deposit.received_photo_url && (
                <div className="space-y-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={deposit.received_photo_url}
                      alt="Received photo"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t('detail.photoReceived')}</p>
                </div>
              )}
              {deposit.confirm_photo_url && (
                <div className="space-y-2">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={deposit.confirm_photo_url}
                      alt="Confirmed photo"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t('detail.photoConfirm')}</p>
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
          <CardHeader title={t('detail.depositInfo')} />
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Hash className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('detail.depositCode')}</p>
                    <p className="font-mono font-medium text-gray-900 dark:text-white">{deposit.deposit_code}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('detail.customer')}</p>
                    <p className="font-medium text-gray-900 dark:text-white">{deposit.customer_name}</p>
                  </div>
                </div>
              </div>

              {deposit.customer_phone && (
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('detail.phone')}</p>
                    <p className="font-medium text-gray-900 dark:text-white">{deposit.customer_phone}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Wine className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('detail.product')}</p>
                    <p className="font-medium text-gray-900 dark:text-white">{deposit.product_name}</p>
                    {deposit.category && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{deposit.category}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('detail.quantity')}</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatNumber(deposit.remaining_qty)} / {formatNumber(deposit.quantity)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Remaining bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{t('detail.remaining')}</span>
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
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('detail.table')}</p>
                      <p className="font-medium text-gray-900 dark:text-white">{deposit.table_number}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('detail.depositDate')}</p>
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
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('detail.vipStatus')}</p>
                      <p className="font-medium text-amber-600 dark:text-amber-400">
                        {t('detail.noExpiryDate')}
                      </p>
                    </div>
                  </>
                ) : deposit.expiry_date ? (
                  <>
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t("detail.expiryDate")}</p>
                      <p className={cn(
                        'font-medium',
                        isExpiringSoon || isExpired
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-900 dark:text-white'
                      )}>
                        {formatThaiDate(deposit.expiry_date)}
                        {expiryDays !== null && expiryDays > 0 && (
                          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                            {t("detail.daysLeft", { days: expiryDays })}
                          </span>
                        )}
                        {isExpired && (
                          <span className="ml-1 text-xs text-red-500">{t("detail.expiredLabel")}</span>
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t("detail.expiryDate")}</p>
                      <p className="font-medium text-gray-400 dark:text-gray-500">{t("detail.unspecified")}</p>
                    </div>
                  </>
                )}
              </div>

              {deposit.notes && (
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("detail.notes")}</p>
                    <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                      {deposit.notes}
                    </p>
                  </div>
                </div>
              )}

              {/* Staff / Bar names */}
              {receivedByName && (
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("detail.receivedByStaff")}</p>
                    <p className="font-medium text-gray-900 dark:text-white">{receivedByName}</p>
                  </div>
                </div>
              )}
              {confirmedByName && (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("detail.confirmedByBar")}</p>
                    <p className="font-medium text-gray-900 dark:text-white">{confirmedByName}</p>
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
            <CardHeader title={t("detail.depositStatus")} />
            <CardContent>
              <div className="space-y-0">
                {statusTimelineKeys.map((step, index) => {
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
                        {index < statusTimelineKeys.length - 1 && (
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
                          {t(step.labelKey)}
                        </p>
                        {isCurrent && (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {t('detail.currentStatus')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Expired branch timeline */}
                {(deposit.status === 'expired' || deposit.status === 'transfer_pending' || deposit.status === 'transferred_out') && (
                  <div className="mt-1">
                    {expiredTimelineKeys.map((step, index) => {
                      const StepIcon = step.icon;
                      const expiredIndex = expiredTimelineKeys.findIndex((s) => s.key === deposit.status);
                      const isPast = index < expiredIndex;
                      const isCurrent = index === expiredIndex;

                      const colorMap: Record<string, { ring: string; bg: string; text: string; line: string }> = {
                        expired: {
                          ring: 'ring-red-500',
                          bg: 'bg-red-100 dark:bg-red-900/30',
                          text: 'text-red-600 dark:text-red-400',
                          line: 'bg-red-300 dark:bg-red-700',
                        },
                        transfer_pending: {
                          ring: 'ring-amber-500',
                          bg: 'bg-amber-100 dark:bg-amber-900/30',
                          text: 'text-amber-600 dark:text-amber-400',
                          line: 'bg-amber-300 dark:bg-amber-700',
                        },
                        transferred_out: {
                          ring: 'ring-blue-500',
                          bg: 'bg-blue-100 dark:bg-blue-900/30',
                          text: 'text-blue-600 dark:text-blue-400',
                          line: 'bg-blue-300 dark:bg-blue-700',
                        },
                      };
                      const colors = colorMap[step.key] || colorMap.expired;

                      return (
                        <div key={step.key} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full',
                                isCurrent
                                  ? cn(colors.bg, 'ring-2', colors.ring)
                                  : isPast
                                    ? colors.bg
                                    : 'bg-gray-100 dark:bg-gray-700'
                              )}
                            >
                              <StepIcon
                                className={cn(
                                  'h-4 w-4',
                                  isCurrent || isPast
                                    ? colors.text
                                    : 'text-gray-400 dark:text-gray-500'
                                )}
                              />
                            </div>
                            {index < expiredTimelineKeys.length - 1 && (
                              <div
                                className={cn(
                                  'h-8 w-0.5',
                                  isPast
                                    ? colors.line
                                    : 'bg-gray-200 dark:bg-gray-700'
                                )}
                              />
                            )}
                          </div>
                          <div className="pb-8">
                            <p
                              className={cn(
                                'text-sm font-medium',
                                isCurrent || isPast
                                  ? colors.text
                                  : 'text-gray-400 dark:text-gray-500'
                              )}
                            >
                              {t(step.labelKey)}
                            </p>
                            {isCurrent && (
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {t('detail.currentStatus')}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* การดำเนินการ — consolidated action card */}
          {user && user.role !== 'customer' && (canBarConfirm || canRejectDeposit || canWithdraw || canMarkExpired || canTransferToHq || canExtendExpiry || canToggleVip) && (
            <Card padding="none">
              <CardHeader title={t("detail.actions")} />
              <CardContent>
                <div className="space-y-2">
                  {/* ยืนยันรับเข้าระบบ (Bar) */}
                  {canBarConfirm && (
                    <Button
                      className="min-h-[48px] w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
                      variant="primary"
                      icon={<ShieldCheck className="h-5 w-5" />}
                      onClick={() => {
                        setBarConfirmQty(String(deposit.quantity));
                        setShowBarConfirmModal(true);
                      }}
                    >
                      {t("detail.confirmReceive")}
                    </Button>
                  )}
                  {/* ปฏิเสธรับฝาก */}
                  {canRejectDeposit && (
                    <Button
                      className="min-h-[44px] w-full justify-center"
                      variant="outline"
                      icon={<XCircle className="h-4 w-4 text-red-500" />}
                      onClick={() => setShowRejectModal(true)}
                    >
                      {t("detail.rejectDeposit")}
                    </Button>
                  )}
                  {/* เบิกเหล้า */}
                  {canWithdraw && (
                    <Button
                      className="min-h-[44px] w-full justify-center"
                      variant="outline"
                      icon={<Minus className="h-4 w-4" />}
                      onClick={() => setShowWithdrawModal(true)}
                    >
                      {t("detail.withdraw")}
                    </Button>
                  )}
                  {/* เปลี่ยนเป็น VIP */}
                  {canToggleVip && (
                    <Button
                      className="min-h-[44px] w-full justify-center"
                      variant="outline"
                      icon={<Crown className="h-4 w-4" />}
                      onClick={handleToggleVip}
                      isLoading={isSubmitting}
                    >
                      {deposit.is_vip ? t("detail.cancelVip") : t("detail.setVip")}
                    </Button>
                  )}
                  {/* ขยายวันหมดอายุ */}
                  {canExtendExpiry && (
                    <Button
                      className="min-h-[44px] w-full justify-center"
                      variant="outline"
                      icon={<CalendarPlus className="h-4 w-4" />}
                      onClick={() => setShowExtendExpiryModal(true)}
                    >
                      {t("detail.extendExpiry")}
                    </Button>
                  )}
                  {/* ทำเครื่องหมายหมดอายุ */}
                  {canMarkExpired && (
                    <Button
                      className="min-h-[44px] w-full justify-center"
                      variant="outline"
                      icon={<AlertTriangle className="h-4 w-4" />}
                      onClick={() => setShowExpiryModal(true)}
                    >
                      {t("detail.markExpired")}
                    </Button>
                  )}
                  {/* โอนคลังกลาง (เฉพาะ expired) */}
                  {canTransferToHq && (
                    <Button
                      className="min-h-[48px] w-full justify-center bg-amber-600 hover:bg-amber-700 text-white"
                      variant="primary"
                      icon={<Warehouse className="h-5 w-5" />}
                      onClick={() => setShowTransferHqModal(true)}
                    >
                      {t("detail.transferToHQ")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Print Actions */}
          <Card padding="none">
            <CardHeader title={t("detail.printDocuments")} />
            <CardContent>
              <div className="space-y-2">
                <Button
                  className="min-h-[44px] w-full justify-center"
                  variant="outline"
                  icon={<Printer className="h-4 w-4" />}
                  onClick={() => { setPrintPreviewType('receipt'); setShowPrintPreview(true); }}
                >
                  {t("detail.printReceipt")}
                </Button>
                <Button
                  className="min-h-[44px] w-full justify-center"
                  variant="outline"
                  icon={<Tag className="h-4 w-4" />}
                  onClick={() => { setPrintPreviewType('label'); setShowPrintPreview(true); }}
                >
                  {t("detail.printLabel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Withdrawal History */}
      <Card padding="none">
        <CardHeader
          title={t("detail.withdrawHistory")}
          description={`${withdrawals.length} ${t("detail.entries")}`}
        />
        {isLoadingWithdrawals ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={History}
              title={t("detail.noWithdrawHistory")}
              description={t("detail.noWithdrawHistoryDesc")}
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {t("detail.withdrawUnits", { qty: formatNumber(w.actual_qty ?? w.requested_qty) })}
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
                      {t("detail.requestedQty")}: {formatNumber(w.requested_qty)}
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
        title={t("detail.withdrawTitle")}
        description={`${deposit.product_name} - ${t("detail.remaining")} ${formatNumber(deposit.remaining_qty)} ${t("detail.units")}`}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label={t("detail.withdrawQtyLabel")}
            type="number"
            value={withdrawQty}
            onChange={(e) => setWithdrawQty(e.target.value)}
            placeholder="0"
            hint={`${t("detail.max")} ${formatNumber(deposit.remaining_qty)} ${t("detail.units")}`}
            error={
              withdrawQty && parseFloat(withdrawQty) > deposit.remaining_qty
                ? t("detail.exceedsRemaining", { qty: formatNumber(deposit.remaining_qty) })
                : undefined
            }
          />
          <Textarea
            label={t("detail.notesLabel")}
            value={withdrawNotes}
            onChange={(e) => setWithdrawNotes(e.target.value)}
            placeholder={t("detail.notesPlaceholder")}
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
            {t("detail.cancelBtn")}
          </Button>
          <Button
            onClick={handleWithdrawal}
            isLoading={isSubmitting}
            disabled={!withdrawQty || parseFloat(withdrawQty) <= 0 || parseFloat(withdrawQty) > deposit.remaining_qty}
            icon={<Minus className="h-4 w-4" />}
          >
            {t("detail.confirmWithdraw")}
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
        title={t("detail.markExpiredTitle")}
        description={t("detail.markExpiredDesc")}
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="font-medium">{t("detail.warning")}</p>
            <p className="mt-1">
              {t("detail.markExpiredWarning")}
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
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t("detail.notifyCustomer")}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("detail.notifyCustomerDesc")}
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
            {t("detail.cancelBtn")}
          </Button>
          <Button
            variant="danger"
            onClick={handleMarkExpired}
            isLoading={isSubmitting}
            icon={<AlertTriangle className="h-4 w-4" />}
          >
            {t("detail.confirmExpired")}
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
        title={t("detail.transferTitle")}
        description={t("detail.transferDesc")}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.product")}</span>
                <span className="font-medium text-gray-900 dark:text-white">{deposit.product_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.customer")}</span>
                <span className="font-medium text-gray-900 dark:text-white">{deposit.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.remaining")}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatNumber(deposit.remaining_qty)} {t("detail.units")}
                </span>
              </div>
            </div>
          </div>
          <Textarea
            label={t("detail.transferNotesLabel")}
            value={transferNotes}
            onChange={(e) => setTransferNotes(e.target.value)}
            placeholder={t("detail.transferNotesPlaceholder")}
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
            {t("detail.cancelBtn")}
          </Button>
          <Button
            onClick={handleTransfer}
            isLoading={isSubmitting}
            icon={<ArrowRightLeft className="h-4 w-4" />}
          >
            {t("detail.confirmTransfer")}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Transfer to HQ Modal */}
      <Modal
        isOpen={showTransferHqModal}
        onClose={() => {
          setShowTransferHqModal(false);
          setTransferHqNotes('');
          setTransferHqPhoto(null);
        }}
        title={t("detail.transferToHQTitle")}
        description={t("detail.transferToHQDesc")}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.product")}</span>
                <span className="font-medium text-gray-900 dark:text-white">{deposit.product_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.customer")}</span>
                <span className="font-medium text-gray-900 dark:text-white">{deposit.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.remaining")}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatNumber(deposit.remaining_qty)} {t("detail.units")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.depositCode")}</span>
                <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{deposit.deposit_code}</span>
              </div>
            </div>
          </div>
          <PhotoUpload
            label={t("detail.photoRequired")}
            value={transferHqPhoto}
            onChange={setTransferHqPhoto}
            folder="transfer-photos"
          />
          <Textarea
            label={t("detail.notesLabel")}
            value={transferHqNotes}
            onChange={(e) => setTransferHqNotes(e.target.value)}
            placeholder={t("detail.notesOptionalPlaceholder")}
            rows={2}
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowTransferHqModal(false);
              setTransferHqNotes('');
              setTransferHqPhoto(null);
            }}
          >
            {t("detail.cancelBtn")}
          </Button>
          <Button
            onClick={handleTransferToHq}
            isLoading={isSubmitting}
            disabled={!transferHqPhoto}
            icon={<Warehouse className="h-4 w-4" />}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
          >
            {t("detail.confirmTransferHQ")}
          </Button>
        </ModalFooter>
        {!transferHqPhoto && (
          <p className="px-6 pb-4 text-center text-xs text-red-500">
            {t("detail.photoRequiredWarning")}
          </p>
        )}
      </Modal>

      {/* Reject Deposit Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setRejectReason('');
        }}
        title={t("detail.rejectDepositTitle")}
        description={`${deposit.product_name} — ${deposit.customer_name}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-400">
              {t("detail.rejectWarning")}
            </p>
          </div>
          <Textarea
            label={t("detail.rejectReasonLabel")}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("detail.rejectReasonPlaceholder")}
            rows={3}
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowRejectModal(false);
              setRejectReason('');
            }}
          >
            {t("detail.cancelBtn")}
          </Button>
          <Button
            onClick={handleRejectDeposit}
            isLoading={isSubmitting}
            disabled={!rejectReason.trim()}
            icon={<XCircle className="h-4 w-4" />}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {t("detail.confirmReject")}
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
        title={t("detail.extendExpiryTitle")}
        description={deposit.product_name}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.currentExpiry")}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {deposit.expiry_date ? formatThaiDate(deposit.expiry_date) : t('detail.unspecified')}
                </span>
              </div>
            </div>
          </div>
          <Input
            label={t("detail.extendDaysLabel")}
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
                : 't("detail.extendDaysHint")'
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
            {t("detail.cancelBtn")}
          </Button>
          <Button
            onClick={handleExtendExpiry}
            isLoading={isSubmitting}
            disabled={!extendDays || parseInt(extendDays) <= 0}
            icon={<CalendarPlus className="h-4 w-4" />}
          >
            {t("detail.confirmExtend")}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Print Preview Modal */}
      <Modal
        isOpen={showPrintPreview}
        onClose={() => setShowPrintPreview(false)}
        title={printPreviewType === 'receipt' ? t("detail.printReceiptTitle") : t("detail.printLabelTitle")}
        description={t("detail.printPreviewDesc")}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.depositCode")}</span>
                <span className="font-mono font-medium text-gray-900 dark:text-white">{deposit.deposit_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.customer")}</span>
                <span className="font-medium text-gray-900 dark:text-white">{deposit.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.product")}</span>
                <span className="font-medium text-gray-900 dark:text-white">{deposit.product_name}</span>
              </div>
              {deposit.category && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t("detail.category")}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{deposit.category}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t("detail.qtyRemaining")}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatNumber(deposit.quantity)} / {formatNumber(deposit.remaining_qty)}
                </span>
              </div>
              {deposit.expiry_date && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">วันหมดอายุ</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatThaiDate(deposit.expiry_date)}</span>
                </div>
              )}
              {receivedByName && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t("detail.receivedBy")}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{receivedByName}</span>
                </div>
              )}
            </div>
          </div>

          {printPreviewType === 'label' && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-center dark:border-indigo-800 dark:bg-indigo-900/20">
              <Tag className="mx-auto h-8 w-8 text-indigo-500" />
              <p className="mt-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                {t("detail.willPrintLabels", { count: deposit.remaining_qty || 1 })}
              </p>
              <p className="text-xs text-indigo-500 dark:text-indigo-400">
                {t("detail.onePerBottle")}
              </p>
            </div>
          )}
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowPrintPreview(false)}
          >
            {t("detail.cancelBtn")}
          </Button>
          <Button
            onClick={() => {
              setShowPrintPreview(false);
              handlePrint(printPreviewType);
            }}
            isLoading={printPreviewType === 'receipt' ? isPrintingReceipt : isPrintingLabel}
            icon={printPreviewType === 'receipt' ? <Printer className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
          >
            {t("detail.confirmPrint")}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Bar Confirm Modal */}
      <Modal
        isOpen={showBarConfirmModal}
        onClose={() => {
          setShowBarConfirmModal(false);
          setBarConfirmPercent('');
          setBarConfirmQty('');
          setBarConfirmPhoto(null);
        }}
        title={t("detail.barConfirmTitle")}
        description={`${deposit.deposit_code} — ${deposit.product_name} (${deposit.customer_name})`}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label={t("detail.qtyEditable")}
            type="number"
            value={barConfirmQty}
            onChange={(e) => setBarConfirmQty(e.target.value)}
            placeholder={String(deposit.quantity)}
            hint={`${t("detail.originalQty")}: ${formatNumber(deposit.quantity)}`}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("detail.remainingPercent")} <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={barConfirmPercent}
                onChange={(e) => setBarConfirmPercent(e.target.value)}
                placeholder={t("detail.percentPlaceholder")}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <span className="shrink-0 text-sm font-medium text-gray-500">%</span>
            </div>
            {barConfirmPercent && (parseFloat(barConfirmPercent) < 0 || parseFloat(barConfirmPercent) > 100) && (
              <p className="mt-1 text-xs text-red-500">{t("detail.errorPercentRange")}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("detail.confirmPhoto")} <span className="text-red-500">*</span>
            </label>
            <PhotoUpload
              value={barConfirmPhoto}
              onChange={setBarConfirmPhoto}
              folder="deposits"
              placeholder={t("detail.confirmPhotoPlaceholder")}
              required
            />
          </div>
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowBarConfirmModal(false);
              setBarConfirmPercent('');
              setBarConfirmQty('');
              setBarConfirmPhoto(null);
            }}
          >
            {t("detail.cancelBtn")}
          </Button>
          <Button
            onClick={handleBarConfirm}
            isLoading={isSubmitting}
            disabled={
              !barConfirmPercent ||
              isNaN(parseFloat(barConfirmPercent)) ||
              parseFloat(barConfirmPercent) < 0 ||
              parseFloat(barConfirmPercent) > 100 ||
              !barConfirmPhoto
            }
            icon={<ShieldCheck className="h-4 w-4" />}
          >
            {t("detail.confirmReceive")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
