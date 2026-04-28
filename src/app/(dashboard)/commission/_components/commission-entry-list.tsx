'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Card, CardContent, Badge, Modal, ModalFooter, Textarea, toast } from '@/components/ui';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2, Trash2, Image, ChevronDown, ChevronRight, Layers, XCircle, RotateCcw } from 'lucide-react';
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

function GroupItem({ groupId, group, isExpanded, onToggle, t, canDelete, onDelete, onViewPhoto, onCancel, onRestore }: any) {
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
          {group.entries.map((entry: CommissionEntry) => {
            const isCancelled = !!entry.cancelled_at;
            return (
              <div
                key={entry.id}
                className={cn('p-3 pl-11', isCancelled && 'bg-red-50/40 dark:bg-red-900/10')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isCancelled ? (
                        <Badge variant="danger" size="sm">{t('entryList.cancelled')}</Badge>
                      ) : (
                        <Badge variant={entry.payment_id ? 'success' : 'outline'} size="sm">
                          {entry.payment_id ? t('entryList.paid') : t('entryList.unpaid')}
                        </Badge>
                      )}
                      <span className="text-xs text-gray-400">{formatThaiDate(entry.bill_date)}</span>
                      {entry.store && <span className="text-xs text-gray-400">{entry.store.store_code}</span>}
                    </div>
                    <div className={cn('mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400', isCancelled && 'line-through')}>
                      {entry.receipt_no && <span>#{entry.receipt_no}</span>}
                      {entry.table_no && <span>{t('entryList.table')} {entry.table_no}</span>}
                      {entry.subtotal_amount && <span>{t('entryList.subtotal')} {formatCurrency(Number(entry.subtotal_amount))}</span>}
                      {entry.type === 'bottle_commission' && entry.bottle_count && (
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                          {entry.bottle_count} {t('entryList.bottles')}
                        </span>
                      )}
                      {entry.bottle_product_name && (
                        <span className="text-indigo-500/80 dark:text-indigo-300/80">{entry.bottle_product_name}</span>
                      )}
                    </div>
                    {isCancelled && entry.cancel_reason && (
                      <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{t('entryList.cancelReason')}: {entry.cancel_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.receipt_photo_url && (
                      <button onClick={() => onViewPhoto(entry.receipt_photo_url)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                        <Image className="h-4 w-4" />
                      </button>
                    )}
                    <div className="text-right">
                      <p className={cn(
                        'text-sm font-bold',
                        isCancelled
                          ? 'text-gray-400 line-through dark:text-gray-500'
                          : 'text-amber-600 dark:text-amber-400'
                      )}>
                        {formatCurrency(Number(entry.net_amount))}
                      </p>
                    </div>
                    {!entry.payment_id && !isCancelled && onCancel && (
                      <button onClick={() => onCancel(entry.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30" title={t('entryList.cancel')}>
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                    {isCancelled && !entry.payment_id && onRestore && (
                      <button onClick={() => onRestore(entry.id)} className="rounded p-1 text-gray-300 hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-900/30" title={t('entryList.restore')}>
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                    {canDelete && !entry.payment_id && (
                      <button onClick={() => onDelete(entry.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

interface CommissionEntryListProps {
  month?: string;
  refreshKey?: number;
}

export function CommissionEntryList({ month: monthProp, refreshKey }: CommissionEntryListProps = {}) {
  const t = useTranslations('commission');
  const { currentStoreId } = useAppStore();
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalMonth, setInternalMonth] = useState(getCurrentMonth());
  const month = monthProp ?? internalMonth;
  const setMonth = setInternalMonth;
  const isMonthControlled = monthProp !== undefined;
  const [typeFilter, setTypeFilter] = useState<string>('');
  // Status filter: '' = all, 'active' = not cancelled, 'cancelled' = only cancelled
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'cancelled'>('');
  const [total, setTotal] = useState(0);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  
  // Grouping state
  const [isGrouped, setIsGrouped] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Cancel/restore/delete modals — styled instead of native prompt/confirm
  const [cancelEntryId, setCancelEntryId] = useState<string | null>(null);
  const [cancelEntryReason, setCancelEntryReason] = useState('');
  const [cancellingEntry, setCancellingEntry] = useState(false);
  const [restoreEntryId, setRestoreEntryId] = useState<string | null>(null);
  const [restoringEntry, setRestoringEntry] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);

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
  }, [month, currentStoreId, typeFilter, refreshKey]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Open the styled delete-confirmation modal — actual mutation happens
  // in confirmDeleteEntry. Replaces the native window.confirm() that
  // bypassed our i18n + theme.
  function handleDelete(id: string) {
    setDeleteEntryId(id);
  }

  async function confirmDeleteEntry() {
    if (!deleteEntryId) return;
    setDeletingEntry(true);
    try {
      const res = await fetch(`/api/commission/${deleteEntryId}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ type: 'success', title: t('entryList.deleteSuccess') });
        logAudit({
          store_id: currentStoreId,
          action_type: AUDIT_ACTIONS.COMMISSION_ENTRY_DELETED,
          table_name: 'commission_entries',
          record_id: deleteEntryId,
          changed_by: user?.id,
        });
        setDeleteEntryId(null);
        fetchEntries();
      } else {
        toast({ type: 'error', title: t('entryList.deleteFailed') });
      }
    } finally {
      setDeletingEntry(false);
    }
  }

  // Toggle group expansion
  const toggleGroup = (aeId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [aeId]: !prev[aeId]
    }));
  };

  // Group entries helper. Cancelled entries stay in `entries` so they
  // render in the history list, but are excluded from totalAmount and
  // unpaidAmount so the rolled-up numbers reflect only active rows.
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
          unpaidAmount: 0,
        };
      }
      acc[groupId].entries.push(entry);
      if (!entry.cancelled_at) {
        const amount = Number(entry.net_amount) || 0;
        acc[groupId].totalAmount += amount;
        if (!entry.payment_id) {
          acc[groupId].unpaidAmount += amount;
        }
      }
      return acc;
    }, {} as Record<string, { type: string, profile: any, entries: CommissionEntry[], totalAmount: number, unpaidAmount: number }>);
  };

  // Open the styled cancel modal — actual mutation happens in
  // confirmCancelEntry once the user confirms with an optional reason.
  function handleCancelEntry(id: string) {
    setCancelEntryId(id);
    setCancelEntryReason('');
  }

  async function confirmCancelEntry() {
    if (!cancelEntryId) return;
    setCancellingEntry(true);
    try {
      const res = await fetch(`/api/commission/${cancelEntryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: cancelEntryReason }),
      });
      if (res.ok) {
        toast({ type: 'success', title: t('entryList.cancelEntrySuccess') });
        logAudit({
          store_id: currentStoreId,
          action_type: AUDIT_ACTIONS.COMMISSION_ENTRY_CANCELLED,
          table_name: 'commission_entries',
          record_id: cancelEntryId,
          new_value: { reason: cancelEntryReason },
          changed_by: user?.id,
        });
        setCancelEntryId(null);
        setCancelEntryReason('');
        fetchEntries();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ type: 'error', title: err.error || t('entryList.cancelFailed') });
      }
    } finally {
      setCancellingEntry(false);
    }
  }

  function handleRestoreEntry(id: string) {
    setRestoreEntryId(id);
  }

  async function confirmRestoreEntry() {
    if (!restoreEntryId) return;
    setRestoringEntry(true);
    try {
      const res = await fetch(`/api/commission/${restoreEntryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      if (res.ok) {
        toast({ type: 'success', title: t('entryList.restoreSuccess') });
        logAudit({
          store_id: currentStoreId,
          action_type: AUDIT_ACTIONS.COMMISSION_ENTRY_RESTORED,
          table_name: 'commission_entries',
          record_id: restoreEntryId,
          changed_by: user?.id,
        });
        setRestoreEntryId(null);
        fetchEntries();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ type: 'error', title: err.error || t('entryList.restoreFailed') });
      }
    } finally {
      setRestoringEntry(false);
    }
  }

  // Apply status filter before grouping. The grouping logic always
  // excludes cancelled entries from totals, but cancelled entries
  // themselves are kept inside `entries[]` so they render visibly.
  const filteredEntries = statusFilter === 'active'
    ? entries.filter((e) => !e.cancelled_at)
    : statusFilter === 'cancelled'
      ? entries.filter((e) => !!e.cancelled_at)
      : entries;
  const aeGroups = groupByType(filteredEntries, 'ae_commission');
  const bottleGroups = groupByType(filteredEntries, 'bottle_commission');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {!isMonthControlled && (
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
        )}
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          <option value="">{t('entryList.allTypes')}</option>
          <option value="ae_commission">AE Commission</option>
          <option value="bottle_commission">Bottle Commission</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | 'active' | 'cancelled')}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="">{t('entryList.allStatuses')}</option>
          <option value="active">{t('entryList.statusActive')}</option>
          <option value="cancelled">{t('entryList.cancelled')}</option>
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
                    onCancel={handleCancelEntry}
                    onRestore={handleRestoreEntry}
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
                    onCancel={handleCancelEntry}
                    onRestore={handleRestoreEntry}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // --- COMPACT TABLE VIEW (one row per entry) ---
        // Card-per-row chewed up the screen on tablet/desktop. Switch
        // to a tight table on >=md and a stacked one-liner on small
        // mobile (where a real table would side-scroll forever).
        <Card padding="none">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('entryList.colType')}</th>
                  <th className="px-3 py-2 font-medium">{t('entryList.colStatus')}</th>
                  <th className="px-3 py-2 font-medium">{t('entryList.colDate')}</th>
                  <th className="px-3 py-2 font-medium">{t('entryList.colName')}</th>
                  <th className="px-3 py-2 font-medium">{t('entryList.colReceipt')}</th>
                  <th className="px-3 py-2 font-medium">{t('entryList.colDetail')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('entryList.colAmount')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('entryList.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {entries.map((entry) => {
                  const isAE = entry.type === 'ae_commission';
                  const ae = entry.ae_profile;
                  const staff = entry.staff_profile;
                  const isPaid = !!entry.payment_id;
                  const isCancelled = !!entry.cancelled_at;
                  const name = isAE
                    ? ae?.name || 'Unknown AE'
                    : staff?.display_name || staff?.username || t('entryList.unspecifiedStaff');
                  return (
                    <tr key={entry.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-800/30', isCancelled && 'bg-red-50/40 dark:bg-red-900/10')}>
                      <td className="px-3 py-2 align-middle">
                        <Badge variant={isAE ? 'warning' : 'danger'} size="sm">{isAE ? 'AE' : 'Bottle'}</Badge>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {isCancelled
                          ? <Badge variant="danger" size="sm">{t('entryList.cancelled')}</Badge>
                          : <Badge variant={isPaid ? 'success' : 'outline'} size="sm">{isPaid ? t('entryList.paid') : t('entryList.unpaid')}</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle text-gray-500 dark:text-gray-400">
                        {formatThaiDate(entry.bill_date)}
                      </td>
                      <td className={cn('px-3 py-2 align-middle font-medium text-gray-900 dark:text-white', isCancelled && 'line-through opacity-70')}>
                        <div className="max-w-[200px] truncate" title={name}>{name}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle text-gray-500 dark:text-gray-400">
                        {entry.receipt_no ? <span className="font-mono">#{entry.receipt_no}</span> : '—'}
                      </td>
                      <td className={cn('px-3 py-2 align-middle text-gray-500 dark:text-gray-400', isCancelled && 'line-through')}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                          {entry.table_no && <span>{t('entryList.table')} {entry.table_no}</span>}
                          {isAE && entry.subtotal_amount && <span>{t('entryList.subtotal')} {formatCurrency(Number(entry.subtotal_amount))}</span>}
                          {!isAE && entry.bottle_count && <span>{entry.bottle_count} {t('entryList.bottles')}</span>}
                          {entry.bottle_product_name && <span className="text-indigo-500/80 dark:text-indigo-300/80">{entry.bottle_product_name}</span>}
                        </div>
                      </td>
                      <td className={cn(
                        'whitespace-nowrap px-3 py-2 text-right align-middle font-bold',
                        isCancelled ? 'text-gray-400 line-through dark:text-gray-500'
                          : isAE ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400',
                      )}>
                        {formatCurrency(Number(entry.net_amount))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-middle">
                        <div className="inline-flex items-center gap-1">
                          {entry.receipt_photo_url && (
                            <button onClick={() => setPhotoModal(entry.receipt_photo_url)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700" title={t('entryList.receiptPhoto')}>
                              <Image className="h-4 w-4" />
                            </button>
                          )}
                          {!isPaid && !isCancelled && (
                            <button onClick={() => handleCancelEntry(entry.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30" title={t('entryList.cancel')}>
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                          {isCancelled && !isPaid && (
                            <button onClick={() => handleRestoreEntry(entry.id)} className="rounded p-1 text-gray-300 hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-900/30" title={t('entryList.restore')}>
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && !isPaid && (
                            <button onClick={() => handleDelete(entry.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile fallback — table would side-scroll, so keep a tight
              two-line card layout instead. */}
          <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-700">
            {entries.map((entry) => {
              const isAE = entry.type === 'ae_commission';
              const ae = entry.ae_profile;
              const staff = entry.staff_profile;
              const isPaid = !!entry.payment_id;
              const isCancelled = !!entry.cancelled_at;
              const name = isAE
                ? ae?.name || 'Unknown AE'
                : staff?.display_name || staff?.username || t('entryList.unspecifiedStaff');
              return (
                <div key={entry.id} className={cn('flex items-center justify-between gap-2 px-3 py-2', isCancelled && 'bg-red-50/40 dark:bg-red-900/10')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={isAE ? 'warning' : 'danger'} size="sm">{isAE ? 'AE' : 'Bottle'}</Badge>
                      {isCancelled
                        ? <Badge variant="danger" size="sm">{t('entryList.cancelled')}</Badge>
                        : <Badge variant={isPaid ? 'success' : 'outline'} size="sm">{isPaid ? t('entryList.paid') : t('entryList.unpaid')}</Badge>}
                      <span className="text-[11px] text-gray-400">{formatThaiDate(entry.bill_date)}</span>
                    </div>
                    <p className={cn('mt-0.5 truncate text-sm font-medium text-gray-900 dark:text-white', isCancelled && 'line-through opacity-70')}>{name}</p>
                    <div className={cn('mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400', isCancelled && 'line-through')}>
                      {entry.receipt_no && <span className="font-mono">#{entry.receipt_no}</span>}
                      {entry.table_no && <span>{t('entryList.table')} {entry.table_no}</span>}
                      {isAE && entry.subtotal_amount && <span>{t('entryList.subtotal')} {formatCurrency(Number(entry.subtotal_amount))}</span>}
                      {!isAE && entry.bottle_count && <span>{entry.bottle_count} {t('entryList.bottles')}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {entry.receipt_photo_url && (
                      <button onClick={() => setPhotoModal(entry.receipt_photo_url)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                        <Image className="h-4 w-4" />
                      </button>
                    )}
                    <p className={cn(
                      'whitespace-nowrap text-sm font-bold',
                      isCancelled ? 'text-gray-400 line-through dark:text-gray-500'
                        : isAE ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400',
                    )}>{formatCurrency(Number(entry.net_amount))}</p>
                    {!isPaid && !isCancelled && (
                      <button onClick={() => handleCancelEntry(entry.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                    {isCancelled && !isPaid && (
                      <button onClick={() => handleRestoreEntry(entry.id)} className="rounded p-1 text-gray-300 hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-900/30">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                    {canDelete && !isPaid && (
                      <button onClick={() => handleDelete(entry.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Modal isOpen={!!photoModal} onClose={() => setPhotoModal(null)} title={t('entryList.receiptPhoto')} size="lg">
        {photoModal && <div className="flex justify-center"><img src={photoModal} alt="Receipt" className="max-h-[70vh] rounded-lg object-contain" /></div>}
      </Modal>

      {/* Cancel-entry modal — soft-cancels a single bill with optional reason */}
      <Modal
        isOpen={!!cancelEntryId}
        onClose={() => { setCancelEntryId(null); setCancelEntryReason(''); }}
        title={t('entryList.confirmCancelEntry')}
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('entryList.confirmCancelEntryDesc')}</p>
          <Textarea
            label={t('entryList.cancelPrompt')}
            value={cancelEntryReason}
            onChange={(e) => setCancelEntryReason(e.target.value)}
            rows={2}
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setCancelEntryId(null); setCancelEntryReason(''); }}>
            {t('payment.dontCancel')}
          </Button>
          <Button variant="danger" onClick={confirmCancelEntry} disabled={cancellingEntry}>
            {cancellingEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('payment.confirmCancelBtn')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Restore-entry modal */}
      <Modal
        isOpen={!!restoreEntryId}
        onClose={() => setRestoreEntryId(null)}
        title={t('entryList.confirmRestore')}
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('entryList.restoreDesc')}</p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setRestoreEntryId(null)}>
            {t('entryForm.cancel')}
          </Button>
          <Button variant="primary" onClick={confirmRestoreEntry} disabled={restoringEntry}>
            {restoringEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('entryList.restore')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete-entry modal — replaces window.confirm() */}
      <Modal
        isOpen={!!deleteEntryId}
        onClose={() => setDeleteEntryId(null)}
        title={t('entryList.confirmDeleteTitle')}
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('entryList.confirmDeleteDesc')}</p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteEntryId(null)}>
            {t('entryForm.cancel')}
          </Button>
          <Button variant="danger" onClick={confirmDeleteEntry} disabled={deletingEntry}>
            {deletingEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('entryList.deleteBtn')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
