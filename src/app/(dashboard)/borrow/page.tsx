'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { useRealtime } from '@/hooks/use-realtime';
import {
  Button,
  Badge,
  Card,
  Input,
  Select,
  Textarea,
  Modal,
  ModalFooter,
  EmptyState,
  toast,
} from '@/components/ui';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { formatThaiDateTime, formatThaiDate } from '@/lib/utils/format';
import {
  Package,
  ArrowRightLeft,
  Plus,
  Check,
  X,
  Clock,
  Camera,
  ChevronRight,
  Loader2,
  AlertCircle,
  Store,
  Building2,
  Send,
  CheckCircle2,
  XCircle,
  Image,
  AlertTriangle,
  LayoutGrid,
  LayoutList,
  Columns as ColumnsIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BorrowItem {
  id: string;
  product_name: string;
  category: string | null;
  quantity: number;
  approved_quantity: number | null;
  unit: string | null;
  notes: string | null;
}

interface BorrowWithDetails {
  id: string;
  borrow_code: string | null;
  from_store_id: string;
  to_store_id: string;
  requested_by: string | null;
  status: 'pending_approval' | 'approved' | 'pos_adjusting' | 'completed' | 'return_pending' | 'returned' | 'rejected' | 'cancelled';
  notes: string | null;
  borrower_photo_url: string | null;
  lender_photo_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  borrower_pos_confirmed: boolean;
  lender_pos_confirmed: boolean;
  borrower_pos_confirmed_by: string | null;
  borrower_pos_confirmed_at: string | null;
  lender_pos_confirmed_by: string | null;
  lender_pos_confirmed_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  from_store_name?: string;
  to_store_name?: string;
  requester_name?: string;
  approver_name?: string;
  items: BorrowItem[];
  return_photo_url?: string | null;
  return_confirmed_by?: string | null;
  return_confirmed_at?: string | null;
  return_notes?: string | null;
  return_receipt_photo_url?: string | null;
  return_received_by?: string | null;
  return_received_at?: string | null;
}

interface StoreOption {
  id: string;
  store_name: string;
  store_code: string;
}

interface FormItem {
  product_name: string;
  category: string;
  quantity: string;
  unit: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('justNow');
  if (mins < 60) return t('minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('daysAgo', { count: days });
}

function isNew(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 5 * 60 * 1000;
}

function getStatusConfig(t: ReturnType<typeof useTranslations>): Record<
  BorrowWithDetails['status'],
  { label: string; variant: 'warning' | 'info' | 'default' | 'success' | 'danger'; step: number }
> {
  // 4-step flow: ส่งคำขอ (0) → อนุมัติ (1) → รับสินค้า (2) → คืนสินค้า (3)
  // `pos_adjusting` kept for backward compat with legacy records — treated
  // the same as `approved` in the new flow.
  return {
    pending_approval: { label: t('statusPendingApproval'), variant: 'warning', step: 0 },
    approved: { label: t('statusWaitingReceive'), variant: 'info', step: 1 },
    pos_adjusting: { label: t('statusWaitingReceive'), variant: 'info', step: 1 },
    completed: { label: t('statusWaitingReturn'), variant: 'info', step: 2 },
    // `return_pending` = borrower has sent return items; lender hasn't confirmed yet.
    // Keep step at 2 so the final step shows as "in progress" (not ticked) until
    // `returned` is reached.
    return_pending: { label: t('statusReturnPending'), variant: 'warning', step: 2 },
    returned: { label: t('statusReturned'), variant: 'success', step: 3 },
    rejected: { label: t('statusRejected'), variant: 'danger', step: -1 },
    cancelled: { label: t('statusCancelled'), variant: 'danger', step: -1 },
  };
}

const FALLBACK_STATUS_CONFIG = { label: '', variant: 'default' as const, step: -1 };

function getVisualStatus(
  borrow: BorrowWithDetails,
  currentStoreId: string,
  t: ReturnType<typeof useTranslations>,
): { label: string; variant: 'warning' | 'info' | 'default' | 'success' | 'danger'; step: number } {
  const config = getStatusConfig(t);
  const status = borrow.status;
  const base = config[status] ?? { ...FALLBACK_STATUS_CONFIG, label: String(status) };

  // Perspective-based labels for 'completed' (waiting return)
  if (status === 'completed') {
    if (borrow.from_store_id === currentStoreId) {
      // We are the borrower -> "รอส่งคืน"
      return { ...base, label: t('statusWaitingToReturn') };
    } else {
      // We are the lender -> "รอรับคืน"
      return { ...base, label: t('statusWaitingToReceiveReturn') };
    }
  }

  // Perspective-based labels for 'return_pending' (lender must confirm receipt)
  if (status === 'return_pending') {
    if (borrow.from_store_id === currentStoreId) {
      // We are the borrower, waiting for lender to confirm
      return { ...base, label: t('statusWaitingLenderReceipt') };
    } else {
      // We are the lender, need to confirm receipt
      return { ...base, label: t('statusConfirmReturnReceipt') };
    }
  }

  return base;
}

const EMPTY_FORM_ITEM: FormItem = { product_name: '', category: '', quantity: '', unit: '' };

// ---------------------------------------------------------------------------
// Status progress bar
// ---------------------------------------------------------------------------

function StatusProgressBar({
  status,
  isLender,
  t,
}: {
  status: BorrowWithDetails['status'];
  isLender: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const steps = [
    t('stepSendRequest'),
    t('stepApprove'),
    t('stepReceive'),
    isLender ? t('stepReturnLender') : t('stepReturnBorrower'),
  ];
  const isRejected = status === 'rejected';
  const statusConfig = getStatusConfig(t);
  const currentStep = statusConfig[status]?.step ?? -1;
  // `step` represents the last completed milestone; the next step is in progress.
  const isTerminated = currentStep < 0;

  return (
    <div className="flex items-center gap-1">
      {steps.map((label, i) => {
        const isCompleted = !isTerminated && currentStep >= i;
        const isCurrent = !isTerminated && currentStep + 1 === i;
        const isRejectedStep = isRejected && i === 0;

        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center">
              {i > 0 && (
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    isRejected
                      ? 'bg-red-200 dark:bg-red-900/40'
                      : isCompleted
                        ? 'bg-emerald-400 dark:bg-emerald-500'
                        : 'bg-gray-200 dark:bg-gray-700'
                  )}
                />
              )}
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                  isRejected && isRejectedStep
                    ? 'bg-red-500 text-white'
                    : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'animate-pulse bg-teal-400 text-white'
                        : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                )}
              >
                {isRejected && isRejectedStep ? (
                  <X className="h-3 w-3" />
                ) : isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : (
                  i + 1
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    isRejected
                      ? 'bg-red-200 dark:bg-red-900/40'
                      : currentStep > i
                        ? 'bg-emerald-400 dark:bg-emerald-500'
                        : 'bg-gray-200 dark:bg-gray-700'
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                'text-center text-[10px] leading-tight',
                isCompleted || isCurrent
                  ? 'font-medium text-gray-700 dark:text-gray-300'
                  : 'text-gray-400 dark:text-gray-500'
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Borrow Card
// ---------------------------------------------------------------------------

function BorrowCard({
  borrow,
  tab,
  currentStoreId,
  onClick,
  t,
}: {
  borrow: BorrowWithDetails;
  tab: 'outgoing' | 'incoming';
  currentStoreId: string;
  onClick: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const config = getVisualStatus(borrow, currentStoreId, t);
  const otherStore =
    tab === 'outgoing' ? borrow.to_store_name : borrow.from_store_name;
  const itemsSummary = borrow.items
    .map((it) => `${it.product_name} x${it.quantity}`)
    .join(', ');
  const totalItems = borrow.items.length;
  const hasPhoto = !!borrow.borrower_photo_url || !!borrow.lender_photo_url;
  const fresh = isNew(borrow.created_at);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative w-full rounded-xl border bg-white text-left shadow-sm transition-all hover:shadow-md active:scale-[0.99] dark:bg-gray-900 dark:border-gray-700',
        fresh && 'ring-2 ring-teal-400/60 animate-pulse'
      )}
    >
      <div className="p-4 sm:p-5">
        {/* Top row: store + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
              <span className="truncate max-w-[90px] sm:max-w-[120px]">{borrow.from_store_name || t('unknownStore')}</span>
              <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-teal-500" />
              <span className="truncate max-w-[90px] sm:max-w-[120px]">{borrow.to_store_name || t('unknownStore')}</span>
            </div>
          </div>
          <Badge variant={config.variant as 'warning' | 'success' | 'danger' | 'info' | 'default'} size="sm">
            {config.label}
          </Badge>
        </div>

        {/* Items summary */}
        <p className="mt-2 text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
          <span className="font-medium text-teal-600 dark:text-teal-400">{t('itemCount', { count: totalItems })}</span>{' '}
          {itemsSummary}
        </p>

        {/* Bottom row: requester + time + photo */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
          <div className="flex items-center gap-3">
            {borrow.requester_name && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {borrow.requester_name}
              </span>
            )}
            <span>{relativeTime(borrow.created_at, t)}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasPhoto && <Camera className="h-3.5 w-3.5 text-gray-400" />}
            <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create Borrow Modal
// ---------------------------------------------------------------------------

interface BranchProduct {
  id: string;
  product_name: string;
  category: string | null;
  unit: string | null;
}

function CreateBorrowModal({
  isOpen,
  onClose,
  stores,
  currentStoreId,
  onSuccess,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreOption[];
  currentStoreId: string;
  onSuccess: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [targetStore, setTargetStore] = useState('');
  const [items, setItems] = useState<FormItem[]>([{ ...EMPTY_FORM_ITEM }]);
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Product autocomplete state
  const [branchProducts, setBranchProducts] = useState<BranchProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  // Fetch products when target store changes
  useEffect(() => {
    if (!targetStore) {
      setBranchProducts([]);
      return;
    }
    let cancelled = false;
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('products')
          .select('id, product_name, category, unit')
          .eq('store_id', targetStore)
          .eq('active', true)
          .order('product_name');
        if (!cancelled && data) setBranchProducts(data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    };
    fetchProducts();
    return () => { cancelled = true; };
  }, [targetStore]);

  const resetForm = () => {
    setTargetStore('');
    setItems([{ ...EMPTY_FORM_ITEM }]);
    setNotes('');
    setPhotoUrl(null);
    setBranchProducts([]);
    setActiveDropdown(null);
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  const updateItem = (index: number, field: keyof FormItem, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const selectProduct = (index: number, product: BranchProduct) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        product_name: product.product_name,
        category: product.category || '',
        unit: product.unit || '',
      };
      return next;
    });
    setActiveDropdown(null);
  };

  const addItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_FORM_ITEM }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const isValid =
    targetStore &&
    items.length > 0 &&
    items.every((it) => it.product_name.trim() && Number(it.quantity) >= 1);

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsSubmitting(true);

    try {
      const body = {
        fromStoreId: currentStoreId,
        toStoreId: targetStore,
        items: items.map((it) => ({
          productName: it.product_name.trim(),
          category: it.category || null,
          quantity: Number(it.quantity),
          unit: it.unit || null,
        })),
        notes: notes.trim() || null,
        borrowerPhotoUrl: photoUrl,
      };

      const res = await fetch('/api/borrows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('createError'));
      }

      toast({ type: 'success', title: t('createSuccess') });
      handleClose();
      onSuccess();
    } catch (err) {
      toast({
        type: 'error',
        title: t('actionError'),
        message: err instanceof Error ? err.message : t('tryAgain'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableStores = stores.filter((s) => s.id !== currentStoreId);

  // Filter suggestions per item
  const getSuggestions = (query: string) => {
    if (!query.trim()) return branchProducts.slice(0, 20);
    const q = query.toLowerCase();
    return branchProducts.filter((p) => p.product_name.toLowerCase().includes(q));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('createBorrowTitle')}
      description={t('createBorrowDesc')}
      size="lg"
    >
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {/* Target store */}
        <Select
          label={t('targetStore')}
          options={availableStores.map((s) => ({
            value: s.id,
            label: `${s.store_name} (${s.store_code})`,
          }))}
          value={targetStore}
          onChange={(e) => {
            setTargetStore(e.target.value);
            // Reset items when switching branch
            setItems([{ ...EMPTY_FORM_ITEM }]);
          }}
          placeholder={t('selectStore')}
        />

        {/* Items */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('itemList')}
            {loadingProducts && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-teal-500" />
            )}
          </label>
          <div className="space-y-3">
            {items.map((item, idx) => {
              const suggestions = getSuggestions(item.product_name);
              const showDropdown = activeDropdown === idx && targetStore && suggestions.length > 0;

              return (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                      {t('itemNumber', { num: idx + 1 })}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {/* Product name with autocomplete */}
                    <div className="relative sm:col-span-2">
                      <Input
                        placeholder={targetStore ? t('productPlaceholder') : t('selectStorePlaceholder')}
                        value={item.product_name}
                        onChange={(e) => {
                          updateItem(idx, 'product_name', e.target.value);
                          setActiveDropdown(idx);
                        }}
                        onFocus={() => setActiveDropdown(idx)}
                        onBlur={() => {
                          // Delay to allow click on suggestion
                          setTimeout(() => setActiveDropdown(null), 200);
                        }}
                        disabled={!targetStore}
                      />
                      {showDropdown && (
                        <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                          {suggestions.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectProduct(idx, product)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-teal-50 dark:hover:bg-teal-900/20"
                            >
                              <span className="font-medium text-gray-900 dark:text-white">
                                {product.product_name}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {product.category || ''}{product.unit ? ` (${product.unit})` : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Input
                      placeholder={t('categoryPlaceholder')}
                      value={item.category}
                      onChange={(e) => updateItem(idx, 'category', e.target.value)}
                      disabled={!targetStore}
                    />
                    <Input
                      placeholder={t('unitPlaceholder')}
                      value={item.unit}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                      disabled={!targetStore}
                    />
                    <Input
                      type="number"
                      placeholder={t('quantityPlaceholder')}
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      disabled={!targetStore}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/20"
          >
            <Plus className="h-4 w-4" />
            {t('addItem')}
          </button>
        </div>

        {/* Photo (optional) */}
        <PhotoUpload
          value={photoUrl}
          onChange={setPhotoUrl}
          folder="borrows/request"
          label={t('createBorrowPhotoLabel')}
          compact
        />

        {/* Notes */}
        <Textarea
          label={t('notesLabel')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('notesPlaceholder')}
          rows={2}
        />
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={handleClose}>
          {t('cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={!isValid}
          icon={<Send className="h-4 w-4" />}
          className="bg-teal-500 hover:bg-teal-600 active:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
        >
          {t('submitBorrow')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Borrow Detail Sheet
// ---------------------------------------------------------------------------

function BorrowDetailSheet({
  borrow,
  tab,
  currentStoreId,
  onClose,
  onAction,
  t,
}: {
  borrow: BorrowWithDetails;
  tab: 'outgoing' | 'incoming';
  currentStoreId: string;
  onClose: () => void;
  onAction: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { user } = useAuthStore();
  const config = getVisualStatus(borrow, currentStoreId, t);

  const [isActing, setIsActing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [borrowerPhoto, setBorrowerPhoto] = useState<string | null>(borrow.borrower_photo_url);
  const [lenderPhoto, setLenderPhoto] = useState<string | null>(borrow.lender_photo_url);
  const [receivePhoto, setReceivePhoto] = useState<string | null>(null);
  const [returnPhoto, setReturnPhoto] = useState<string | null>(null);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnReceiptPhoto, setReturnReceiptPhoto] = useState<string | null>(null);
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(borrow.items.map((i) => [i.id, i.approved_quantity ?? i.quantity]))
  );

  const isBorrowerSide = borrow.from_store_id === currentStoreId;
  const isLenderSide = borrow.to_store_id === currentStoreId;

  const patchBorrow = async (
    payload: Record<string, unknown>,
    successMessage?: { title: string; type?: 'success' | 'warning' },
  ) => {
    setIsActing(true);
    try {
      const res = await fetch(`/api/borrows/${borrow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('actionError'));
      }
      if (successMessage) {
        toast({ type: successMessage.type ?? 'success', title: successMessage.title });
      }
      onAction();
    } catch (err) {
      toast({
        type: 'error',
        title: t('actionError'),
        message: err instanceof Error ? err.message : t('tryAgain'),
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleApprove = () => {
    if (!lenderPhoto) {
      toast({ type: 'warning', title: t('approvePhotoRequired') });
      return;
    }
    const approvedItems = borrow.items.map((i) => ({
      itemId: i.id,
      approvedQuantity: approvedQtys[i.id] ?? i.quantity,
    }));
    patchBorrow(
      { action: 'approve', lenderPhotoUrl: lenderPhoto, approvedItems },
      { title: t('approveSuccess') },
    );
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast({ type: 'warning', title: t('rejectReasonRequired') });
      return;
    }
    patchBorrow(
      { action: 'reject', reason: rejectionReason.trim() },
      { title: t('rejectSuccess'), type: 'warning' },
    );
  };

  const handleMarkReceived = () => {
    if (!receivePhoto) {
      toast({ type: 'warning', title: t('receivePhotoRequired') });
      return;
    }
    patchBorrow(
      { action: 'mark_received', photoUrl: receivePhoto },
      { title: t('markReceivedSuccess') },
    );
  };

  const handleCancel = () => {
    patchBorrow(
      { action: 'cancel' },
      { title: t('cancelSuccess'), type: 'warning' },
    );
  };

  const handleMarkReturned = () => {
    if (!returnPhoto) {
      toast({ type: 'warning', title: t('returnPhotoRequired') });
      return;
    }
    patchBorrow(
      {
        action: 'mark_returned',
        photoUrl: returnPhoto,
        returnNotes: returnNotes.trim() || undefined,
      },
      { title: t('markReturnedSuccess') },
    );
  };

  const handleConfirmReturnReceipt = () => {
    if (!returnReceiptPhoto) {
      toast({ type: 'warning', title: t('returnReceiptPhotoRequired') });
      return;
    }
    patchBorrow(
      { action: 'confirm_return_receipt', photoUrl: returnReceiptPhoto },
      { title: t('confirmReturnReceiptSuccess') },
    );
  };

  const handlePhotoUpload = (side: 'borrower' | 'lender', url: string | null) => {
    if (side === 'borrower') {
      setBorrowerPhoto(url);
      if (url) patchBorrow({ action: 'upload_photo', side: 'borrower', photoUrl: url });
    } else {
      setLenderPhoto(url);
      if (url) patchBorrow({ action: 'upload_photo', side: 'lender', photoUrl: url });
    }
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Sheet / Panel */}
      <div
        className={cn(
          'fixed z-50 bg-white dark:bg-gray-900 overflow-y-auto',
          // Mobile: bottom sheet — pb เผื่อ bottom nav
          'bottom-0 inset-x-0 rounded-t-2xl max-h-[85vh] pb-20',
          // Desktop: centered modal
          'md:inset-0 md:m-auto md:w-full md:max-w-2xl md:max-h-[85vh] md:rounded-2xl md:pb-0'
        )}
      >
        {/* Drag handle - mobile only */}
        <div className="sticky top-0 z-10 flex justify-center bg-white pt-3 pb-1 dark:bg-gray-900 md:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* Header — ใครยืมใคร ชัดเจน */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={config.variant as 'warning' | 'success' | 'danger' | 'info' | 'default'}>
                  {config.label}
                </Badge>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatThaiDateTime(borrow.created_at)}
                </span>
              </div>
              {borrow.borrow_code && (
                <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {borrow.borrow_code}
                </p>
              )}
              <h2 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                {t('borrowsFrom', {
                  from: borrow.from_store_name || t('unknownBranch'),
                  to: borrow.to_store_name || t('unknownBranch'),
                })}
              </h2>
              {borrow.requester_name && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('requester')} {borrow.requester_name}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Status Progress */}
          <StatusProgressBar status={borrow.status} isLender={isLenderSide} t={t} />

          {/* Store info — 2-column card */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-800 dark:bg-teal-900/10">
              <p className="text-[10px] font-medium uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-1">{t('borrowerLabel')}</p>
              <div className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                  {borrow.from_store_name || t('unknownBranch')}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-[10px]">
                <Camera className="h-3 w-3" />
                <span className={borrowerPhoto ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}>
                  {borrowerPhoto ? t('photoStatus') : t('photoStatusPending')}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-900/10">
              <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">{t('lenderLabel')}</p>
              <div className="flex items-center gap-1.5">
                <Store className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                  {borrow.to_store_name || t('unknownBranch')}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-[10px]">
                <Camera className="h-3 w-3" />
                <span className={lenderPhoto ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}>
                  {lenderPhoto ? t('photoStatus') : t('photoStatusPending')}
                </span>
              </div>
            </div>
          </div>

          {/* Requester */}
          {borrow.requester_name && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t('requester')} <span className="font-medium text-gray-700 dark:text-gray-300">{borrow.requester_name}</span>
            </div>
          )}

          {/* Items list */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('itemListLabel', { count: borrow.items.length })}
            </h3>
            <div className="space-y-2">
              {borrow.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.product_name}
                    </p>
                    {item.category && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">{item.category}</p>
                    )}
                    {item.notes && (
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {item.approved_quantity != null && item.approved_quantity !== item.quantity ? (
                      <div>
                        <span className="text-xs text-gray-400 line-through">{t('requestedQty', { qty: item.quantity })}</span>
                        <div>
                          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                            {t('approvedQty', { qty: item.approved_quantity })}
                          </span>
                          {item.unit && (
                            <span className="ml-1 text-xs text-gray-400">{item.unit}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">
                          {item.approved_quantity ?? item.quantity}
                        </span>
                        {item.unit && (
                          <span className="ml-1 text-xs text-gray-400">{item.unit}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {borrow.notes && (
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {t('notesTitle')}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{borrow.notes}</p>
            </div>
          )}

          {/* Photos */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('photos')}
            </h3>

            {/* Borrower photo — read-only display (upload handled by mark_received action section) */}
            <div>
              <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                {t('borrowerSide')}
              </p>
              {borrowerPhoto ? (
                <img
                  src={borrowerPhoto}
                  alt={t('borrowerPhoto')}
                  className="max-h-40 rounded-lg object-cover"
                />
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <Image className="h-4 w-4" />
                  {t('noPhoto')}
                </div>
              )}
            </div>

            {/* Lender photo — lender can upload while pending_approval */}
            <div>
              <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                {t('lenderSide')}
              </p>
              {isLenderSide && borrow.status === 'pending_approval' ? (
                <PhotoUpload
                  value={lenderPhoto}
                  onChange={(url) => handlePhotoUpload('lender', url)}
                  folder="borrows"
                  compact
                />
              ) : lenderPhoto ? (
                <img
                  src={lenderPhoto}
                  alt={t('lenderPhoto')}
                  className="max-h-40 rounded-lg object-cover"
                />
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <Image className="h-4 w-4" />
                  {t('noPhoto')}
                </div>
              )}
            </div>
          </div>

          {/* Rejection info */}
          {borrow.status === 'rejected' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                <XCircle className="h-4 w-4" />
                {t('rejected')}
              </div>
              {borrow.rejection_reason && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-300">
                  {t('rejectionReason', { reason: borrow.rejection_reason })}
                </p>
              )}
              {borrow.rejected_at && (
                <p className="mt-1 text-xs text-red-400 dark:text-red-500">
                  {formatThaiDateTime(borrow.rejected_at)}
                </p>
              )}
            </div>
          )}

          {/* Cancelled info */}
          {borrow.status === 'cancelled' && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
                <XCircle className="h-4 w-4" />
                {t('cancelled')}
              </div>
            </div>
          )}

          {/* Received — waiting for return (intermediate state, not fully completed) */}
          {borrow.status === 'completed' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                <Package className="h-4 w-4" />
                {t('statusReceivedAwaitingReturn')}
              </div>
              {borrow.completed_at && (
                <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80">
                  {formatThaiDateTime(borrow.completed_at)}
                </p>
              )}
            </div>
          )}

          {/* Fully completed — lender confirmed return receipt */}
          {borrow.status === 'returned' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {t('completedStatus')}
              </div>
              {borrow.return_received_at && (
                <p className="mt-1 text-xs text-emerald-500 dark:text-emerald-400">
                  {formatThaiDateTime(borrow.return_received_at)}
                </p>
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* Action buttons                                                     */}
          {/* ----------------------------------------------------------------- */}

          {/* INCOMING: lender actions */}
          {isLenderSide && borrow.status === 'pending_approval' && (
            <div className="space-y-3">
              {/* Approved qty per item */}
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('specifyApprovedQty')}
                </h3>
                <div className="space-y-2">
                  {borrow.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.product_name}</p>
                        <p className="text-xs text-gray-400">{t('requestedQty', { qty: item.quantity })} {item.unit || ''}</p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={approvedQtys[item.id] ?? item.quantity}
                        onChange={(e) => setApprovedQtys((prev) => ({ ...prev, [item.id]: Number(e.target.value) || 0 }))}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm font-medium dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {!showRejectInput ? (
                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={handleApprove}
                    isLoading={isActing}
                  >
                    {t('approve')}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="danger"
                    icon={<XCircle className="h-4 w-4" />}
                    onClick={() => setShowRejectInput(true)}
                  >
                    {t('reject')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder={t('rejectReasonPlaceholder')}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowRejectInput(false);
                        setRejectionReason('');
                      }}
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      onClick={handleReject}
                      isLoading={isActing}
                      disabled={!rejectionReason.trim()}
                    >
                      {t('confirmReject')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending: cancel (borrower) or waiting message */}
          {borrow.status === 'pending_approval' && (
            <div className="space-y-3">
              {isBorrowerSide && (
                <>
                  <div className="flex items-center gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
                    <Clock className="h-4 w-4" />
                    {t('waitingApproval', { store: borrow.to_store_name || '' })}
                  </div>
                  <Button
                    className="w-full"
                    variant="danger"
                    icon={<XCircle className="h-4 w-4" />}
                    onClick={handleCancel}
                    isLoading={isActing}
                  >
                    {t('cancelBorrow')}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Approved — borrower confirms receipt with a photo */}
          {(borrow.status === 'approved' || borrow.status === 'pos_adjusting') && (
            <div className="space-y-4">
              {/* ฝั่งผู้ยืม (borrower) — ถ่ายรูปสินค้าที่ได้รับ + กดยืนยัน = เสร็จ */}
              {isBorrowerSide && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>{t('receivePhotoDesc')}</span>
                  </div>
                  <PhotoUpload
                    value={receivePhoto}
                    onChange={setReceivePhoto}
                    folder="borrows/received"
                    label={t('receivePhotoLabel')}
                    compact
                  />
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={handleMarkReceived}
                    isLoading={isActing}
                    disabled={!receivePhoto}
                  >
                    {t('markAsReceived')}
                  </Button>
                </div>
              )}

              {/* ฝั่งผู้ให้ยืม (lender) — รอ borrower ยืนยันรับ */}
              {isLenderSide && (
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{t('waitingBorrowerReceive', { store: borrow.from_store_name || '' })}</span>
                </div>
              )}
            </div>
          )}

          {/* Completed — borrower should return items */}
          {borrow.status === 'completed' && (
            <div className="space-y-4">
              {/* Borrower side — return reminder + photo upload + confirm */}
              {isBorrowerSide && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t('returnReminder', { store: borrow.to_store_name || '' })}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>{t('returnPhotoDesc')}</span>
                  </div>
                  <PhotoUpload
                    value={returnPhoto}
                    onChange={setReturnPhoto}
                    folder="borrows/returned"
                    label={t('returnPhotoLabel')}
                    compact
                  />
                  <textarea
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    rows={2}
                    placeholder={t('returnNotesPlaceholder')}
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                  />
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={handleMarkReturned}
                    isLoading={isActing}
                    disabled={!returnPhoto}
                  >
                    {t('markAsReturned')}
                  </Button>
                </div>
              )}

              {/* Lender side — waiting for borrower to return */}
              {isLenderSide && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{t('returnReminder', { store: borrow.from_store_name || '' })}</span>
                </div>
              )}
            </div>
          )}

          {/* Return pending — borrower sent, lender must confirm receipt with photo */}
          {borrow.status === 'return_pending' && (
            <div className="space-y-4">
              {/* Show borrower-side sent photo summary */}
              {borrow.return_photo_url && (
                <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-900/10">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    {t('returnPhotoLabel')}
                  </p>
                  <div className="mt-2">
                    <img
                      src={borrow.return_photo_url}
                      alt="Return photo"
                      className="h-24 w-auto rounded-lg object-cover border border-blue-200 dark:border-blue-800"
                    />
                  </div>
                  {borrow.return_notes && (
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      {borrow.return_notes}
                    </p>
                  )}
                </div>
              )}

              {/* Lender side — confirm receipt with photo */}
              {isLenderSide && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t('returnReceiptReminder', { store: borrow.from_store_name || '' })}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>{t('returnReceiptPhotoDesc')}</span>
                  </div>
                  <PhotoUpload
                    value={returnReceiptPhoto}
                    onChange={setReturnReceiptPhoto}
                    folder="borrows/return-receipt"
                    label={t('returnReceiptPhotoLabel')}
                    compact
                  />
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={handleConfirmReturnReceipt}
                    isLoading={isActing}
                    disabled={!returnReceiptPhoto}
                  >
                    {t('confirmReturnReceipt')}
                  </Button>
                </div>
              )}

              {/* Borrower side — waiting for lender to confirm receipt */}
              {isBorrowerSide && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{t('waitingLenderReceipt', { store: borrow.to_store_name || '' })}</span>
                </div>
              )}
            </div>
          )}

          {/* Returned — show success state (both photos) */}
          {borrow.status === 'returned' && (
            <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-900/10">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-5 w-5" />
                <span>{t('returnedStatus')}</span>
              </div>
              {borrow.return_received_at && (
                <p className="mt-1 text-xs text-emerald-600/70 dark:text-emerald-400/70">
                  {t('returnReceivedAt', { date: formatThaiDateTime(borrow.return_received_at) })}
                </p>
              )}
              {borrow.return_notes && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {borrow.return_notes}
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {borrow.return_photo_url && (
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {t('returnPhotoLabel')}
                    </p>
                    <img
                      src={borrow.return_photo_url}
                      alt="Return photo"
                      className="h-28 w-full rounded-lg object-cover border border-emerald-200 dark:border-emerald-800"
                    />
                  </div>
                )}
                {borrow.return_receipt_photo_url && (
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {t('returnReceiptPhotoLabel')}
                    </p>
                    <img
                      src={borrow.return_receipt_photo_url}
                      alt="Return receipt photo"
                      className="h-28 w-full rounded-lg object-cover border border-emerald-200 dark:border-emerald-800"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BorrowPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const t = useTranslations('borrow');
  const tCommon = useTranslations('common');

  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>('outgoing');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [borrows, setBorrows] = useState<BorrowWithDetails[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBorrow, setSelectedBorrow] = useState<BorrowWithDetails | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'kanban' | 'table'>('kanban');

  // -----------------------------------------------------------------------
  // Fetch borrows — direct Supabase client (skip API route for speed)
  // -----------------------------------------------------------------------

  const fetchBorrows = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    try {
      const supabase = createClient();

      let query = supabase
        .from('borrows')
        .select(`
          *,
          borrow_items (*),
          from_store:stores!borrows_from_store_id_fkey (id, store_name, store_code),
          to_store:stores!borrows_to_store_id_fkey (id, store_name, store_code),
          requester:profiles!borrows_requested_by_fkey (id, display_name),
          approver:profiles!borrows_approved_by_fkey (id, display_name)
        `)
        .order('created_at', { ascending: false });

      if (activeTab === 'incoming') {
        query = query.eq('to_store_id', currentStoreId);
      } else {
        query = query.eq('from_store_id', currentStoreId);
      }

      const { data } = await query;

      if (data) {
        const mapped: BorrowWithDetails[] = data.map((b: Record<string, unknown>) => {
          const fromStore = b.from_store as Record<string, string> | null;
          const toStore = b.to_store as Record<string, string> | null;
          const req = b.requester as Record<string, string> | null;
          const appr = b.approver as Record<string, string> | null;
          const items = b.borrow_items as BorrowItem[];
          const { from_store: _f, to_store: _t, requester: _r, approver: _a, borrow_items: _bi, ...rest } = b;
          return {
            ...rest,
            from_store_name: fromStore?.store_name || null,
            to_store_name: toStore?.store_name || null,
            requester_name: req?.display_name || null,
            approver_name: appr?.display_name || null,
            items: items || [],
          } as BorrowWithDetails;
        });
        setBorrows(mapped);
      }
    } catch {
      // silently ignore — user will see empty state
    } finally {
      setIsLoading(false);
    }
  }, [currentStoreId, activeTab]);

  // -----------------------------------------------------------------------
  // Fetch stores
  // -----------------------------------------------------------------------

  const fetchStores = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id, store_name, store_code')
      .eq('active', true)
      .order('store_name');
    if (data) setStores(data);
  }, []);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  useEffect(() => {
    fetchBorrows();
  }, [fetchBorrows]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // -----------------------------------------------------------------------
  // Realtime
  // -----------------------------------------------------------------------

  useRealtime({
    table: 'borrows',
    onInsert: () => fetchBorrows(),
    onUpdate: () => fetchBorrows(),
    enabled: !!currentStoreId,
  });

  // -----------------------------------------------------------------------
  // Refresh detail after action
  // -----------------------------------------------------------------------

  const handleDetailAction = useCallback(async () => {
    await fetchBorrows();
    if (selectedBorrow) {
      try {
        const res = await fetch(`/api/borrows/${selectedBorrow.id}`);
        if (res.ok) {
          const updated = await res.json();
          setSelectedBorrow(updated);
        } else {
          setSelectedBorrow(null);
        }
      } catch {
        setSelectedBorrow(null);
      }
    }
  }, [fetchBorrows, selectedBorrow]);

  // -----------------------------------------------------------------------
  // Computed
  // -----------------------------------------------------------------------

  const pendingCount = borrows.filter((b) => b.status === 'pending_approval').length;
  const isWaitingReceive = (b: BorrowWithDetails) =>
    b.status === 'approved' || b.status === 'pos_adjusting';
  const waitingReceiveCount = borrows.filter(isWaitingReceive).length;

  const isWaitingReturn = (b: BorrowWithDetails) =>
    b.status === 'completed' || b.status === 'return_pending';
  const waitingReturnCount = borrows.filter(isWaitingReturn).length;

  const currentStoreName =
    stores.find((s) => s.id === currentStoreId)?.store_name || '';

  // Sub-tab definitions (4-step flow + completed + cancelled)
  const subTabs = [
    { key: 'all', label: t('subAll') },
    { key: 'pending_approval', label: t('subPendingApproval') },
    { key: 'waiting_receive', label: t('subWaitingReceive') },
    { key: 'waiting_return', label: t('subWaitingReturn') },
    { key: 'returned', label: t('statusReturned') },
    { key: 'cancelled_rejected', label: t('subCancelled') },
  ];

  const filteredBorrows = borrows.filter((b) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'cancelled_rejected') return b.status === 'cancelled' || b.status === 'rejected';
    if (statusFilter === 'waiting_receive') return isWaitingReceive(b);
    if (statusFilter === 'waiting_return') return isWaitingReturn(b);
    if (statusFilter === 'returned') return b.status === 'returned';
    return b.status === statusFilter;
  });

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                             */}
      {/* ----------------------------------------------------------------- */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('title')}
        </h1>
        {currentStoreName && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {currentStoreName}
          </p>
        )}
      </div>

      {/* View Switcher (Desktop only) */}
      <div className="hidden md:flex items-center justify-between gap-4">
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          <button 
            onClick={() => setViewMode('kanban')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
              viewMode === 'kanban' ? "bg-white text-teal-600 shadow-sm dark:bg-gray-700 dark:text-teal-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
            )}
          >
            <ColumnsIcon className="h-3.5 w-3.5" />
            Dashboard
          </button>
          <button 
            onClick={() => setViewMode('table')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
              viewMode === 'table' ? "bg-white text-teal-600 shadow-sm dark:bg-gray-700 dark:text-teal-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
            )}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Table
          </button>
          <button 
            onClick={() => setViewMode('cards')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
              viewMode === 'cards' ? "bg-white text-teal-600 shadow-sm dark:bg-gray-700 dark:text-teal-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cards
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Summary cards                                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {pendingCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('pendingApprovalCount')}
              </p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30">
              <AlertCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {waitingReceiveCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('waitingReceiveCount')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Waiting return count — show when there are items to return */}
      {waitingReturnCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">
              {t('waitingReturnCount')}: {t('itemCount', { count: waitingReturnCount })}
            </span>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Tabs                                                               */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => { setActiveTab('outgoing'); setStatusFilter('all'); }}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'outgoing'
              ? 'bg-teal-500 text-white shadow-sm dark:bg-teal-600'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          )}
        >
          <Send className="h-4 w-4" />
          <span className="sm:hidden">{t('tabOutgoing')}</span>
          <span className="hidden sm:inline">{t('tabOutgoingFull')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('incoming'); setStatusFilter('all'); }}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'incoming'
              ? 'bg-indigo-500 text-white shadow-sm dark:bg-indigo-600'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          )}
        >
          <Package className="h-4 w-4" />
          <span className="sm:hidden">{t('tabIncoming')}</span>
          <span className="hidden sm:inline">{t('tabIncomingFull')}</span>
        </button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Status sub-tabs                                                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex gap-2 overflow-x-auto">
        {subTabs.map((st) => {
          const count = st.key === 'all'
            ? borrows.length
            : st.key === 'cancelled_rejected'
              ? borrows.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length
              : st.key === 'waiting_receive'
                ? borrows.filter(isWaitingReceive).length
                : st.key === 'waiting_return'
                  ? borrows.filter(isWaitingReturn).length
                  : borrows.filter((b) => b.status === st.key).length;
          return (
            <button
              key={st.key}
              type="button"
              onClick={() => setStatusFilter(st.key)}
              className={cn(
                'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === st.key
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              )}
            >
              {st.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Borrow list                                                        */}
      {/* ----------------------------------------------------------------- */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
        </div>
      ) : filteredBorrows.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title={statusFilter === 'all' ? t('noItems') : t('noItemsFiltered', { label: subTabs.find((s) => s.key === statusFilter)?.label || '' })}
          description={
            activeTab === 'outgoing' && statusFilter === 'all'
              ? t('noOutgoingDesc')
              : activeTab === 'incoming' && statusFilter === 'all'
                ? t('noIncomingDesc')
                : undefined
          }
          action={
            activeTab === 'outgoing' && statusFilter === 'all' ? (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setShowCreateModal(true)}
                className="bg-teal-500 hover:bg-teal-600 active:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
              >
                {t('createBorrow')}
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === 'kanban' ? (
        <div className={cn(
          "grid gap-4 items-start h-auto md:h-[calc(100vh-320px)] min-h-[500px]",
          statusFilter === 'all' || ['pending_approval', 'waiting_receive', 'waiting_return'].includes(statusFilter)
            ? "grid-cols-1 md:grid-cols-3"
            : "grid-cols-1"
        )}>
          {/* Column 1: Pending */}
          {(statusFilter === 'all' || statusFilter === 'pending_approval') && (
            <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('subPendingApproval')}</span>
                </div>
                <Badge variant="warning">{filteredBorrows.filter(b => b.status === 'pending_approval').length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto md:overflow-y-auto p-2 space-y-2 max-h-[500px] md:max-h-none">
                {filteredBorrows.filter(b => b.status === 'pending_approval').map(b => (
                  <BorrowCard key={b.id} borrow={b} tab={activeTab} currentStoreId={currentStoreId!} onClick={() => setSelectedBorrow(b)} t={t} />
                ))}
                {filteredBorrows.filter(b => b.status === 'pending_approval').length === 0 && <p className="text-center py-8 text-xs text-gray-400 italic">{t('noItems')}</p>}
              </div>
            </div>
          )}

          {/* Column 2: In Progress (Receive) */}
          {(statusFilter === 'all' || statusFilter === 'waiting_receive') && (
            <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-500" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('subWaitingReceive')}</span>
                </div>
                <Badge variant="info">{filteredBorrows.filter(isWaitingReceive).length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto md:overflow-y-auto p-2 space-y-2 max-h-[500px] md:max-h-none">
                {filteredBorrows.filter(isWaitingReceive).map(b => (
                  <BorrowCard key={b.id} borrow={b} tab={activeTab} currentStoreId={currentStoreId!} onClick={() => setSelectedBorrow(b)} t={t} />
                ))}
                {filteredBorrows.filter(isWaitingReceive).length === 0 && <p className="text-center py-8 text-xs text-gray-400 italic">{t('noItems')}</p>}
              </div>
            </div>
          )}

          {/* Column 3: To Return */}
          {(statusFilter === 'all' || statusFilter === 'waiting_return') && (
            <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('subWaitingReturn')}</span>
                </div>
                <Badge variant="default">{filteredBorrows.filter(isWaitingReturn).length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto md:overflow-y-auto p-2 space-y-2 max-h-[500px] md:max-h-none">
                {filteredBorrows.filter(isWaitingReturn).map(b => (
                  <BorrowCard key={b.id} borrow={b} tab={activeTab} currentStoreId={currentStoreId!} onClick={() => setSelectedBorrow(b)} t={t} />
                ))}
                {filteredBorrows.filter(isWaitingReturn).length === 0 && <p className="text-center py-8 text-xs text-gray-400 italic">{t('noItems')}</p>}
              </div>
            </div>
          )}

          {/* Column 4: Returned (Special) */}
          {statusFilter === 'returned' && (
            <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('statusReturned')}</span>
                </div>
                <Badge variant="success">{filteredBorrows.filter(b => b.status === 'returned').length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto md:overflow-y-auto p-2 space-y-2 max-h-[500px] md:max-h-none">
                {filteredBorrows.filter(b => b.status === 'returned').map(b => (
                  <BorrowCard key={b.id} borrow={b} tab={activeTab} currentStoreId={currentStoreId!} onClick={() => setSelectedBorrow(b)} t={t} />
                ))}
                {filteredBorrows.filter(b => b.status === 'returned').length === 0 && <p className="text-center py-8 text-xs text-gray-400 italic">{t('noItems')}</p>}
              </div>
            </div>
          )}

          {/* Column 5: Cancelled/Rejected (Special) */}
          {statusFilter === 'cancelled_rejected' && (
            <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('subCancelled')}</span>
                </div>
                <Badge variant="danger">{filteredBorrows.filter(b => b.status === 'cancelled' || b.status === 'rejected').length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto md:overflow-y-auto p-2 space-y-2 max-h-[500px] md:max-h-none">
                {filteredBorrows.filter(b => b.status === 'cancelled' || b.status === 'rejected').map(b => (
                  <BorrowCard key={b.id} borrow={b} tab={activeTab} currentStoreId={currentStoreId!} onClick={() => setSelectedBorrow(b)} t={t} />
                ))}
                {filteredBorrows.filter(b => b.status === 'cancelled' || b.status === 'rejected').length === 0 && <p className="text-center py-8 text-xs text-gray-400 italic">{t('noItems')}</p>}
              </div>
            </div>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{tCommon('date')}</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{t('branch')}</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{t('itemList')}</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-center">{tCommon('status')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filteredBorrows.map(b => {
                const config = getStatusConfig(t)[b.status];
                return (
                  <tr key={b.id} onClick={() => setSelectedBorrow(b)} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors group">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatThaiDate(b.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="truncate max-w-[120px]">{b.from_store_name}</span>
                        <ArrowRightLeft className="h-3 w-3 text-teal-500 flex-shrink-0" />
                        <span className="truncate max-w-[120px]">{b.to_store_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 truncate max-w-[300px]">
                      {b.items.map(it => `${it.product_name} x${it.quantity}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={config.variant as any} size="sm">{config.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 transition-all group-hover:translate-x-1 inline" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredBorrows.map((borrow) => (
            <BorrowCard
              key={borrow.id}
              borrow={borrow}
              tab={activeTab}
              currentStoreId={currentStoreId!}
              onClick={() => setSelectedBorrow(borrow)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* FAB -- only visible in outgoing tab                                */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 'outgoing' && borrows.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/30 transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6 sm:h-auto sm:w-auto sm:gap-2 sm:rounded-xl sm:px-5 sm:py-3"
        >
          <Plus className="h-6 w-6 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline text-sm font-medium">
            {t('createBorrow')}
          </span>
        </button>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Create borrow modal                                                */}
      {/* ----------------------------------------------------------------- */}
      {currentStoreId && (
        <CreateBorrowModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          stores={stores}
          currentStoreId={currentStoreId}
          onSuccess={fetchBorrows}
          t={t}
        />
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Borrow detail sheet                                                */}
      {/* ----------------------------------------------------------------- */}
      {selectedBorrow && currentStoreId && (
        <BorrowDetailSheet
          borrow={selectedBorrow}
          tab={activeTab}
          currentStoreId={currentStoreId}
          onClose={() => setSelectedBorrow(null)}
          onAction={handleDetailAction}
          t={t}
        />
      )}
    </div>
  );
}
