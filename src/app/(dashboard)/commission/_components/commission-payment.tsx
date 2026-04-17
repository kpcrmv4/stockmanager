'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Card, CardHeader, CardContent, Badge, Modal, ModalFooter, toast, PhotoUpload, Textarea } from '@/components/ui';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2, Banknote, Clock, Search, CheckCircle2, XCircle, Eye, Image, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { useTranslations } from 'next-intl';
import { formatThaiDate } from '@/lib/utils/format';
import type { AEProfile } from '@/types/commission';

function formatCurrency(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function EntryRow({ e, t }: { e: any, t: any }) {
  return (
    <div className="flex items-center justify-between py-1.5 pl-8 pr-2 text-xs border-t border-gray-50 dark:border-gray-800/50">
      <div className="flex items-center gap-2">
        <Badge variant={e.payment_id ? 'success' : 'outline'} size="sm" className="scale-75 origin-left">
          {e.payment_id ? t('entryList.paid') : t('entryList.unpaid')}
        </Badge>
        <span className="text-gray-400">{formatThaiDate(e.bill_date)}</span>
        {e.receipt_no && <span className="text-gray-500 font-mono">#{e.receipt_no}</span>}
        {e.table_no && <span className="text-gray-400">{t('entryList.table')} {e.table_no}</span>}
      </div>
      <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(Number(e.net_amount))}</span>
    </div>
  );
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

interface SummaryData {
  ae_summary: Array<{
    ae_id: string;
    ae_name: string;
    ae_nickname: string | null;
    bank_name: string | null;
    bank_account_no: string | null;
    bank_account_name: string | null;
    entry_count: number;
    total_net: number;
    entries: Array<Record<string, unknown>>;
  }>;
  bottle_summary: Array<{
    staff_id: string;
    staff_name: string;
    entry_count: number;
    total_bottles: number;
    total_net: number;
    entries: Array<any>;
  }>;
  grand_total: {
    ae_total_net: number;
    bottle_total_net: number;
    total_payout: number;
  };
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
  paid_at: string;
  ae_profile?: { id: string; name: string; nickname: string | null };
  staff_profile?: { id: string; display_name: string | null; username: string };
  entries?: Array<Record<string, unknown>>;
}

export function CommissionPayment() {
  const t = useTranslations('commission');
  const { currentStoreId } = useAppStore();
  const { user } = useAuthStore();
  const [month, setMonth] = useState(getCurrentMonth());
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Payment form state
  const [selectedType, setSelectedType] = useState<'ae' | 'bottle' | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [slipPhoto, setSlipPhoto] = useState<string | null>(null);
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  // Detail modal
  const [detailModal, setDetailModal] = useState<PaymentRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  
  // Expansion state
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (currentStoreId) params.set('store_id', currentStoreId);

      const [summaryRes, paymentsRes] = await Promise.all([
        fetch(`/api/commission/summary?${params}`),
        fetch(`/api/commission/payment?${params}${currentStoreId ? `&store_id=${currentStoreId}` : ''}&month=${month}`),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (paymentsRes.ok) setPayments(await paymentsRes.json());
    } finally {
      setLoading(false);
    }
  }, [month, currentStoreId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calculate unpaid from summary minus active payments
  const paidAEIds = new Set(payments.filter(p => p.status === 'paid' && p.type === 'ae_commission').map(p => p.ae_id));
  const paidStaffIds = new Set(payments.filter(p => p.status === 'paid' && p.type === 'bottle_commission').map(p => p.staff_id));

  const unpaidAE = (summary?.ae_summary || []).filter(a => !paidAEIds.has(a.ae_id));
  const unpaidBottle = (summary?.bottle_summary || []).filter(b => !paidStaffIds.has(b.staff_id));

  const totalUnpaid = unpaidAE.reduce((s, a) => s + a.total_net, 0) + unpaidBottle.reduce((s, b) => s + b.total_net, 0);
  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.total_amount, 0);

  async function handlePay() {
    if (!currentStoreId || !selectedId) return;
    setPaying(true);
    try {
      const payload: Record<string, unknown> = {
        store_id: currentStoreId,
        type: selectedType === 'ae' ? 'ae_commission' : 'bottle_commission',
        month,
        slip_photo_url: slipPhoto,
        notes: payNotes,
      };
      if (selectedType === 'ae') payload.ae_id = selectedId;
      else payload.staff_id = selectedId;

      const res = await fetch('/api/commission/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const payment = await res.json();
        toast({ type: 'success', title: t('payment.paySuccess') });
        logAudit({ store_id: currentStoreId, action_type: AUDIT_ACTIONS.COMMISSION_PAYMENT_CREATED, table_name: 'commission_payments', record_id: payment.id, new_value: payload as Record<string, unknown>, changed_by: user?.id });
        setSelectedType(null); setSelectedId(''); setSlipPhoto(null); setPayNotes('');
        fetchData();
      } else {
        const err = await res.json();
        toast({ type: 'error', title: err.error || t('payment.error') });
      }
    } finally {
      setPaying(false);
    }
  }

  async function handleCancel() {
    if (!cancelModal) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/commission/payment/${cancelModal}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: cancelReason }),
      });
      if (res.ok) {
        toast({ type: 'success', title: t('payment.cancelSuccess') });
        logAudit({ store_id: currentStoreId, action_type: AUDIT_ACTIONS.COMMISSION_PAYMENT_CANCELLED, table_name: 'commission_payments', record_id: cancelModal, changed_by: user?.id });
        setCancelModal(null); setCancelReason('');
        fetchData();
      } else {
        toast({ type: 'error', title: t('payment.error') });
      }
    } finally {
      setCancelling(false);
    }
  }

  async function openDetail(paymentId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/commission/payment/${paymentId}`);
      if (res.ok) setDetailModal(await res.json());
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      {/* Month picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('payment.month')}</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                <Banknote className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.totalCommissionThisMonth')}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency((summary?.grand_total.total_payout || 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30">
                <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.unpaidBalance')}</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(totalUnpaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unpaid AE list */}
      {unpaidAE.length > 0 && (
        <Card>
          <CardHeader title={t('payment.unpaidAE')} />
          <CardContent>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {unpaidAE.map((ae) => {
                const isExpanded = !!expandedRows[`unpaid_ae_${ae.ae_id}`];
                return (
                  <div key={ae.ae_id} className="group">
                    <div className="flex items-center justify-between px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleExpand(`unpaid_ae_${ae.ae_id}`)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{ae.ae_name} {ae.ae_nickname ? `(${ae.ae_nickname})` : ''}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{ae.entry_count} {t('payment.bills')} | {ae.bank_name ? `${ae.bank_name} ${ae.bank_account_no}` : t('payment.noBankInfo')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatCurrency(ae.total_net)}</span>
                        <Button size="sm" onClick={() => { setSelectedType('ae'); setSelectedId(ae.ae_id); }}>{t('payment.pay')}</Button>
                      </div>
                    </div>
                    {isExpanded && ae.entries && (
                      <div className="bg-gray-50/50 dark:bg-gray-900/20 pb-1">
                        {ae.entries.map((e: any) => <EntryRow key={e.id} e={e} t={t} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unpaid Bottle list */}
      {unpaidBottle.length > 0 && (
        <Card>
          <CardHeader title={t('payment.unpaidBottle')} />
          <CardContent>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {unpaidBottle.map((b) => {
                const isExpanded = !!expandedRows[`unpaid_bottle_${b.staff_id}`];
                return (
                  <div key={b.staff_id} className="group">
                    <div className="flex items-center justify-between px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleExpand(`unpaid_bottle_${b.staff_id}`)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{b.staff_name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{b.total_bottles} {t('payment.bottles')} | {b.entry_count} {t('payment.entries')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-rose-600 dark:text-rose-400">{formatCurrency(b.total_net)}</span>
                        <Button size="sm" onClick={() => { setSelectedType('bottle'); setSelectedId(b.staff_id); }}>{t('payment.pay')}</Button>
                      </div>
                    </div>
                    {isExpanded && b.entries && (
                      <div className="bg-gray-50/50 dark:bg-gray-900/20 pb-1">
                        {b.entries.map((e: any) => <EntryRow key={e.id} e={e} t={t} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {unpaidAE.length === 0 && unpaidBottle.length === 0 && (
        <p className="py-4 text-center text-sm text-gray-400">{t('payment.noUnpaid')}</p>
      )}

      {/* Payment form modal */}
      {selectedType && selectedId && (
        <Card>
          <CardHeader title={`${t('payment.recordPayment')} — ${selectedType === 'ae' ? unpaidAE.find(a => a.ae_id === selectedId)?.ae_name : unpaidBottle.find(b => b.staff_id === selectedId)?.staff_name}`} />
          <CardContent className="space-y-3 p-4">
            {/* Show entries for this selection */}
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('payment.count')}: {selectedType === 'ae' ? unpaidAE.find(a => a.ae_id === selectedId)?.entry_count : unpaidBottle.find(b => b.staff_id === selectedId)?.entry_count} {t('payment.entries')}
              </p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {t('payment.payAmount')}: {formatCurrency(selectedType === 'ae' ? (unpaidAE.find(a => a.ae_id === selectedId)?.total_net || 0) : (unpaidBottle.find(b => b.staff_id === selectedId)?.total_net || 0))}
              </p>
            </div>
            <PhotoUpload value={slipPhoto} onChange={setSlipPhoto} folder="commission-slips" label={t('payment.attachSlip')} placeholder={t('payment.attachSlipPlaceholder')} />
            <Textarea label={t('payment.notes')} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={handlePay} disabled={paying}>
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {t('payment.recordPay')}
              </Button>
              <Button variant="ghost" onClick={() => { setSelectedType(null); setSelectedId(''); setSlipPhoto(null); setPayNotes(''); }}>{t('payment.cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paid this month */}
      {payments.filter(p => p.status === 'paid').length > 0 && (
        <Card>
          <CardHeader title={t('payment.paidThisMonth')} />
          <CardContent>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {payments.filter(p => p.status === 'paid').map((p) => (
                <div key={p.id} className="flex items-center justify-between px-2 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success" size="sm">{t('payment.paid')}</Badge>
                      <span className="text-xs text-gray-400">{formatThaiDate(p.paid_at)}</span>
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                      {p.type === 'ae_commission' ? p.ae_profile?.name : p.staff_profile?.display_name || p.staff_profile?.username}
                    </p>
                    <p className="text-xs text-gray-500">{p.total_entries} {t('payment.entries')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.total_amount)}</span>
                    <button onClick={() => openDetail(p.id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => setCancelModal(p.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"><XCircle className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail modal */}
      <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title={t('payment.paymentDetail')} size="lg">
        {detailModal && (
          <div className="space-y-3">
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
              <p className="text-sm"><span className="text-gray-500">{t('payment.name')}:</span> <span className="font-medium">{detailModal.type === 'ae_commission' ? detailModal.ae_profile?.name : detailModal.staff_profile?.display_name}</span></p>
              <p className="text-sm"><span className="text-gray-500">{t('payment.month')}:</span> {detailModal.month}</p>
              <p className="text-sm"><span className="text-gray-500">{t('payment.count')}:</span> {detailModal.total_entries} {t('payment.entries')}</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(detailModal.total_amount)}</p>
            </div>
            {detailModal.slip_photo_url && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">{t('payment.transferSlip')}</p>
                <img src={detailModal.slip_photo_url} alt="Slip" className="max-h-60 rounded-lg object-contain" />
              </div>
            )}
            {detailModal.entries && detailModal.entries.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">{t('payment.paidEntries')}</p>
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500"><th className="py-1 text-left">{t('payment.date')}</th><th className="py-1 text-left">{t('payment.receipt')}</th><th className="py-1 text-right">{t('payment.amount')}</th></tr></thead>
                  <tbody className="text-gray-700 dark:text-gray-300">
                    {detailModal.entries.map((e: Record<string, unknown>) => (
                      <tr key={e.id as string} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="py-1">{e.bill_date as string}</td>
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

      {/* Cancel confirmation modal */}
      <Modal isOpen={!!cancelModal} onClose={() => { setCancelModal(null); setCancelReason(''); }} title={t('payment.confirmCancel')} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('payment.confirmCancelDesc')}</p>
          <Textarea label={t('payment.reasonOptional')} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} />
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setCancelModal(null); setCancelReason(''); }}>{t('payment.dontCancel')}</Button>
          <Button variant="danger" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('payment.confirmCancelBtn')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
