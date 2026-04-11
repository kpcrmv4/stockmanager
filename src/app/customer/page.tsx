'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCustomerAuth } from './_components/customer-provider';
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
}

export default function CustomerPage() {
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

  // ------------------------------------------------------------------
  // Auth credentials สำหรับเรียก API
  // ------------------------------------------------------------------

  const getAuthPayload = useCallback(() => {
    if (mode === 'token') {
      const token = searchParams.get('token');
      return { token };
    }
    // LIFF mode: ใช้ cached access token
    return { accessToken: sessionStorage.getItem('liff_access_token') };
  }, [mode, searchParams]);

  // ------------------------------------------------------------------
  // Load deposits — scoped to the current store
  //
  // IMPORTANT: always pass storeId/storeCode so the API filters to the
  // branch the customer tapped from. No cross-branch leakage.
  // ------------------------------------------------------------------

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
    if (lineUserId) {
      loadDeposits();
    } else if (!authLoading) {
      setIsLoading(false);
    }
  }, [lineUserId, authLoading, loadDeposits]);

  // ------------------------------------------------------------------
  // Map raw deposit data to DepositItem
  // ------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapDeposits(raw: any[]): DepositItem[] {
    return raw.map((d) => ({
      id: d.id,
      code: d.deposit_code,
      productName: d.product_name,
      remainingPercent: d.remaining_percent ?? 0,
      remainingQty: d.remaining_qty ?? 0,
      expiryDate: d.expiry_date,
      status: d.status,
      storeName: d.store?.store_name || '',
      depositDate: d.created_at,
      storeId: d.store_id || null,
    }));
  }

  // ------------------------------------------------------------------
  // Request withdrawal
  // ------------------------------------------------------------------

  const handleRequestWithdrawal = async (deposit: DepositItem) => {
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
    } catch {
      setError(t('withdrawError'));
    } finally {
      setRequestingId(null);
    }
  };

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------

  const { pending, active } = useMemo(() => {
    const p: DepositItem[] = [];
    const a: DepositItem[] = [];
    for (const d of deposits) {
      if (d.status === 'pending_confirm') p.push(d);
      else a.push(d);
    }
    return { pending: p, active: a };
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

  // ------------------------------------------------------------------
  // Loading / Error states
  // ------------------------------------------------------------------

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
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
      <div className="flex min-h-[60vh] items-center justify-center px-6">
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

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="relative z-[5] px-4 pt-4">
      {/* Welcome card */}
      {displayName && (
        <div className="mb-4 rounded-2xl border border-[rgba(248,215,148,0.15)] bg-[rgba(14,0,0,0.5)] p-4 backdrop-blur-md">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[rgba(248,215,148,0.6)]">
            Welcome back
          </p>
          <h2 className="mt-0.5 text-base font-bold leading-tight text-[#F8D794]">
            {displayName}
          </h2>
          <p className="mt-1.5 text-[10px] text-[rgba(248,215,148,0.5)]">
            {t('activeItems', { count: active.length })}
          </p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pending section — deposits awaiting staff confirmation */}
      {pending.length > 0 && (
        <section className="mb-4">
          <div className="customer-section-header">
            <div className="customer-section-title">
              <Hourglass className="h-3 w-3" />
              <span>{t('pendingStaff')}</span>
            </div>
          </div>
          <div>
            {pending.map((d) => (
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

      {/* Search bar */}
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

      {/* My Bottles section */}
      <section className="pb-4">
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
                {/* Header row: name + status badge */}
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

                {/* White detail box — % remaining | bottles | days left */}
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

                {/* Action button */}
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
                    onClick={() => handleRequestWithdrawal(deposit)}
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
    </div>
  );
}
