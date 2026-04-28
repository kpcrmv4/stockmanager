'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCustomerAuth } from './customer-provider';
import { formatNumber, daysUntil } from '@/lib/utils/format';
import {
  Search,
  Wine,
  Clock,
  Package,
  Loader2,
  AlertCircle,
  Hourglass,
  Calendar,
  CheckCircle2,
  X,
} from 'lucide-react';

interface BottleInfo {
  id: string;
  bottleNo: number;
  remainingPercent: number;
  status: string;
}

interface DepositItem {
  id: string;
  code: string;
  productName: string;
  remainingPercent: number;
  remainingQty: number;
  expiryDate: string | null;
  status: string;
  storeName: string;
  depositDate: string;
  storeId: string | null;
  tableNumber: string | null;
  notes: string | null;
  bottles: BottleInfo[];
}

export function MyBottlesView() {
  const {
    lineUserId,
    displayName,
    mode,
    isLoading: authLoading,
    error: authError,
    store,
  } = useCustomerAuth();
  const searchParams = useSearchParams();
  const t = useTranslations('customer.home');

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Withdrawal picker modal — only opens for multi-bottle deposits so
  // the customer can pick which specific bottles to withdraw, mirroring
  // the staff /deposit/withdrawals manual flow.
  const [withdrawModal, setWithdrawModal] = useState<{
    deposit: DepositItem;
    selected: Set<string>;
  } | null>(null);

  const getAuthPayload = useCallback(() => {
    if (mode === 'token') {
      const token = searchParams.get('token');
      return { token };
    }
    return { accessToken: sessionStorage.getItem('liff_access_token') };
  }, [mode, searchParams]);

  const loadDeposits = useCallback(async () => {
    if (!lineUserId) return;
    setIsLoading(true);

    try {
      const auth = getAuthPayload();
      let res: Response;

      if (auth.token) {
        const qs = new URLSearchParams({ token: auth.token });
        if (store.id) qs.set('storeId', store.id);
        else if (store.code) qs.set('storeCode', store.code);
        res = await fetch(`/api/customer/deposits?${qs.toString()}`);
      } else if (auth.accessToken) {
        res = await fetch('/api/customer/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: auth.accessToken,
            storeId: store.id ?? null,
            storeCode: store.code ?? null,
          }),
        });
      } else {
        setError(t('loadError'));
        setIsLoading(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setDeposits(mapDeposits(data.deposits));
      } else {
        setError(t('loadError'));
      }
    } catch {
      setError(t('loadError'));
    }

    setIsLoading(false);
  }, [lineUserId, getAuthPayload, t, store.id, store.code]);

  useEffect(() => {
    if (lineUserId) loadDeposits();
    else if (!authLoading) setIsLoading(false);
  }, [lineUserId, authLoading, loadDeposits]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapDeposits(raw: any[]): DepositItem[] {
    return raw.map((d) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawBottles = Array.isArray(d.bottles) ? (d.bottles as any[]) : [];
      const bottles: BottleInfo[] = rawBottles
        .map((b) => ({
          id: b.id,
          bottleNo: Number(b.bottle_no) || 0,
          remainingPercent: Number(b.remaining_percent ?? 0),
          status: b.status || '',
        }))
        .sort((a, b) => a.bottleNo - b.bottleNo);
      return {
        id: d.id,
        code: d.deposit_code,
        productName: d.product_name || '',
        remainingPercent: d.remaining_percent ?? 0,
        remainingQty: d.remaining_qty ?? 0,
        expiryDate: d.expiry_date,
        status: d.status,
        storeName: d.store?.store_name || '',
        depositDate: d.created_at,
        storeId: d.store_id || null,
        tableNumber: d.table_number || null,
        notes: d.notes || null,
        bottles,
      };
    });
  }

  // Bottles eligible for withdrawal — exclude consumed ones so the
  // customer can't pick a bottle the bar already drained.
  const availableBottles = (deposit: DepositItem): BottleInfo[] =>
    deposit.bottles.filter((b) => b.status !== 'consumed');

  const handleRequestWithdrawal = async (
    deposit: DepositItem,
    bottleIds?: string[],
  ) => {
    setRequestingId(deposit.id);
    setError(null);

    try {
      const auth = getAuthPayload();
      const res = await fetch('/api/customer/withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depositId: deposit.id,
          customerName: displayName || 'ลูกค้า',
          bottleIds: bottleIds && bottleIds.length > 0 ? bottleIds : undefined,
          token: auth.token || undefined,
          accessToken: auth.accessToken || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }

      setDeposits((prev) =>
        prev.map((d) =>
          d.id === deposit.id ? { ...d, status: 'pending_withdrawal' } : d,
        ),
      );
      setWithdrawModal(null);
    } catch {
      setError(t('withdrawError'));
    } finally {
      setRequestingId(null);
    }
  };

  /**
   * Single-bottle deposits go straight through; multi-bottle deposits
   * open a picker modal so the customer specifies qty + which bottle(s).
   */
  const handleWithdrawClick = (deposit: DepositItem) => {
    const bottles = availableBottles(deposit);
    if (bottles.length <= 1) {
      handleRequestWithdrawal(deposit);
      return;
    }
    setWithdrawModal({
      deposit,
      selected: new Set(bottles.map((b) => b.id)),
    });
  };

  // Three buckets:
  //   - pendingStaff: customer just submitted via LIFF, staff hasn't received yet
  //   - pendingConfirm: staff received, bar hasn't verified yet
  //   - active: in_store / pending_withdrawal — visible as "MY BOTTLES"
  const { pendingStaff, pendingConfirm, active } = useMemo(() => {
    const ps: DepositItem[] = [];
    const pc: DepositItem[] = [];
    const a: DepositItem[] = [];
    for (const d of deposits) {
      if (d.status === 'pending_staff') ps.push(d);
      else if (d.status === 'pending_confirm') pc.push(d);
      else a.push(d);
    }
    return { pendingStaff: ps, pendingConfirm: pc, active: a };
  }, [deposits]);

  const filteredActive = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (d) =>
        d.code.toLowerCase().includes(q) ||
        d.productName.toLowerCase().includes(q),
    );
  }, [active, searchQuery]);

  const getDaysLeftColor = (expiryDate: string | null) => {
    if (!expiryDate) return '#888888';
    const days = daysUntil(expiryDate);
    if (days <= 7) return '#EF4444';
    if (days <= 30) return '#D97706';
    return '#64090C';
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-[#F8D794]" />
          <p className="text-[11px] font-medium uppercase tracking-wider text-[rgba(248,215,148,0.6)]">
            {t('loading')}
          </p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-10 w-10 text-[#F8D794]" />
          <p className="text-xs text-[rgba(248,215,148,0.8)]">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="customer-btn-withdraw !w-auto px-5"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-6">
      {displayName && (
        <div className="mb-4 rounded-2xl border border-[rgba(248,215,148,0.15)] bg-[rgba(14,0,0,0.5)] p-4 backdrop-blur-md">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[rgba(248,215,148,0.6)]">
            {t('welcomeBack')}
          </p>
          <h2 className="mt-0.5 text-base font-bold leading-tight text-[#F8D794]">
            {displayName}
          </h2>
          <p className="mt-1.5 text-[10px] text-[rgba(248,215,148,0.5)]">
            {t('activeItems', { count: active.length + pendingStaff.length + pendingConfirm.length })}
          </p>
        </div>
      )}

      {error && (
        <div className="customer-error-banner mb-3">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stage 1: customer just submitted, waiting for staff to physically receive */}
      {pendingStaff.length > 0 && (
        <section className="mb-4">
          <div className="customer-section-header">
            <div className="customer-section-title">
              <Hourglass className="h-3 w-3" />
              <span>{t('pendingRequestsTitle')}</span>
            </div>
            <span className="customer-section-pill">
              {t('activeItems', { count: pendingStaff.length })}
            </span>
          </div>
          <div>
            {pendingStaff.map((d) => (
              <div
                key={d.id}
                className="customer-card customer-card-pending"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="customer-item-name truncate">
                      {d.productName || t('pendingRequestUnnamed')}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[rgba(248,215,148,0.55)]">
                      {t('requestSubmittedAt', {
                        time: new Date(d.depositDate).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      })}
                    </p>
                  </div>
                  <span className="customer-pending-badge ml-2 shrink-0 animate-pulse">
                    <Hourglass className="h-2.5 w-2.5" />
                    {t('pendingStaff')}
                  </span>
                </div>

                {(d.tableNumber || d.notes) && (
                  <div className="customer-detail-box">
                    {d.tableNumber && (
                      <div className="flex items-center justify-between">
                        <span className="customer-detail-label">{t('requestTableLabel')}</span>
                        <span className="text-[11px] font-bold text-[#F8D794]">
                          {d.tableNumber}
                        </span>
                      </div>
                    )}
                    {d.tableNumber && d.notes && <div className="customer-detail-separator" />}
                    {d.notes && (
                      <div>
                        <p className="customer-detail-label">{t('requestNotesLabel')}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-[rgba(248,215,148,0.8)]">
                          {d.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <p className="mt-2 text-[10px] leading-snug text-[rgba(248,215,148,0.55)]">
                  {t('pendingRequestHint')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stage 2: staff received, bar verifying */}
      {pendingConfirm.length > 0 && (
        <section className="mb-4">
          <div className="customer-section-header">
            <div className="customer-section-title">
              <Hourglass className="h-3 w-3" />
              <span>{t('pendingStaff')}</span>
            </div>
          </div>
          <div>
            {pendingConfirm.map((d) => (
              <div
                key={d.id}
                className="customer-card customer-card-pending flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="customer-item-name truncate">
                    {d.productName}
                  </p>
                  <span className="customer-item-code mt-1 inline-block">
                    {d.code}
                  </span>
                </div>
                <span className="customer-pending-badge ml-2 shrink-0 animate-pulse">
                  <Hourglass className="h-2.5 w-2.5" />
                  {t('pendingStaff')}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mb-3">
        <div className="customer-search">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="customer-search-btn"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="customer-search-btn"
              aria-label="Search"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <section>
        <div className="customer-section-header">
          <div className="customer-section-title">
            <Wine className="h-3 w-3" />
            <span>{t('myBottles')}</span>
          </div>
          <span className="customer-section-pill">
            {t('activeItems', { count: filteredActive.length })}
          </span>
        </div>

        {filteredActive.length === 0 ? (
          <div className="customer-empty">
            <div className="customer-empty-icon">
              <Wine className="h-7 w-7" />
            </div>
            <p className="customer-empty-text">
              {searchQuery ? t('noSearchResults') : t('noDeposits')}
            </p>
          </div>
        ) : (
          filteredActive.map((deposit) => {
            const isRequesting = requestingId === deposit.id;
            const isPendingWithdrawal =
              deposit.status === 'pending_withdrawal';
            const isExpired = deposit.status === 'expired';
            const canWithdraw =
              deposit.status === 'in_store' && !isRequesting;
            const days = deposit.expiryDate
              ? daysUntil(deposit.expiryDate)
              : null;
            const daysColor = getDaysLeftColor(deposit.expiryDate);

            return (
              <div key={deposit.id} className="customer-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="customer-item-name truncate">
                      {deposit.productName}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="customer-item-code">
                        {deposit.code}
                      </span>
                      {isPendingWithdrawal ? (
                        <span className="customer-status-badge badge-blue">
                          <Clock className="h-2.5 w-2.5" />
                          {t('pendingWithdrawal')}
                        </span>
                      ) : (
                        <span className="customer-status-badge badge-green">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          {t('inStore')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="customer-detail-box">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="customer-detail-label">{t('remaining')}</p>
                      <p className="customer-detail-value accent">
                        {deposit.remainingPercent}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="customer-detail-label">
                        {t('bottlesLabel')}
                      </p>
                      <p className="customer-detail-value dark">
                        {formatNumber(deposit.remainingQty)}
                      </p>
                    </div>
                  </div>

                  {availableBottles(deposit).length > 1 && (
                    <>
                      <div className="customer-detail-separator" />
                      <div className="flex flex-wrap gap-1.5">
                        {deposit.bottles.map((b) => {
                          const isConsumed = b.status === 'consumed';
                          return (
                            <span
                              key={b.id}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold"
                              style={{
                                borderColor: isConsumed
                                  ? 'rgba(255,255,255,0.08)'
                                  : 'rgba(248,215,148,0.25)',
                                background: isConsumed
                                  ? 'rgba(255,255,255,0.04)'
                                  : 'rgba(248,215,148,0.08)',
                                color: isConsumed
                                  ? 'rgba(255,255,255,0.35)'
                                  : '#F8D794',
                                textDecoration: isConsumed ? 'line-through' : 'none',
                              }}
                            >
                              <span>
                                #{b.bottleNo}/{deposit.bottles.length}
                              </span>
                              <span>
                                {isConsumed ? '—' : `${b.remainingPercent}%`}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div className="customer-detail-separator" />

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[10px] text-[#888]">
                      <Calendar className="h-3 w-3" />
                      {t('daysLeftLabel')}
                    </span>
                    <span
                      className="text-[10px] font-bold"
                      style={{ color: daysColor }}
                    >
                      {days === null
                        ? t('noExpiry')
                        : days <= 0
                          ? t('expired')
                          : days === 1
                            ? t('expiresTomorrow')
                            : t('expiresInDays', { days })}
                    </span>
                  </div>
                </div>

                {isPendingWithdrawal ? (
                  <div className="customer-btn-pending">
                    <Clock className="h-3.5 w-3.5" />
                    {t('pendingWithdrawal')}
                  </div>
                ) : isExpired ? (
                  <div className="customer-btn-expired">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t('expired')}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleWithdrawClick(deposit)}
                    disabled={!canWithdraw}
                    className="customer-btn-withdraw"
                  >
                    {isRequesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Package className="h-3.5 w-3.5" />
                    )}
                    {isRequesting ? t('requesting') : t('requestWithdrawal')}
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Bottle picker modal — multi-bottle deposits only. Customer
          taps which bottles to withdraw; submitting fires one
          withdrawal row per picked bottle so the bar can serve them
          individually. */}
      {withdrawModal && (() => {
        const { deposit, selected } = withdrawModal;
        const bottles = availableBottles(deposit);
        const isRequesting = requestingId === deposit.id;
        const toggle = (id: string) => {
          setWithdrawModal((prev) => {
            if (!prev) return prev;
            const next = new Set(prev.selected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { ...prev, selected: next };
          });
        };
        const submit = () => {
          const ids = Array.from(selected);
          if (ids.length === 0) return;
          handleRequestWithdrawal(deposit, ids);
        };
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-4 pt-12 backdrop-blur-sm sm:items-center"
            onClick={() => !isRequesting && setWithdrawModal(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-[rgba(248,215,148,0.2)] bg-[#0E0000] p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="customer-detail-label">{t('requestWithdrawal')}</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-[#F8D794]">
                    {deposit.productName}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[rgba(248,215,148,0.5)]">
                    {deposit.code}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWithdrawModal(null)}
                  className="rounded-full p-1 text-[rgba(248,215,148,0.6)] hover:bg-[rgba(248,215,148,0.1)]"
                  disabled={isRequesting}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-2 text-[10px] uppercase tracking-wider text-[rgba(248,215,148,0.6)]">
                {t('bottlesLabel')} ({selected.size}/{bottles.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {bottles.map((b) => {
                  const isSelected = selected.has(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={isRequesting}
                      onClick={() => toggle(b.id)}
                      className="flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-[11px] transition-colors"
                      style={{
                        borderColor: isSelected
                          ? '#F8D794'
                          : 'rgba(248,215,148,0.15)',
                        background: isSelected
                          ? 'rgba(248,215,148,0.18)'
                          : 'rgba(20,0,0,0.6)',
                        color: isSelected ? '#F8D794' : 'rgba(248,215,148,0.55)',
                      }}
                    >
                      <span className="font-bold">
                        #{b.bottleNo}/{deposit.bottles.length}
                      </span>
                      <span className="text-[10px]">
                        {b.remainingPercent}%
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setWithdrawModal(null)}
                  disabled={isRequesting}
                  className="flex-1 rounded-lg border border-[rgba(248,215,148,0.15)] py-2 text-xs font-semibold text-[rgba(248,215,148,0.7)] hover:bg-[rgba(248,215,148,0.08)]"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isRequesting || selected.size === 0}
                  className="customer-btn-withdraw !mt-0 flex-1 disabled:opacity-50"
                >
                  {isRequesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Package className="h-3.5 w-3.5" />
                  )}
                  {isRequesting ? t('requesting') : t('confirm')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
