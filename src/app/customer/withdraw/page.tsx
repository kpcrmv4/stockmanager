'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { ArrowLeft, Package, Loader2, AlertCircle, Home, Wine } from 'lucide-react';

interface DepositInfo {
  id: string;
  deposit_code: string;
  product_name: string;
  remaining_qty: number;
  store_id: string;
  store?: { store_name: string };
}

interface BlockedDayInfo {
  blocked: boolean;
  calendarDay: string;
  blockedDays: string[];
}

function WithdrawContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const depositId = searchParams.get('depositId');
  const t = useTranslations('customer.withdraw');

  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestedQty, setRequestedQty] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [blockedInfo, setBlockedInfo] = useState<BlockedDayInfo | null>(null);
  const [withdrawalType, setWithdrawalType] = useState<'in_store' | 'take_home'>('in_store');

  useEffect(() => {
    if (depositId) loadDeposit(depositId);
    else setIsLoading(false);
  }, [depositId]);

  const loadDeposit = async (id: string) => {
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('deposits')
      .select('id, deposit_code, product_name, remaining_qty, store_id, store:stores(store_name)')
      .eq('id', id)
      .eq('status', 'in_store')
      .single();

    if (data) {
      setDeposit(data as unknown as DepositInfo);
      // Check if withdrawal is blocked today (ใช้วันปฏิทินจริง)
      const { data: settings } = await supabase
        .from('store_settings')
        .select('withdrawal_blocked_days')
        .eq('store_id', data.store_id)
        .single();

      const blockedDays = (settings?.withdrawal_blocked_days as string[] | null) ?? ['Fri', 'Sat'];

      // Use actual calendar day in Bangkok — no cutoff
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const calendarDay = dayNames[now.getDay()];
      const blocked = blockedDays.includes(calendarDay);

      setBlockedInfo({ blocked, calendarDay, blockedDays });
      if (blocked) setWithdrawalType('take_home');
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deposit || !requestedQty) return;

    const qty = parseFloat(requestedQty);
    if (qty <= 0 || qty > deposit.remaining_qty) {
      setError(t('errorQtyRange', { max: deposit.remaining_qty }));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError(t('errorLogin'));
      setIsSubmitting(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('line_user_id, display_name, username')
      .eq('id', user.id)
      .single();

    // On blocked days, only take_home is allowed
    if (blockedInfo?.blocked && withdrawalType !== 'take_home') {
      setError(t('errorBlockedDay'));
      setIsSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from('withdrawals').insert({
      deposit_id: deposit.id,
      store_id: deposit.store_id,
      line_user_id: profile?.line_user_id,
      customer_name: profile?.display_name || profile?.username || 'ลูกค้า',
      product_name: deposit.product_name,
      requested_qty: qty,
      table_number: tableNumber || null,
      notes: notes || null,
      withdrawal_type: withdrawalType,
      status: 'pending',
    });

    if (insertError) {
      setError(t('errorSubmit'));
    } else {
      await supabase
        .from('deposits')
        .update({ status: 'pending_withdrawal' })
        .eq('id', deposit.id);
      setSuccess(true);
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <Package className="h-8 w-8 text-[#06C755]" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{t('successTitle')}</h2>
        <p className="text-sm text-gray-500">{t('successSubtitle')}</p>
        <button
          onClick={() => router.push('/customer')}
          className="mt-2 rounded-full bg-[#06C755] px-8 py-2.5 text-sm font-semibold text-white active:bg-[#05a849]"
        >
          {t('goHome')}
        </button>
      </div>
    );
  }

  if (!deposit) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-gray-400">
        <Package className="h-12 w-12" />
        <p className="text-sm">{t('notFound')}</p>
        <button
          onClick={() => router.push('/customer')}
          className="rounded-full border border-gray-300 px-6 py-2 text-sm font-medium text-gray-600"
        >
          {t('goHome')}
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </button>

      <h2 className="text-lg font-bold text-gray-900">{t('title')}</h2>
      <p className="mt-0.5 text-sm text-gray-500">{deposit.deposit_code}</p>

      {/* Deposit Info */}
      <div className="mt-4 rounded-2xl bg-green-50 p-4">
        <p className="font-semibold text-gray-900">{deposit.product_name}</p>
        <p className="mt-1 text-sm text-gray-600">
          {t('remaining', { qty: formatNumber(deposit.remaining_qty), store: deposit.store?.store_name || '' })}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Blocked day warning */}
      {blockedInfo?.blocked && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {t('blockedDayTitle')}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                {t('blockedDaySubtitle')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Withdrawal type selector */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('withdrawalType')}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => !blockedInfo?.blocked && setWithdrawalType('in_store')}
              disabled={blockedInfo?.blocked}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-colors',
                withdrawalType === 'in_store'
                  ? 'border-[#06C755] bg-green-50 text-[#06C755]'
                  : 'border-gray-200 text-gray-500',
                blockedInfo?.blocked && 'cursor-not-allowed opacity-40',
              )}
            >
              <Wine className="h-4 w-4" />
              {t('inStore')}
            </button>
            <button
              type="button"
              onClick={() => setWithdrawalType('take_home')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-colors',
                withdrawalType === 'take_home'
                  ? 'border-[#06C755] bg-green-50 text-[#06C755]'
                  : 'border-gray-200 text-gray-500',
              )}
            >
              <Home className="h-4 w-4" />
              {t('takeHome')}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('quantity')}</label>
          <input
            type="number"
            value={requestedQty}
            onChange={(e) => setRequestedQty(e.target.value)}
            placeholder="0"
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
          <p className="mt-1 text-xs text-gray-400">{t('maxQty', { qty: formatNumber(deposit.remaining_qty) })}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('tableNumber')}</label>
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder={t('tablePlaceholder')}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('notes')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !requestedQty}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white disabled:opacity-60 active:bg-[#05a849]"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  );
}

export default function CustomerWithdrawPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
        </div>
      }
    >
      <WithdrawContent />
    </Suspense>
  );
}
