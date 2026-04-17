'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, Badge, Modal, toast } from '@/components/ui';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2, Trash2, Image, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { useTranslations } from 'next-intl';
import { formatThaiDate } from '@/lib/utils/format';
import type { CommissionEntry } from '@/types/commission';

function formatCurrency(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function GroupItem({ groupId, group, isExpanded, onToggle, t, canDelete, onDelete, onViewPhoto }: any) {
  const profileName = group.type === 'ae_commission' 
    ? (group.profile?.name || 'Unknown AE')
    : (group.profile?.display_name || group.profile?.username || 'Unknown Staff');
  
  return (
    <Card className="overflow-hidden">
      {/* Group Header */}
      <div 
        className={cn(
          "flex cursor-pointer items-center justify-between bg-gray-50 p-3 transition-colors hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800",
          isExpanded && "border-b border-gray-200 dark:border-gray-700"
        )}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {profileName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {group.entries.length} {t('entryList.entries')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right text-sm">
          {group.unpaidAmount > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('entryList.unpaid')}</p>
              <p className="font-bold text-rose-600 dark:text-rose-400">{formatCurrency(group.unpaidAmount)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('entryList.totalLabel')}</p>
            <p className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(group.totalAmount)}</p>
          </div>
        </div>
      </div>

      {/* Group Content (Collapsible) */}
      {isExpanded && (
        <div className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
          {group.entries.map((entry: CommissionEntry) => (
            <div key={entry.id} className="p-3 pl-11">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={entry.payment_id ? 'success' : 'outline'} size="sm">
                      {entry.payment_id ? t('entryList.paid') : t('entryList.unpaid')}
                    </Badge>
                    <span className="text-xs text-gray-400">{formatThaiDate(entry.bill_date)}</span>
                    {entry.store && <span className="text-xs text-gray-400">{entry.store.store_code}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {entry.receipt_no && <span>#{entry.receipt_no}</span>}
                    {entry.table_no && <span>{t('entryList.table')} {entry.table_no}</span>}
                    {entry.subtotal_amount && <span>{t('entryList.subtotal')} {formatCurrency(Number(entry.subtotal_amount))}</span>}
                    {entry.type === 'bottle_commission' && entry.bottle_count && (
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                        {entry.bottle_count} {t('entryList.bottles')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {entry.receipt_photo_url && (
                    <button onClick={() => onViewPhoto(entry.receipt_photo_url)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                      <Image className="h-4 w-4" />
                    </button>
                  )}
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(Number(entry.net_amount))}
                    </p>
                  </div>
                  {canDelete && !entry.payment_id && (
                    <button onClick={() => onDelete(entry.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function CommissionEntryList() {
  const t = useTranslations('commission');
  const { currentStoreId } = useAppStore();
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(getCurrentMonth());
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  
  // Grouping state
  const [isGrouped, setIsGrouped] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const canDelete = user?.role === 'owner' || user?.role === 'accountant';

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (currentStoreId) params.set('store_id', currentStoreId);
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
  }, [month, currentStoreId, typeFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function handleDelete(id: string) {
    if (!confirm(t('entryList.confirmDelete'))) return;
    const res = await fetch(`/api/commission/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ type: 'success', title: t('entryList.deleteSuccess') });
      logAudit({ store_id: currentStoreId, action_type: AUDIT_ACTIONS.COMMISSION_ENTRY_DELETED, table_name: 'commission_entries', record_id: id, changed_by: user?.id });
      fetchEntries();
    } else {
      toast({ type: 'error', title: t('entryList.deleteFailed') });
    }
  }

  // Toggle group expansion
  const toggleGroup = (aeId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [aeId]: !prev[aeId]
    }));
  };

  // Group entries helper
  const groupByType = (items: CommissionEntry[], type: 'ae_commission' | 'bottle_commission') => {
    return items.filter(e => e.type === type).reduce((acc, entry) => {
      const id = type === 'ae_commission' ? (entry.ae_id || 'unknown') : (entry.staff_id || 'unknown');
      const groupId = `${type}_${id}`;
      
      if (!acc[groupId]) {
        acc[groupId] = {
          type,
          profile: type === 'ae_commission' ? entry.ae_profile : entry.staff_profile,
          entries: [],
          totalAmount: 0,
          unpaidAmount: 0
        };
      }
      acc[groupId].entries.push(entry);
      const amount = Number(entry.net_amount) || 0;
      acc[groupId].totalAmount += amount;
      if (!entry.payment_id) {
        acc[groupId].unpaidAmount += amount;
      }
      return acc;
    }, {} as Record<string, { type: string, profile: any, entries: CommissionEntry[], totalAmount: number, unpaidAmount: number }>);
  };

  const aeGroups = groupByType(entries, 'ae_commission');
  const bottleGroups = groupByType(entries, 'bottle_commission');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          <option value="">{t('entryList.allTypes')}</option>
          <option value="ae_commission">AE Commission</option>
          <option value="bottle_commission">Bottle Commission</option>
        </select>
        
        {/* Toggle Grouping */}
        <button
          onClick={() => setIsGrouped(!isGrouped)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            isGrouped 
              ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-900/30 dark:text-indigo-300"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          )}
        >
          <Layers className="h-4 w-4" />
          {t('entryList.groupView')}
        </button>

        <span className="text-sm text-gray-500 dark:text-gray-400">{total} {t('entryList.entries')}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">{t('entryList.noEntries')}</p>
      ) : isGrouped ? (
        // --- GROUPED VIEW ---
        <div className="space-y-8">
          {/* AE Commission Section */}
          {(typeFilter === '' || typeFilter === 'ae_commission') && Object.keys(aeGroups).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="warning">AE Commission</Badge>
                <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
              </div>
              <div className="space-y-3">
                {Object.entries(aeGroups).map(([groupId, group]) => (
                  <GroupItem 
                    key={groupId}
                    groupId={groupId}
                    group={group}
                    isExpanded={!!expandedGroups[groupId]}
                    onToggle={() => toggleGroup(groupId)}
                    t={t}
                    canDelete={canDelete}
                    onDelete={handleDelete}
                    onViewPhoto={setPhotoModal}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Bottle Commission Section */}
          {(typeFilter === '' || typeFilter === 'bottle_commission') && Object.keys(bottleGroups).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="danger">Bottle Commission</Badge>
                <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
              </div>
              <div className="space-y-3">
                {Object.entries(bottleGroups).map(([groupId, group]) => (
                  <GroupItem 
                    key={groupId}
                    groupId={groupId}
                    group={group}
                    isExpanded={!!expandedGroups[groupId]}
                    onToggle={() => toggleGroup(groupId)}
                    t={t}
                    canDelete={canDelete}
                    onDelete={handleDelete}
                    onViewPhoto={setPhotoModal}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // --- NORMAL LIST VIEW ---
        <div className="space-y-2">
          {entries.map((entry) => {
            const isAE = entry.type === 'ae_commission';
            const ae = entry.ae_profile;
            const staff = entry.staff_profile;
            const store = entry.store;
            const isPaid = !!entry.payment_id;

            return (
              <Card key={entry.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={isAE ? 'warning' : 'danger'} size="sm">{isAE ? 'AE' : 'Bottle'}</Badge>
                        <Badge variant={isPaid ? 'success' : 'outline'} size="sm">{isPaid ? t('entryList.paid') : t('entryList.unpaid')}</Badge>
                        <span className="text-xs text-gray-400">{formatThaiDate(entry.bill_date)}</span>
                        {store && <span className="text-xs text-gray-400">{store.store_code}</span>}
                      </div>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                        {isAE ? ae?.name || 'Unknown AE' : staff?.display_name || staff?.username || t('entryList.unspecifiedStaff')}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        {entry.receipt_no && <span>#{entry.receipt_no}</span>}
                        {entry.table_no && <span>{t('entryList.table')} {entry.table_no}</span>}
                        {isAE && entry.subtotal_amount && <span>{t('entryList.subtotal')} {formatCurrency(Number(entry.subtotal_amount))}</span>}
                        {!isAE && entry.bottle_count && <span>{entry.bottle_count} {t('entryList.bottles')}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.receipt_photo_url && (
                        <button onClick={() => setPhotoModal(entry.receipt_photo_url)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                          <Image className="h-4 w-4" />
                        </button>
                      )}
                      <div className="text-right">
                        <p className={cn('text-sm font-bold', isAE ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')}>
                          {formatCurrency(Number(entry.net_amount))}
                        </p>
                      </div>
                      {canDelete && !isPaid && (
                        <button onClick={() => handleDelete(entry.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
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

      <Modal isOpen={!!photoModal} onClose={() => setPhotoModal(null)} title={t('entryList.receiptPhoto')} size="lg">
        {photoModal && <div className="flex justify-center"><img src={photoModal} alt="Receipt" className="max-h-[70vh] rounded-lg object-contain" /></div>}
      </Modal>
    </div>
  );
}
