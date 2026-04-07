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
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { notifyStaff } from '@/lib/notifications/client';
import { notifyChatWithdrawalCompleted, syncChatActionCardStatus } from '@/lib/chat/bot-client';

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

interface WithdrawItem {
  deposit: DepositForWithdraw;
  qty: string;
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
  const [activeTab, setActiveTab] = useState('completed');
  const [isLoading, setIsLoading] = useState(true);

  // Process withdrawal modal
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
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
    setManualWithdrawalType(blockedDayInfo?.blocked ? 'take_home' : 'in_store');
  };

  const toggleDeposit = (deposit: DepositForWithdraw) => {
    setWithdrawItems((prev) => {
      const exists = prev.find((w) => w.deposit.id === deposit.id);
      if (exists) return prev.filter((w) => w.deposit.id !== deposit.id);
      return [...prev, { deposit, qty: String(deposit.remaining_qty) }];
    });
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

    for (const item of withdrawItems) {
      const qty = parseFloat(item.qty);
      const dep = item.deposit;

      // Create withdrawal record (directly completed)
      const { error: withdrawalError } = await supabase.from('withdrawals').insert({
        deposit_id: dep.id,
        store_id: currentStoreId,
        line_user_id: dep.line_user_id,
        customer_name: dep.customer_name,
        product_name: dep.product_name,
        requested_qty: qty,
        actual_qty: qty,
        withdrawal_type: manualWithdrawalType,
        status: 'completed',
        processed_by: user.id,
        notes: manualNotes.trim() || null,
        photo_url: manualPhotoUrl,
      });

      if (withdrawalError) {
        toast({ type: 'error', title: t('loadError'), message: t('withdrawals.manual.processError', { product: dep.product_name }) });
        setIsManualSubmitting(false);
        return;
      }

      // Update deposit remaining quantity
      const newRemaining = Math.max(0, dep.remaining_qty - qty);
      const newPercent = dep.quantity > 0 ? (newRemaining / dep.quantity) * 100 : 0;
      const newStatus = newRemaining <= 0 ? 'withdrawn' : 'in_store';

      await supabase
        .from('deposits')
        .update({
          remaining_qty: newRemaining,
          remaining_percent: newPercent,
          status: newStatus,
        })
        .eq('id', dep.id);

      // Send chat notification per item
      notifyChatWithdrawalCompleted(currentStoreId, {
        customer_name: dep.customer_name,
        product_name: dep.product_name,
        actual_qty: qty,
        processed_by_name: user.displayName || user.username || 'พนักงาน',
      });

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
    toast({ type: 'success', title: t('withdrawals.manual.successTitle'), message: t('withdrawals.manual.successMessage', { count: withdrawItems.length, summary }) });

    // Notify other staff (single notification for batch)
    notifyStaff({
      storeId: currentStoreId,
      type: 'withdrawal_request',
      title: t('withdrawals.manual.notifyTitle'),
      body: t('withdrawals.manual.notifyBody', { count: withdrawItems.length, summary }),
      data: {},
      excludeUserId: user.id,
    });

    setIsManualSubmitting(false);
    setShowManualModal(false);
    loadWithdrawals();
  };

  const openProcessModal = (withdrawal: Withdrawal, action: 'complete' | 'reject') => {
    setSelectedWithdrawal(withdrawal);
    setProcessAction(action);
    setActualQty(action === 'complete' ? String(withdrawal.requested_qty) : '');
    setProcessNotes('');
    setWithdrawalPhotoUrl(null);
    setShowProcessModal(true);
  };

  const handleProcess = async () => {
    if (!selectedWithdrawal || !user) return;
    setIsSubmitting(true);
    const supabase = createClient();

    if (processAction === 'complete') {
      const qty = parseFloat(actualQty);
      if (isNaN(qty) || qty <= 0) {
        toast({ type: 'error', title: t('withdrawals.invalidQty') });
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
          photo_url: withdrawalPhotoUrl,
        })
        .eq('id', selectedWithdrawal.id);

      if (withdrawalError) {
        toast({ type: 'error', title: t('loadError'), message: t('withdrawals.processError') });
        setIsSubmitting(false);
        return;
      }

      // Update deposit remaining quantity
      const { data: deposit } = await supabase
        .from('deposits')
        .select('remaining_qty, quantity, deposit_code')
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

      toast({ type: 'success', title: t('withdrawals.processSuccess'), message: t('withdrawals.processSuccessMessage', { qty }) });

      // ส่ง system message เข้าห้องแชทสาขา
      notifyChatWithdrawalCompleted(currentStoreId!, {
        customer_name: selectedWithdrawal.customer_name,
        product_name: selectedWithdrawal.product_name,
        actual_qty: qty,
        processed_by_name: user.displayName || user.username || 'พนักงาน',
      });

      // Sync action card ในแชทให้เป็น completed
      if (deposit?.deposit_code) {
        syncChatActionCardStatus({
          storeId: currentStoreId!,
          referenceId: deposit.deposit_code,
          actionType: 'withdrawal_claim',
          newStatus: 'completed',
          completedBy: user.id,
          completedByName: user.displayName || user.username || 'พนักงาน',
        });
      }

      // Notify bar staff about the completed withdrawal
      notifyStaff({
        storeId: currentStoreId!,
        type: 'withdrawal_request',
        title: 'มีคำขอเบิกเหล้า',
        body: `${selectedWithdrawal.customer_name} ขอเบิก ${selectedWithdrawal.product_name} x${qty}`,
        data: { withdrawal_id: selectedWithdrawal.id },
        excludeUserId: user?.id,
      });

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_COMPLETED,
        table_name: 'withdrawals',
        record_id: selectedWithdrawal.id,
        new_value: {
          customer_name: selectedWithdrawal.customer_name,
          product_name: selectedWithdrawal.product_name,
          actual_qty: qty,
        },
        changed_by: user?.id || null,
      });
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
        toast({ type: 'error', title: t('loadError'), message: t('withdrawals.rejectError') });
        setIsSubmitting(false);
        return;
      }

      // Reset deposit status back to in_store if it was pending_withdrawal
      const { data: rejectedDeposit } = await supabase
        .from('deposits')
        .select('deposit_code')
        .eq('id', selectedWithdrawal.deposit_id)
        .single();

      await supabase
        .from('deposits')
        .update({ status: 'in_store' })
        .eq('id', selectedWithdrawal.deposit_id)
        .eq('status', 'pending_withdrawal');

      toast({ type: 'warning', title: t('withdrawals.rejectSuccess') });

      // Sync action card ในแชทให้เป็น rejected
      if (rejectedDeposit?.deposit_code && currentStoreId) {
        syncChatActionCardStatus({
          storeId: currentStoreId,
          referenceId: rejectedDeposit.deposit_code,
          actionType: 'withdrawal_claim',
          newStatus: 'rejected',
        });
      }

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.WITHDRAWAL_REJECTED,
        table_name: 'withdrawals',
        record_id: selectedWithdrawal.id,
        new_value: {
          customer_name: selectedWithdrawal.customer_name,
          product_name: selectedWithdrawal.product_name,
          reason: processNotes || null,
        },
        changed_by: user?.id || null,
      });
    }

    setIsSubmitting(false);
    setShowProcessModal(false);
    setSelectedWithdrawal(null);
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
          {filteredWithdrawals.map((withdrawal) => {
            const isPending = withdrawal.status === 'pending' || withdrawal.status === 'approved';
            const isExpanded = isPending || expandedIds.has(withdrawal.id);

            return (
              <Card key={withdrawal.id} padding="none">
                {/* Compact header — always visible, clickable for non-pending */}
                <div
                  className={cn(
                    'flex items-center gap-3 p-4 sm:p-5',
                    !isPending && 'cursor-pointer select-none',
                    isExpanded && !isPending && 'border-b border-gray-100 dark:border-gray-800'
                  )}
                  onClick={!isPending ? () => toggleExpand(withdrawal.id) : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                        {withdrawal.product_name}
                      </h3>
                      <Badge variant={statusVariantMap[withdrawal.status] || 'default'}>
                        {WITHDRAWAL_STATUS_LABELS[withdrawal.status] || withdrawal.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {withdrawal.customer_name} · x{formatNumber(withdrawal.requested_qty)} · {formatThaiDateTime(withdrawal.created_at)}
                      {withdrawal.withdrawal_type === 'take_home' && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          <Home className="h-2.5 w-2.5" /> {t('withdrawals.takeHome')}
                        </span>
                      )}
                    </p>
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

                {/* Expanded details */}
                {isExpanded && (
                  <div className="p-4 pt-0 sm:p-5 sm:pt-0">
                    {/* Details Grid */}
                    <div className="mb-4 mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.customerLabel')}</span>
                        <p className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
                          <User className="h-3.5 w-3.5 text-gray-400" />
                          {withdrawal.customer_name}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.requestedQty')}</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {formatNumber(withdrawal.requested_qty)}
                        </p>
                      </div>
                      {withdrawal.actual_qty !== null && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.actualQty')}</span>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {formatNumber(withdrawal.actual_qty)}
                          </p>
                        </div>
                      )}
                      {withdrawal.table_number && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.tableLabel')}</span>
                          <p className="font-medium text-gray-900 dark:text-white">{withdrawal.table_number}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.dateLabel')}</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {formatThaiDateTime(withdrawal.created_at)}
                        </p>
                      </div>
                      {withdrawal.processed_by_name && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.processedBy')}</span>
                          <p className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            {withdrawal.processed_by_name}
                          </p>
                        </div>
                      )}
                    </div>

                    {withdrawal.photo_url && (
                      <div className="mb-3">
                        <img
                          src={withdrawal.photo_url}
                          alt={t('withdrawals.photoAlt')}
                          className="h-20 w-20 rounded-lg object-cover"
                        />
                      </div>
                    )}

                    {withdrawal.notes && (
                      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                        {t('withdrawals.notesPrefix', { notes: withdrawal.notes })}
                      </p>
                    )}

                    {/* Action Buttons for Pending */}
                    {isPending && (
                      <div className="flex gap-2">
                        <Button
                          className="min-h-[44px] flex-1"
                          variant="danger"
                          icon={<XCircle className="h-4 w-4" />}
                          onClick={() => openProcessModal(withdrawal, 'reject')}
                        >
                          {t('withdrawals.rejectButton')}
                        </Button>
                        <Button
                          className="min-h-[44px] flex-1"
                          variant="primary"
                          icon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => openProcessModal(withdrawal, 'complete')}
                        >
                          {t('withdrawals.processButton')}
                        </Button>
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
          setSelectedWithdrawal(null);
        }}
        title={processAction === 'complete' ? t('withdrawals.processTitle') : t('withdrawals.rejectTitle')}
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
                  <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.productLabel')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedWithdrawal.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.customerLabel')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedWithdrawal.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('withdrawals.requestedQty')}</span>
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
              setSelectedWithdrawal(null);
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
