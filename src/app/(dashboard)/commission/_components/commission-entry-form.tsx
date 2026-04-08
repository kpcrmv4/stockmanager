'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Input,
  Select,
  Textarea,
  toast,
  PhotoUpload,
} from '@/components/ui';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { Save, Loader2, Plus, Search, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { useTranslations } from 'next-intl';
import type { AEProfile } from '@/types/commission';

interface CommissionEntryFormProps {
  onSuccess: () => void;
}

function formatCurrency(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CommissionEntryForm({ onSuccess }: CommissionEntryFormProps) {
  const t = useTranslations('commission');
  const { currentStoreId } = useAppStore();
  const { user } = useAuthStore();

  const [type, setType] = useState<'ae_commission' | 'bottle_commission'>('ae_commission');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptNo, setReceiptNo] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null);
  const [tableNo, setTableNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // AE fields
  const [aeSearch, setAeSearch] = useState('');
  const [aeList, setAeList] = useState<AEProfile[]>([]);
  const [selectedAE, setSelectedAE] = useState<AEProfile | null>(null);
  const [showAeDropdown, setShowAeDropdown] = useState(false);
  const [subtotalAmount, setSubtotalAmount] = useState('');
  const [commissionRate, setCommissionRate] = useState('10');
  const [taxRate, setTaxRate] = useState('3');

  // Bottle fields
  const [bottleCount, setBottleCount] = useState('1');
  const [bottleRate, setBottleRate] = useState('500');

  // Staff list
  const [staffList, setStaffList] = useState<Array<{ id: string; display_name: string | null; username: string }>>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // Quick-add AE (full fields)
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAE, setQuickAE] = useState({ name: '', nickname: '', phone: '', bank_name: '', bank_account_no: '', bank_account_name: '', notes: '' });
  const [addingAE, setAddingAE] = useState(false);

  const searchAE = useCallback(async (q: string) => {
    const res = await fetch(`/api/ae?search=${encodeURIComponent(q)}`);
    if (res.ok) setAeList(await res.json());
  }, []);

  useEffect(() => { searchAE(''); }, [searchAE]);

  useEffect(() => {
    if (aeSearch.length > 0) {
      const timer = setTimeout(() => searchAE(aeSearch), 300);
      return () => clearTimeout(timer);
    }
  }, [aeSearch, searchAE]);

  useEffect(() => {
    if (type === 'bottle_commission' && staffList.length === 0) {
      import('@/lib/supabase/client').then(({ createClient }) => {
        const supabase = createClient();
        supabase
          .from('profiles')
          .select('id, display_name, username')
          .in('role', ['staff', 'bar', 'manager'])
          .eq('active', true)
          .order('display_name')
          .then(({ data }) => { if (data) setStaffList(data); });
      });
    }
  }, [type, staffList.length]);

  const subtotal = parseFloat(subtotalAmount) || 0;
  const cRate = parseFloat(commissionRate) / 100 || 0.10;
  const tRate = parseFloat(taxRate) / 100 || 0.03;
  const commissionAmt = subtotal * cRate;
  const taxAmt = commissionAmt * tRate;
  const netAE = commissionAmt - taxAmt;

  const bCount = parseInt(bottleCount) || 1;
  const bRate = parseFloat(bottleRate) || 500;
  const netBottle = bCount * bRate;

  async function handleQuickAddAE() {
    if (!quickAE.name.trim()) return;
    setAddingAE(true);
    try {
      const res = await fetch('/api/ae', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickAE.name.trim(),
          nickname: quickAE.nickname.trim() || null,
          phone: quickAE.phone.trim() || null,
          bank_name: quickAE.bank_name.trim() || null,
          bank_account_no: quickAE.bank_account_no.trim() || null,
          bank_account_name: quickAE.bank_account_name.trim() || null,
          notes: quickAE.notes.trim() || null,
        }),
      });
      if (res.ok) {
        const newAE = await res.json();
        setSelectedAE(newAE);
        setAeSearch(newAE.name);
        setShowQuickAdd(false);
        setQuickAE({ name: '', nickname: '', phone: '', bank_name: '', bank_account_no: '', bank_account_name: '', notes: '' });
        toast({ type: 'success', title: t('entryForm.addAeSuccess', { name: newAE.name }) });
        logAudit({ store_id: currentStoreId, action_type: AUDIT_ACTIONS.AE_PROFILE_CREATED, table_name: 'ae_profiles', record_id: newAE.id, changed_by: user?.id });
        searchAE('');
      } else {
        const err = await res.json();
        toast({ type: 'error', title: err.error || t('entryForm.error') });
      }
    } finally {
      setAddingAE(false);
    }
  }

  async function handleSubmit() {
    if (!currentStoreId) { toast({ type: 'error', title: t('entryForm.selectStore') }); return; }
    if (type === 'ae_commission' && !selectedAE) { toast({ type: 'error', title: t('entryForm.selectAe') }); return; }
    if (type === 'ae_commission' && subtotal <= 0) { toast({ type: 'error', title: t('entryForm.enterSubtotal') }); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        store_id: currentStoreId, type, bill_date: billDate,
        receipt_no: receiptNo, receipt_photo_url: receiptPhoto,
        table_no: tableNo, notes,
      };
      if (type === 'ae_commission') {
        payload.ae_id = selectedAE!.id;
        payload.subtotal_amount = subtotal;
        payload.commission_rate = cRate;
        payload.tax_rate = tRate;
      } else {
        payload.staff_id = selectedStaffId || null;
        payload.bottle_count = bCount;
        payload.bottle_rate = bRate;
      }

      const res = await fetch('/api/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        toast({ type: 'success', title: t('entryForm.saveSuccess') });
        logAudit({ store_id: currentStoreId, action_type: AUDIT_ACTIONS.COMMISSION_ENTRY_CREATED, table_name: 'commission_entries', record_id: created.id, new_value: payload as Record<string, unknown>, changed_by: user?.id });
        setReceiptNo(''); setReceiptPhoto(null); setTableNo(''); setNotes('');
        setSubtotalAmount(''); setSelectedAE(null); setAeSearch('');
        setBottleCount('1'); setSelectedStaffId('');
        onSuccess();
      } else {
        const err = await res.json();
        toast({ type: 'error', title: err.error || t('entryForm.error') });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Type selector */}
      <Card>
        <CardContent className="p-4">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('entryForm.commissionType')}</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setType('ae_commission')} className={cn('rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors', type === 'ae_commission' ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-900/20 dark:text-amber-400' : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:text-gray-400')}>AE Commission</button>
            <button onClick={() => setType('bottle_commission')} className={cn('rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors', type === 'bottle_commission' ? 'border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-400 dark:bg-rose-900/20 dark:text-rose-400' : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:text-gray-400')}>Bottle Commission</button>
          </div>
        </CardContent>
      </Card>

      {/* AE Selection */}
      {type === 'ae_commission' && (
        <Card>
          <CardHeader title={t('entryForm.selectAeTitle')} />
          <CardContent className="space-y-3 p-4">
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={aeSearch} onChange={(e) => { setAeSearch(e.target.value); setShowAeDropdown(true); if (selectedAE) setSelectedAE(null); }} onFocus={() => setShowAeDropdown(true)} placeholder={t('entryForm.searchAePlaceholder')} className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowQuickAdd(!showQuickAdd)}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>

              {showAeDropdown && !selectedAE && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                  {aeList.length === 0 ? (
                    <p className="p-3 text-center text-sm text-gray-400">{t('entryForm.noAeFound')}</p>
                  ) : aeList.map((ae) => (
                    <button key={ae.id} onClick={() => { setSelectedAE(ae); setAeSearch(ae.name); setShowAeDropdown(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                      <span className="font-medium text-gray-900 dark:text-white">{ae.name}</span>
                      {ae.nickname && <span className="text-gray-400">({ae.nickname})</span>}
                      {ae.phone && <span className="ml-auto text-xs text-gray-400">{ae.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedAE && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-sm dark:bg-amber-900/20">
                <span className="font-medium text-amber-700 dark:text-amber-400">{selectedAE.name}</span>
                {selectedAE.phone && <span className="text-amber-600/70 dark:text-amber-400/70">| {selectedAE.phone}</span>}
                <button onClick={() => { setSelectedAE(null); setAeSearch(''); }} className="ml-auto text-amber-500 hover:text-amber-700">&times;</button>
              </div>
            )}

            {/* Quick Add AE — full fields */}
            {showQuickAdd && (
              <div className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('entryForm.addNewAe')}</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input label={t('entryForm.aeName')} value={quickAE.name} onChange={(e) => setQuickAE({ ...quickAE, name: e.target.value })} />
                    <Input label={t('entryForm.nickname')} value={quickAE.nickname} onChange={(e) => setQuickAE({ ...quickAE, nickname: e.target.value })} />
                  </div>
                  <Input label={t('entryForm.phone')} value={quickAE.phone} onChange={(e) => setQuickAE({ ...quickAE, phone: e.target.value })} />
                  <Input label={t('entryForm.bankName')} value={quickAE.bank_name} onChange={(e) => setQuickAE({ ...quickAE, bank_name: e.target.value })} placeholder={t('entryForm.bankNamePlaceholder')} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label={t('entryForm.bankAccountNo')} value={quickAE.bank_account_no} onChange={(e) => setQuickAE({ ...quickAE, bank_account_no: e.target.value })} />
                    <Input label={t('entryForm.bankAccountName')} value={quickAE.bank_account_name} onChange={(e) => setQuickAE({ ...quickAE, bank_account_name: e.target.value })} />
                  </div>
                  <Input label={t('entryForm.notes')} value={quickAE.notes} onChange={(e) => setQuickAE({ ...quickAE, notes: e.target.value })} />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={handleQuickAddAE} disabled={addingAE || !quickAE.name.trim()}>
                    {addingAE ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {t('entryForm.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowQuickAdd(false)}>{t('entryForm.cancel')}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Staff selection */}
      {type === 'bottle_commission' && (
        <Card>
          <CardHeader title={t('entryForm.staff')} />
          <CardContent className="p-4">
            <Select label={t('entryForm.selectStaff')} value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} options={[{ value: '', label: t('entryForm.selectStaffOptional') }, ...staffList.map((s) => ({ value: s.id, label: s.display_name || s.username }))]} />
          </CardContent>
        </Card>
      )}

      {/* Bill info — date and receipt on separate rows on mobile */}
      <Card>
        <CardHeader title={t('entryForm.billInfo')} />
        <CardContent className="space-y-3 p-4">
          <Input label={t('entryForm.billDate')} type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} required />
          <Input label={t('entryForm.receiptNo')} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="RC..." />
          <Input label={t('entryForm.tableNo')} value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="V7" />
          <PhotoUpload value={receiptPhoto} onChange={setReceiptPhoto} folder="commission" label={t('entryForm.receiptPhoto')} placeholder={t('entryForm.receiptPhotoPlaceholder')} />
        </CardContent>
      </Card>

      {/* Amount calculation */}
      {type === 'ae_commission' ? (
        <Card>
          <CardHeader title={t('entryForm.calculateCommission')} />
          <CardContent className="space-y-3 p-4">
            <Input label={t('entryForm.subtotalBeforeVat')} type="number" value={subtotalAmount} onChange={(e) => setSubtotalAmount(e.target.value)} placeholder="17,050" required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Cashback %" type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
              <Input label={t('entryForm.taxPercent')} type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            {subtotal > 0 && (
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>{t('entryForm.subtotal')}</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Cashback {commissionRate}%</span><span>{formatCurrency(commissionAmt)}</span></div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>{t('entryForm.deductTax', { rate: taxRate })}</span><span>-{formatCurrency(taxAmt)}</span></div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-amber-600 dark:border-gray-700 dark:text-amber-400"><span>{t('entryForm.netAmount')}</span><span>{formatCurrency(netAE)}</span></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Bottle Commission" />
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('entryForm.bottleCount')} type="number" value={bottleCount} onChange={(e) => setBottleCount(e.target.value)} required />
              <Input label={t('entryForm.bottleRate')} type="number" value={bottleRate} onChange={(e) => setBottleRate(e.target.value)} />
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
              <div className="flex justify-between text-sm font-semibold text-rose-600 dark:text-rose-400"><span>{t('entryForm.netAmount')}</span><span>{formatCurrency(netBottle)}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-4"><Textarea label={t('entryForm.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('entryForm.notesPlaceholder')} /></CardContent></Card>

      <Button variant="primary" size="lg" className="w-full" onClick={handleSubmit} disabled={saving}>
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        {t('entryForm.saveCommission')}
      </Button>
    </div>
  );
}
