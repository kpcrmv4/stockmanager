'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, Badge, Modal, toast } from '@/components/ui';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2, Trash2, Image, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { CommissionEntry } from '@/types/commission';

function formatCurrency(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function CommissionEntryList() {
  const { selectedStoreId } = useAppStore();
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(getCurrentMonth());
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  const canDelete = user?.role === 'owner' || user?.role === 'accountant';

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (selectedStoreId) params.set('store_id', selectedStoreId);
      if (typeFilter) params.set('type', typeFilter);
      const res = await fetch(`/api/commission?${params}`);
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data || []);
        setTotal(json.count || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [month, selectedStoreId, typeFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function handleDelete(id: string) {
    if (!confirm('ยืนยันลบรายการนี้?')) return;
    const res = await fetch(`/api/commission/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ type: 'success', title: 'ลบสำเร็จ' });
      fetchEntries();
    } else {
      toast({ type: 'error', title: 'ลบไม่สำเร็จ' });
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="">ทุกประเภท</option>
          <option value="ae_commission">AE Commission</option>
          <option value="bottle_commission">Bottle Commission</option>
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400">{total} รายการ</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">ไม่มีรายการ</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isAE = entry.type === 'ae_commission';
            const ae = entry.ae_profile;
            const staff = entry.staff_profile;
            const store = entry.store;

            return (
              <Card key={entry.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={isAE ? 'warning' : 'danger'} size="sm">
                          {isAE ? 'AE' : 'Bottle'}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {entry.bill_date}
                        </span>
                        {store && (
                          <span className="text-xs text-gray-400">
                            {store.store_code}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                        {isAE
                          ? ae?.name || 'Unknown AE'
                          : staff?.display_name || staff?.username || 'ไม่ระบุพนักงาน'}
                      </p>

                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        {entry.receipt_no && <span>#{entry.receipt_no}</span>}
                        {entry.table_no && <span>โต๊ะ {entry.table_no}</span>}
                        {isAE && entry.subtotal_amount && (
                          <span>ยอด {formatCurrency(Number(entry.subtotal_amount))}</span>
                        )}
                        {!isAE && entry.bottle_count && (
                          <span>{entry.bottle_count} ขวด</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {entry.receipt_photo_url && (
                        <button
                          onClick={() => setPhotoModal(entry.receipt_photo_url)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                        >
                          <Image className="h-4 w-4" />
                        </button>
                      )}

                      <div className="text-right">
                        <p className={cn(
                          'text-sm font-bold',
                          isAE ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
                        )}>
                          {formatCurrency(Number(entry.net_amount))}
                        </p>
                      </div>

                      {canDelete && (
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Photo Modal */}
      <Modal isOpen={!!photoModal} onClose={() => setPhotoModal(null)} title="รูปถ่ายบิล" size="lg">
        {photoModal && (
          <div className="flex justify-center">
            <img src={photoModal} alt="Receipt" className="max-h-[70vh] rounded-lg object-contain" />
          </div>
        )}
      </Modal>
    </div>
  );
}
