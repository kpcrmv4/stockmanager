'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, Badge, Modal } from '@/components/ui';
import { useAppStore } from '@/stores/app-store';
import { Loader2, Eye, Image } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatThaiDate } from '@/lib/utils/format';

function formatCurrency(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PaymentRecord {
  id: string;
  ae_id: string | null;
  staff_id: string | null;
  type: string;
  month: string;
  total_entries: number;
  total_amount: number;
  slip_photo_url: string | null;
  status: string;
  notes: string | null;
  paid_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  ae_profile?: { id: string; name: string; nickname: string | null };
  staff_profile?: { id: string; display_name: string | null; username: string };
  paid_by_profile?: { id: string; display_name: string | null; username: string };
  entries?: Array<Record<string, unknown>>;
}

export function CommissionPaymentHistory() {
  const t = useTranslations('commission');
  const { currentStoreId } = useAppStore();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailModal, setDetailModal] = useState<PaymentRecord | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year });
      if (currentStoreId) params.set('store_id', currentStoreId);
      const res = await fetch(`/api/commission/payment?${params}`);
      if (res.ok) setPayments(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, currentStoreId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  async function openDetail(paymentId: string) {
    const res = await fetch(`/api/commission/payment/${paymentId}`);
    if (res.ok) setDetailModal(await res.json());
  }

  // Group by month
  const grouped = payments.reduce<Record<string, PaymentRecord[]>>((acc, p) => {
    const key = p.month;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const months = Object.keys(grouped).sort().reverse();

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.total_amount, 0);
  const totalCancelled = payments.filter(p => p.status === 'cancelled').reduce((s, p) => s + p.total_amount, 0);

  return (
    <div className="space-y-4">
      {/* Year picker + summary */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('paymentHistory.year')}</label>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
            <option key={y} value={y}>{y + 543}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t('paymentHistory.paidTotal')} {formatCurrency(totalPaid)} | {t('paymentHistory.cancelledTotal')} {formatCurrency(totalCancelled)}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : months.length === 0 ? (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">{t('paymentHistory.noHistory')}</p>
      ) : (
        months.map((month) => {
          const items = grouped[month];
          const [y, m] = month.split('-');
          const thaiMonth = new Date(Number(y), Number(m) - 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });

          return (
            <Card key={month}>
              <CardContent className="p-0">
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{thaiMonth}</p>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {items.map((p) => {
                    const isPaid = p.status === 'paid';
                    const name = p.type === 'ae_commission' ? p.ae_profile?.name : (p.staff_profile?.display_name || p.staff_profile?.username);

                    return (
                      <div key={p.id} className="flex items-center justify-between px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={isPaid ? 'success' : 'danger'} size="sm">
                              {isPaid ? t('paymentHistory.paid') : t('paymentHistory.cancelled')}
                            </Badge>
                            <Badge variant={p.type === 'ae_commission' ? 'warning' : 'default'} size="sm">
                              {p.type === 'ae_commission' ? 'AE' : 'Bottle'}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{name || '-'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {p.total_entries} {t('paymentHistory.entries')} | {formatThaiDate(p.paid_at)}
                            {p.paid_by_profile && ` | ${t('paymentHistory.by')} ${p.paid_by_profile.display_name || p.paid_by_profile.username}`}
                          </p>
                          {!isPaid && p.cancel_reason && (
                            <p className="text-xs text-red-500">{t('paymentHistory.reason')}: {p.cancel_reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 line-through'}`}>
                            {formatCurrency(p.total_amount)}
                          </span>
                          <button onClick={() => openDetail(p.id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Detail modal */}
      <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title={t('paymentHistory.paymentDetail')} size="lg">
        {detailModal && (
          <div className="space-y-3">
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
              <p className="text-sm"><span className="text-gray-500">{t('paymentHistory.name')}:</span> <span className="font-medium">{detailModal.type === 'ae_commission' ? detailModal.ae_profile?.name : detailModal.staff_profile?.display_name}</span></p>
              <p className="text-sm"><span className="text-gray-500">{t('paymentHistory.monthLabel')}:</span> {detailModal.month}</p>
              <p className="text-sm"><span className="text-gray-500">{t('paymentHistory.status')}:</span> <Badge variant={detailModal.status === 'paid' ? 'success' : 'danger'} size="sm">{detailModal.status === 'paid' ? t('paymentHistory.paid') : t('paymentHistory.cancelled')}</Badge></p>
              <p className="text-sm"><span className="text-gray-500">{t('paymentHistory.count')}:</span> {detailModal.total_entries} {t('paymentHistory.entries')}</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(detailModal.total_amount)}</p>
              {detailModal.notes && <p className="text-xs text-gray-500">{t('paymentHistory.notes')}: {detailModal.notes}</p>}
            </div>
            {detailModal.slip_photo_url && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">{t('paymentHistory.transferSlip')}</p>
                <img src={detailModal.slip_photo_url} alt="Slip" className="max-h-60 rounded-lg object-contain" />
              </div>
            )}
            {detailModal.entries && detailModal.entries.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">{t('paymentHistory.paidEntries')}</p>
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500"><th className="py-1 text-left">{t('paymentHistory.date')}</th><th className="py-1 text-left">{t('paymentHistory.receipt')}</th><th className="py-1 text-right">{t('paymentHistory.amount')}</th></tr></thead>
                  <tbody className="text-gray-700 dark:text-gray-300">
                    {detailModal.entries.map((e: Record<string, unknown>) => (
                      <tr key={e.id as string} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="py-1">{formatThaiDate(e.bill_date as string)}</td>
                        <td className="py-1">{(e.receipt_no as string) || '-'}</td>
                        <td className="py-1 text-right font-medium">{formatCurrency(Number(e.net_amount) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
