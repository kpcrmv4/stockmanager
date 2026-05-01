'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatThaiDateTime, formatNumber } from '@/lib/utils/format';
import {
  History,
  Wine,
  ArrowDownCircle,
  Loader2,
} from 'lucide-react';
import { useCustomerAuth } from './customer-provider';
import { BottleLoader } from './bottle-loader';

interface HistoryItem {
  id: string;
  type: 'deposit' | 'withdrawal';
  product_name: string;
  quantity: number;
  status: string;
  created_at: string;
  /** DEP-XXX code — for deposits this is their own code; for withdrawals
   *  it's the related deposit's code (joined server-side). Always shown
   *  in the row so the customer can correlate the two sides. */
  deposit_code?: string;
  store_name?: string;
  /** Deposit-only: notes string lets us detect who cancelled — staff
   *  rejects append "ปฏิเสธ" / "ปฏิเสธโดย Staff", customer cancels via
   *  LIFF append "ลูกค้ายกเลิกผ่าน LIFF". Used to label the cancel
   *  badge correctly in the history row. */
  notes?: string | null;
  /** Withdrawal-only: the bottle slot the row targeted (1..N). Together
   *  with bottle_total it renders as "ขวดที่ 2/3". */
  bottle_no?: number | null;
  bottle_total?: number | null;
}

