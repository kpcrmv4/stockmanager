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
  deposit_code?: string;
  store_name?: string;
}

export function HistoryView() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const t = useTranslations('customer.history');
  const { lineUserId, isLoading: authLoading } = useCustomerAuth();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const withdrawalStatusMap: Record<string, { label: string; tone: string }> = {
    pending: { label: t('statusPending'), tone: 'badge-amber' },
    approved: { label: t('statusApproved'), tone: 'badge-green' },
    completed: { label: t('statusCompleted'), tone: 'badge-green' },
    rejected: { label: t('statusRejected'), tone: 'badge-red' },
  };

  const loadHistory = useCallback(async () => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    const supabase = createClient();

    // Try Supabase auth first; fall back to LIFF/token API.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: deposits } = await supabase
        .from('deposits')
        .select(
          'id, deposit_code, product_name, quantity, status, created_at, store:stores(store_name)',
        )
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      const { data: profile } = await supabase
        .from('profiles')
        .select('line_user_id')
        .eq('id', user.id)
        .single();

      let withdrawals: Array<Record<string, unknown>> = [];
      if (profile?.line_user_id) {
        const { data } = await supabase
          .from('withdrawals')
          .select('id, product_name, requested_qty, status, created_at')
          .eq('line_user_id', profile.line_user_id)
          .order('created_at', { ascending: false })
          .limit(50);
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
        })),
        ...withdrawals.map((w) => ({
          id: w.id as string,
          type: 'withdrawal' as const,
          product_name: w.product_name as string,
          quantity: w.requested_qty as number,
          status: w.status as string,
          created_at: w.created_at as string,
        })),
      ];

      items.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setHistory(items);
      setIsLoading(false);
      return;
    }

    // Fall back to LIFF / token API. /api/customer/history returns BOTH
    // deposits and withdrawals — the deposits endpoint alone misses
    // bar-approved withdrawals so the History tab looked stuck on
    // "deposit only" rows.
    if (lineUserId) {
      try {
        const accessToken =
          typeof window !== 'undefined'
            ? sessionStorage.getItem('liff_access_token')
            : null;

        let res: Response | null = null;
        if (token) {
          res = await fetch(
            `/api/customer/history?token=${encodeURIComponent(token)}`,
          );
        } else if (accessToken) {
          res = await fetch('/api/customer/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken }),
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
            })),
            ...withdrawalRows.map((w) => ({
              id: w.id as string,
              type: 'withdrawal' as const,
              product_name: w.product_name as string,
              quantity: (w.actual_qty as number) ?? (w.requested_qty as number) ?? 0,
              status: w.status as string,
              created_at: w.created_at as string,
            })),
          ];
          items.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
          setHistory(items);
        }
      } catch {
        // silent fail
      }
    }

    setIsLoading(false);
  }, [lineUserId, token]);

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
                    {item.type === 'deposit' ? (
                      <span className="customer-status-badge badge-green shrink-0">
                        {t('deposit')}
                      </span>
                    ) : wStatus ? (
                      <span className="customer-status-badge badge-blue shrink-0">
                        {wStatus.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10px] text-[rgba(248,215,148,0.55)]">
                    {t('quantity', { qty: formatNumber(item.quantity) })}
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