export function HistoryView() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const t = useTranslations('customer.history');
  const { lineUserId, isLoading: authLoading, store } = useCustomerAuth();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const withdrawalStatusMap: Record<string, { label: string; tone: string }> = {
    pending: { label: t('statusPending'), tone: 'badge-amber' },
    approved: { label: t('statusApproved'), tone: 'badge-green' },
    completed: { label: t('statusCompleted'), tone: 'badge-green' },
    rejected: { label: t('statusRejected'), tone: 'badge-red' },
  };

  // Customer-facing outcome chip for deposits. The interesting one is
  // 'cancelled' — it's the only state where we want to surface WHO
  // cancelled (staff vs customer) so the customer doesn't think their
  // request just vanished. Other terminal states use neutral labels.
  const getDepositStatus = (
    status: string,
    notes: string | null,
  ): { label: string; tone: string } | null => {
    if (status === 'cancelled') {
      const byCustomer = !!notes && /ลูกค้ายกเลิก/i.test(notes);
      return byCustomer
        ? { label: t('depositCancelledByCustomer'), tone: 'badge-red' }
        : { label: t('depositCancelledByStaff'), tone: 'badge-red' };
    }
    // From the customer's perspective, an HQ transfer is functionally
    // the same as expiry — the bottle is no longer at the store they
    // can withdraw from. Collapse both into the same "expired" badge so
    // the LIFF view doesn't expose internal logistics ("โอนคลังกลาง").
    if (status === 'expired' || status === 'transferred_out')
      return { label: t('depositExpired'), tone: 'badge-amber' };
    if (status === 'withdrawn') return { label: t('depositWithdrawn'), tone: 'badge-green' };
    return null;
  };

  const loadHistory = useCallback(async () => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    // Prefer the LIFF / token path whenever we have a lineUserId. The
    // Supabase-auth fallback used to run first, but on a desktop browser
    // where the user is also logged in as admin (sharing the same
    // domain), Supabase returns the admin user, the deposits query
    // (filtered by customer_id) returns empty, and the function
    // early-returns — never falling through to LIFF. Reorder so LIFF
    // wins when a LINE identity is present.
    if (lineUserId) {
      try {
        const accessToken =
          typeof window !== 'undefined'
            ? sessionStorage.getItem('liff_access_token')
            : null;

        // Scope to the store the customer arrived from (LIFF URL ?store=CODE
        // or resolved store id). Without this the LIFF history would show
        // every branch's deposits for the same LINE user — confusing and
        // wrong: the customer is only "at" one store via this entry point.
        const storeQs = store.id
          ? `&storeId=${encodeURIComponent(store.id)}`
          : store.code
          ? `&storeCode=${encodeURIComponent(store.code)}`
          : '';

        let res: Response | null = null;
        if (token) {
          res = await fetch(
            `/api/customer/history?token=${encodeURIComponent(token)}${storeQs}`,
          );
        } else if (accessToken) {
          res = await fetch('/api/customer/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken,
              storeId: store.id ?? null,
              storeCode: store.code ?? null,
            }),
          });
        }

        if (res && res.ok) {
          const data = await res.json();
          const depositRows = (data.deposits || []) as Array<Record<string, unknown>>;
          const withdrawalRows = (data.withdrawals || []) as Array<Record<string, unknown>>;
          const items: HistoryItem[] = [
            ...depositRows.map((d) => ({
              id: d.id as string,
              type: 'deposit' as const,
              product_name: d.product_name as string,
              quantity: (d.quantity as number) ?? 0,
              status: d.status as string,
              created_at: d.created_at as string,
              deposit_code: d.deposit_code as string,
              store_name: (d.store as { store_name: string } | null)?.store_name,
              notes: (d.notes as string) ?? null,
            })),
            ...withdrawalRows.map((w) => {
              const dep = w.deposit as { deposit_code?: string; quantity?: number } | null;
              const bot = w.bottle as { bottle_no?: number } | null;
              return {
                id: w.id as string,
                type: 'withdrawal' as const,
                product_name: w.product_name as string,
                quantity: (w.actual_qty as number) ?? (w.requested_qty as number) ?? 0,
                status: w.status as string,
                created_at: w.created_at as string,
                deposit_code: dep?.deposit_code,
                bottle_no: bot?.bottle_no ?? null,
                bottle_total: dep?.quantity != null ? Number(dep.quantity) : null,
              };
            }),
          ];
          items.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
          setHistory(items);
          setIsLoading(false);
          return;
        }
      } catch {
        // silent fail — fall through to Supabase auth attempt below
      }
    }

    // Fallback: Supabase auth (used when this page is visited by a
    // logged-in customer from a non-LIFF context — rare).
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      let depositsQ = supabase
        .from('deposits')
        .select(
          'id, deposit_code, product_name, quantity, status, notes, created_at, store:stores(store_name)',
        )
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (store.id) depositsQ = depositsQ.eq('store_id', store.id);
      const { data: deposits } = await depositsQ;

      const { data: profile } = await supabase
        .from('profiles')
        .select('line_user_id')
        .eq('id', user.id)
        .single();

      let withdrawals: Array<Record<string, unknown>> = [];
      if (profile?.line_user_id) {
        let wdQ = supabase
          .from('withdrawals')
          .select('id, product_name, requested_qty, actual_qty, status, created_at, deposit:deposits(deposit_code, quantity), bottle:deposit_bottles(bottle_no)')
          .eq('line_user_id', profile.line_user_id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (store.id) wdQ = wdQ.eq('store_id', store.id);
        const { data } = await wdQ;
        if (data) withdrawals = data;
      }

      const items: HistoryItem[] = [
        ...(deposits || []).map((d: Record<string, unknown>) => ({
          id: d.id as string,
          type: 'deposit' as const,
          product_name: d.product_name as string,
          quantity: d.quantity as number,
          status: d.status as string,
          created_at: d.created_at as string,
          deposit_code: d.deposit_code as string,
          store_name: (d.store as { store_name: string })?.store_name,
          notes: (d.notes as string) ?? null,
        })),
        ...withdrawals.map((w) => {
          const dep = w.deposit as { deposit_code?: string; quantity?: number } | null;
          const bot = w.bottle as { bottle_no?: number } | null;
          return {
            id: w.id as string,
            type: 'withdrawal' as const,
            product_name: w.product_name as string,
            quantity: (w.actual_qty as number) ?? (w.requested_qty as number) ?? 0,
            status: w.status as string,
            created_at: w.created_at as string,
            deposit_code: dep?.deposit_code,
            bottle_no: bot?.bottle_no ?? null,
            bottle_total: dep?.quantity != null ? Number(dep.quantity) : null,
          };
        }),
      ];

      items.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setHistory(items);
    }

    setIsLoading(false);
  }, [lineUserId, token, store.id, store.code]);

  useEffect(() => {
    if (lineUserId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadHistory();
    } else if (!authLoading) {
      setIsLoading(false);
    }
  }, [lineUserId, authLoading, loadHistory]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <BottleLoader label={t('loading')} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-6">
      <div className="mb-3">
        <h2 className="text-base font-bold text-[#F8D794]">{t('title')}</h2>
        <p className="mt-0.5 text-[11px] text-[rgba(248,215,148,0.6)]">
          {t('subtitle')}
        </p>
      </div>

      {history.length === 0 ? (
        <div className="customer-empty">
          <div className="customer-empty-icon">
            <History className="h-7 w-7" />
          </div>
          <p className="customer-empty-text">{t('noHistory')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((item) => {
            const wStatus = withdrawalStatusMap[item.status];
            const dStatus =
              item.type === 'deposit'
                ? getDepositStatus(item.status, item.notes ?? null)
                : null;
            const typeLabel = item.type === 'deposit' ? t('deposit') : t('withdraw');
            return (
              <div
                key={`${item.type}-${item.id}`}
                className="customer-history-row"
              >
                <div
                  className={`customer-history-icon ${
                    item.type === 'withdrawal' ? 'is-withdraw' : ''
                  }`}
                >
                  {item.type === 'deposit' ? (
                    <Wine className="h-4 w-4" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[12px] font-bold text-[#F8D794]">
                      {item.product_name}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* Explicit type chip — same shape across deposit
                          and withdrawal so the customer can spot the
                          difference at a glance. */}
                      <span
                        className={`customer-status-badge shrink-0 ${
                          item.type === 'deposit' ? 'badge-green' : 'badge-blue'
                        }`}
                      >
                        {typeLabel}
                      </span>
                      {/* Outcome chip — withdrawals show their lifecycle
                          state; deposits show terminal states (cancelled
                          /expired/withdrawn/transferred) so the customer
                          can tell at a glance what happened to a row,
                          including WHO cancelled when applicable. */}
                      {item.type === 'withdrawal' && wStatus && (
                        <span className={`customer-status-badge shrink-0 ${wStatus.tone}`}>
                          {wStatus.label}
                        </span>
                      )}
                      {item.type === 'deposit' && dStatus && (
                        <span className={`customer-status-badge shrink-0 ${dStatus.tone}`}>
                          {dStatus.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-0.5 text-[10px] text-[rgba(248,215,148,0.55)]">
                    {t('quantity', { qty: formatNumber(item.quantity) })}
                    {/* On multi-bottle deposits the withdrawal targeted a
                        specific bottle slot — surface it as "ขวดที่ 2/3"
                        so the customer can map this row to the bottle
                        pills they see on MY BOTTLES. */}
                    {item.type === 'withdrawal' &&
                      item.bottle_no != null &&
                      item.bottle_total != null &&
                      item.bottle_total > 1 &&
                      ` • ${t('bottleNo', { no: item.bottle_no, total: item.bottle_total })}`}
                    {item.deposit_code ? ` • ${item.deposit_code}` : ''}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[rgba(248,215,148,0.4)]">
                    {formatThaiDateTime(item.created_at)}
                    {item.store_name ? ` • ${item.store_name}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
