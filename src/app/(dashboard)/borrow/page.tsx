'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
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
import { formatThaiDateTime } from '@/lib/utils/format';
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
  from_store_id: string;
  to_store_id: string;
  requested_by: string | null;
  status: 'pending_approval' | 'approved' | 'pos_adjusting' | 'completed' | 'rejected' | 'cancelled';
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

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

function isNew(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 5 * 60 * 1000;
}

const statusConfig: Record<
  BorrowWithDetails['status'],
  { label: string; variant: 'warning' | 'info' | 'default' | 'success' | 'danger'; step: number }
> = {
  pending_approval: { label: 'รออนุมัติ', variant: 'warning', step: 0 },
  approved: { label: 'อนุมัติแล้ว', variant: 'info', step: 1 },
  pos_adjusting: { label: 'รอตัดสต๊อก', variant: 'default', step: 2 },
  completed: { label: 'เสร็จสิ้น', variant: 'success', step: 3 },
  rejected: { label: 'ปฏิเสธ', variant: 'danger', step: -1 },
  cancelled: { label: 'ยกเลิก', variant: 'danger', step: -1 },
};

/**
 * สถานะจากมุมมองของฝั่งที่กำลังดู:
 * ถ้าฝั่งเราตัด POS แล้ว → แสดงเป็น "เสร็จสิ้น" แม้อีกฝั่งยังไม่ได้ทำ
 */
function getVisualStatus(
  borrow: BorrowWithDetails,
  currentStoreId: string,
): { label: string; variant: 'warning' | 'info' | 'default' | 'success' | 'danger'; step: number } {
  const isBorrowerSide = borrow.from_store_id === currentStoreId;
  const isLenderSide = borrow.to_store_id === currentStoreId;

  // ถ้าสถานะเป็น pos_adjusting แต่ฝั่งเราตัดแล้ว → แสดงเป็นเสร็จสิ้น
  if (borrow.status === 'pos_adjusting' || borrow.status === 'approved') {
    if (isBorrowerSide && borrow.borrower_pos_confirmed) {
      return { label: 'เสร็จสิ้น (ฝั่งเรา)', variant: 'success', step: 3 };
    }
    if (isLenderSide && borrow.lender_pos_confirmed) {
      return { label: 'เสร็จสิ้น (ฝั่งเรา)', variant: 'success', step: 3 };
    }
  }

  return statusConfig[borrow.status];
}

const EMPTY_FORM_ITEM: FormItem = { product_name: '', category: '', quantity: '', unit: '' };

// ---------------------------------------------------------------------------
// Status progress bar
// ---------------------------------------------------------------------------

function StatusProgressBar({
  status,
}: {
  status: BorrowWithDetails['status'];
}) {
  const steps = ['ส่งคำขอ', 'อนุมัติ', 'ตัดสต๊อก POS', 'เสร็จสิ้น'];
  const isRejected = status === 'rejected';
  const currentStep = statusConfig[status].step;

  return (
    <div className="flex items-center gap-1">
      {steps.map((label, i) => {
        const isCompleted = !isRejected && currentStep >= i;
        const isCurrent = !isRejected && currentStep === i;
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
}: {
  borrow: BorrowWithDetails;
  tab: 'outgoing' | 'incoming';
  currentStoreId: string;
  onClick: () => void;
}) {
  const config = getVisualStatus(borrow, currentStoreId);
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
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Store className="h-4 w-4 shrink-0 text-teal-500" />
            <span className="font-medium truncate max-w-[180px] sm:max-w-none">
              {otherStore || 'ไม่ทราบสาขา'}
            </span>
          </div>
          <Badge variant={config.variant as 'warning' | 'success' | 'danger' | 'info' | 'default'} size="sm">
            {config.label}
          </Badge>
        </div>

        {/* Items summary */}
        <p className="mt-2 text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
          <span className="font-medium text-teal-600 dark:text-teal-400">{totalItems} รายการ:</span>{' '}
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
            <span>{relativeTime(borrow.created_at)}</span>
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
}: {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreOption[];
  currentStoreId: string;
  onSuccess: () => void;
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
        throw new Error(data.error || 'ไม่สามารถสร้างคำขอยืมได้');
      }

      toast({ type: 'success', title: 'สร้างคำขอยืมสำเร็จ' });
      handleClose();
      onSuccess();
    } catch (err) {
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: err instanceof Error ? err.message : 'ลองอีกครั้ง',
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
      title="สร้างคำขอยืม"
      description="ส่งคำขอยืมสินค้าจากสาขาอื่น"
      size="lg"
    >
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {/* Target store */}
        <Select
          label="สาขาที่ต้องการยืม"
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
          placeholder="เลือกสาขา"
        />

        {/* Items */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            รายการสินค้า
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
                      รายการที่ {idx + 1}
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
                        placeholder={targetStore ? 'พิมพ์ชื่อสินค้า *' : 'เลือกสาขาก่อน *'}
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
                      placeholder="หมวดหมู่"
                      value={item.category}
                      onChange={(e) => updateItem(idx, 'category', e.target.value)}
                      disabled={!targetStore}
                    />
                    <Input
                      placeholder="หน่วย"
                      value={item.unit}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                      disabled={!targetStore}
                    />
                    <Input
                      type="number"
                      placeholder="จำนวน *"
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
            เพิ่มรายการ
          </button>
        </div>

        {/* Notes */}
        <Textarea
          label="หมายเหตุ"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ระบุเหตุผลการยืม (ถ้ามี)"
          rows={2}
        />

        {/* Photo */}
        <PhotoUpload
          value={photoUrl}
          onChange={setPhotoUrl}
          folder="borrows"
          label="รูปถ่ายสินค้า"
          compact
        />
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={handleClose}>
          ยกเลิก
        </Button>
        <Button
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={!isValid}
          icon={<Send className="h-4 w-4" />}
          className="bg-teal-500 hover:bg-teal-600 active:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
        >
          ส่งคำขอยืม
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
}: {
  borrow: BorrowWithDetails;
  tab: 'outgoing' | 'incoming';
  currentStoreId: string;
  onClose: () => void;
  onAction: () => void;
}) {
  const { user } = useAuthStore();
  const config = getVisualStatus(borrow, currentStoreId);

  const [isActing, setIsActing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [borrowerPhoto, setBorrowerPhoto] = useState<string | null>(borrow.borrower_photo_url);
  const [lenderPhoto, setLenderPhoto] = useState<string | null>(borrow.lender_photo_url);
  const [posBillUrl, setPosBillUrl] = useState<string | null>(null);
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(borrow.items.map((i) => [i.id, i.approved_quantity ?? i.quantity]))
  );

  const isBorrowerSide = borrow.from_store_id === currentStoreId;
  const isLenderSide = borrow.to_store_id === currentStoreId;

  const patchBorrow = async (payload: Record<string, unknown>) => {
    setIsActing(true);
    try {
      const res = await fetch(`/api/borrows/${borrow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'ดำเนินการไม่สำเร็จ');
      }
      onAction();
    } catch (err) {
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: err instanceof Error ? err.message : 'ลองอีกครั้ง',
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleApprove = () => {
    if (!lenderPhoto) {
      toast({ type: 'warning', title: 'กรุณาแนบรูปถ่ายก่อนอนุมัติ' });
      return;
    }
    const approvedItems = borrow.items.map((i) => ({
      itemId: i.id,
      approvedQuantity: approvedQtys[i.id] ?? i.quantity,
    }));
    toast({ type: 'success', title: 'อนุมัติคำขอยืมแล้ว' });
    patchBorrow({ action: 'approve', lenderPhotoUrl: lenderPhoto, approvedItems });
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast({ type: 'warning', title: 'กรุณาระบุเหตุผลการปฏิเสธ' });
      return;
    }
    toast({ type: 'warning', title: 'ปฏิเสธคำขอยืมแล้ว' });
    patchBorrow({ action: 'reject', reason: rejectionReason.trim() });
  };

  const handleConfirmPos = (side: 'borrower' | 'lender') => {
    if (!posBillUrl) {
      toast({ type: 'warning', title: 'กรุณาแนบรูป POS bill ก่อนยืนยัน' });
      return;
    }
    toast({ type: 'success', title: 'ยืนยันตัดสต๊อก POS แล้ว' });
    patchBorrow({ action: 'confirm_pos', side, posBillUrl });
  };

  const handleCancel = () => {
    toast({ type: 'warning', title: 'ยกเลิกคำขอยืมแล้ว' });
    patchBorrow({ action: 'cancel' });
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
          {/* Header */}
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
              <h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                รายละเอียดการยืม
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Status Progress */}
          <StatusProgressBar status={borrow.status} />

          {/* Store info */}
          <div className="flex items-center gap-3 rounded-xl bg-teal-50 p-4 dark:bg-teal-900/10">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {borrow.from_store_name || 'ไม่ทราบ'}
              </span>
            </div>
            <ArrowRightLeft className="h-4 w-4 text-teal-500" />
            <div className="flex items-center gap-2 text-sm">
              <Store className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {borrow.to_store_name || 'ไม่ทราบ'}
              </span>
            </div>
          </div>

          {/* Requester */}
          {borrow.requester_name && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              ผู้ขอ: <span className="font-medium text-gray-700 dark:text-gray-300">{borrow.requester_name}</span>
            </div>
          )}

          {/* Items list */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              รายการสินค้า ({borrow.items.length})
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
                        <span className="text-xs text-gray-400 line-through">ขอ {item.quantity}</span>
                        <div>
                          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                            ได้ {item.approved_quantity}
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
                หมายเหตุ
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{borrow.notes}</p>
            </div>
          )}

          {/* Photos */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              รูปถ่าย
            </h3>

            {/* Borrower photo */}
            <div>
              <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                ฝั่งผู้ยืม
              </p>
              {isBorrowerSide && (borrow.status === 'approved' || borrow.status === 'pos_adjusting') ? (
                <PhotoUpload
                  value={borrowerPhoto}
                  onChange={(url) => handlePhotoUpload('borrower', url)}
                  folder="borrows"
                  compact
                />
              ) : borrowerPhoto ? (
                <img
                  src={borrowerPhoto}
                  alt="รูปฝั่งผู้ยืม"
                  className="max-h-40 rounded-lg object-cover"
                />
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <Image className="h-4 w-4" />
                  ยังไม่มีรูป
                </div>
              )}
            </div>

            {/* Lender photo */}
            <div>
              <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                ฝั่งผู้ให้ยืม
              </p>
              {isLenderSide && (borrow.status === 'pending_approval' || borrow.status === 'approved' || borrow.status === 'pos_adjusting') ? (
                <PhotoUpload
                  value={lenderPhoto}
                  onChange={(url) => handlePhotoUpload('lender', url)}
                  folder="borrows"
                  compact
                />
              ) : lenderPhoto ? (
                <img
                  src={lenderPhoto}
                  alt="รูปฝั่งผู้ให้ยืม"
                  className="max-h-40 rounded-lg object-cover"
                />
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <Image className="h-4 w-4" />
                  ยังไม่มีรูป
                </div>
              )}
            </div>
          </div>

          {/* Rejection info */}
          {borrow.status === 'rejected' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                <XCircle className="h-4 w-4" />
                ปฏิเสธแล้ว
              </div>
              {borrow.rejection_reason && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-300">
                  เหตุผล: {borrow.rejection_reason}
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
                ยกเลิกแล้ว
              </div>
            </div>
          )}

          {/* Completion info */}
          {borrow.status === 'completed' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                เสร็จสิ้นแล้ว
              </div>
              {borrow.completed_at && (
                <p className="mt-1 text-xs text-emerald-500 dark:text-emerald-400">
                  {formatThaiDateTime(borrow.completed_at)}
                </p>
              )}
              <div className="mt-2 space-y-1 text-xs text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-1.5">
                  <Check className="h-3 w-3" />
                  ฝั่งผู้ยืมตัดสต๊อกแล้ว
                  {borrow.borrower_pos_confirmed_at && (
                    <span className="text-emerald-400">
                      ({formatThaiDateTime(borrow.borrower_pos_confirmed_at)})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="h-3 w-3" />
                  ฝั่งผู้ให้ยืมตัดสต๊อกแล้ว
                  {borrow.lender_pos_confirmed_at && (
                    <span className="text-emerald-400">
                      ({formatThaiDateTime(borrow.lender_pos_confirmed_at)})
                    </span>
                  )}
                </div>
              </div>
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
                  ระบุจำนวนที่อนุมัติ
                </h3>
                <div className="space-y-2">
                  {borrow.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.product_name}</p>
                        <p className="text-xs text-gray-400">ขอ {item.quantity} {item.unit || ''}</p>
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
                    อนุมัติ
                  </Button>
                  <Button
                    className="flex-1"
                    variant="danger"
                    icon={<XCircle className="h-4 w-4" />}
                    onClick={() => setShowRejectInput(true)}
                  >
                    ปฏิเสธ
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="ระบุเหตุผลการปฏิเสธ..."
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
                      ยกเลิก
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      onClick={handleReject}
                      isLoading={isActing}
                      disabled={!rejectionReason.trim()}
                    >
                      ยืนยันปฏิเสธ
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
                    รออนุมัติจากสาขา {borrow.to_store_name || ''}
                  </div>
                  <Button
                    className="w-full"
                    variant="danger"
                    icon={<XCircle className="h-4 w-4" />}
                    onClick={handleCancel}
                    isLoading={isActing}
                  >
                    ยกเลิกคำขอยืม
                  </Button>
                </>
              )}
            </div>
          )}

          {/* POS confirm — each side uploads POS bill + confirms */}
          {(borrow.status === 'approved' || borrow.status === 'pos_adjusting') && (
            <div className="space-y-4">
              {/* ฝั่งผู้ให้ยืม (lender) */}
              {isLenderSide && (
                <div className="space-y-3">
                  {borrow.lender_pos_confirmed ? (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      ฝั่งผู้ให้ยืม ({borrow.to_store_name}) ตัดสต๊อกแล้ว
                    </div>
                  ) : (
                    <>
                      <PhotoUpload
                        value={posBillUrl}
                        onChange={setPosBillUrl}
                        folder="borrows/pos-bills"
                        label="รูป POS bill (ฝั่งผู้ให้ยืม)"
                        compact
                      />
                      <Button
                        className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 dark:bg-purple-500 dark:hover:bg-purple-600"
                        icon={<Check className="h-4 w-4" />}
                        onClick={() => handleConfirmPos('lender')}
                        isLoading={isActing}
                        disabled={!posBillUrl}
                      >
                        ยืนยันตัดสต๊อก POS (ฝั่งผู้ให้ยืม)
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* ฝั่งผู้ยืม (borrower) */}
              {isBorrowerSide && (
                <div className="space-y-3">
                  {borrow.borrower_pos_confirmed ? (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      ฝั่งผู้ยืม ({borrow.from_store_name}) ตัดสต๊อกแล้ว
                    </div>
                  ) : (
                    <>
                      <PhotoUpload
                        value={posBillUrl}
                        onChange={setPosBillUrl}
                        folder="borrows/pos-bills"
                        label="รูป POS bill (ฝั่งผู้ยืม)"
                        compact
                      />
                      <Button
                        className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                        icon={<Check className="h-4 w-4" />}
                        onClick={() => handleConfirmPos('borrower')}
                        isLoading={isActing}
                        disabled={!posBillUrl}
                      >
                        ยืนยันตัดสต๊อก POS (ฝั่งผู้ยืม)
                    </Button>
                  )}
                </div>
              )}
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

  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>('outgoing');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [borrows, setBorrows] = useState<BorrowWithDetails[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBorrow, setSelectedBorrow] = useState<BorrowWithDetails | null>(null);

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
  const isOurSidePending = (b: BorrowWithDetails) => {
    if (activeTab === 'outgoing') return !b.borrower_pos_confirmed;
    return !b.lender_pos_confirmed;
  };
  const posWaitingCount = borrows.filter((b) =>
    (b.status === 'approved' || b.status === 'pos_adjusting') && isOurSidePending(b)
  ).length;

  const currentStoreName =
    stores.find((s) => s.id === currentStoreId)?.store_name || '';

  // Sub-tab definitions per main tab
  const outgoingSubTabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'pending_approval', label: 'รออนุมัติ' },
    { key: 'pos_waiting', label: 'รอตัดสต๊อก' },
    { key: 'completed', label: 'ยืมสำเร็จ' },
    { key: 'cancelled_rejected', label: 'ยกเลิก' },
  ];
  const incomingSubTabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'pending_approval', label: 'รออนุมัติ' },
    { key: 'pos_waiting', label: 'รอตัดสต๊อก' },
    { key: 'completed', label: 'เสร็จสิ้น' },
    { key: 'cancelled_rejected', label: 'ยกเลิก' },
  ];
  const subTabs = activeTab === 'outgoing' ? outgoingSubTabs : incomingSubTabs;

  // Helper: check if our side has completed POS
  const isOurSideDone = (b: BorrowWithDetails) => {
    if (activeTab === 'outgoing') return b.borrower_pos_confirmed;
    return b.lender_pos_confirmed;
  };

  const filteredBorrows = borrows.filter((b) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'cancelled_rejected') return b.status === 'cancelled' || b.status === 'rejected';
    if (statusFilter === 'pos_waiting') {
      return (b.status === 'approved' || b.status === 'pos_adjusting') && !isOurSideDone(b);
    }
    if (statusFilter === 'completed') {
      return b.status === 'completed' || ((b.status === 'approved' || b.status === 'pos_adjusting') && isOurSideDone(b));
    }
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
          ยืมสินค้า
        </h1>
        {currentStoreName && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {currentStoreName}
          </p>
        )}
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
                รออนุมัติ
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
                {posWaitingCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                รอตัดสต๊อก POS
              </p>
            </div>
          </div>
        </Card>
      </div>

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
          <span className="sm:hidden">ขอยืม</span>
          <span className="hidden sm:inline">รายการขอยืม</span>
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
          <span className="sm:hidden">ให้ยืม</span>
          <span className="hidden sm:inline">รายการให้ยืม</span>
        </button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Status sub-tabs                                                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex gap-2 overflow-x-auto">
        {subTabs.map((st) => {
          const ourDone = (b: BorrowWithDetails) => activeTab === 'outgoing' ? b.borrower_pos_confirmed : b.lender_pos_confirmed;
          const count = st.key === 'all'
            ? borrows.length
            : st.key === 'cancelled_rejected'
              ? borrows.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length
              : st.key === 'pos_waiting'
                ? borrows.filter((b) => (b.status === 'approved' || b.status === 'pos_adjusting') && !ourDone(b)).length
                : st.key === 'completed'
                  ? borrows.filter((b) => b.status === 'completed' || ((b.status === 'approved' || b.status === 'pos_adjusting') && ourDone(b))).length
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
          title={statusFilter === 'all' ? 'ยังไม่มีรายการ' : `ไม่มีรายการ "${subTabs.find((s) => s.key === statusFilter)?.label}"`}
          description={
            activeTab === 'outgoing' && statusFilter === 'all'
              ? 'คุณยังไม่ได้สร้างคำขอยืมสินค้า'
              : activeTab === 'incoming' && statusFilter === 'all'
                ? 'ยังไม่มีสาขาอื่นขอยืมสินค้าจากคุณ'
                : undefined
          }
          action={
            activeTab === 'outgoing' && statusFilter === 'all' ? (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setShowCreateModal(true)}
                className="bg-teal-500 hover:bg-teal-600 active:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
              >
                สร้างคำขอยืม
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredBorrows.map((borrow) => (
            <BorrowCard
              key={borrow.id}
              borrow={borrow}
              tab={activeTab}
              currentStoreId={currentStoreId!}
              onClick={() => setSelectedBorrow(borrow)}
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
            สร้างคำขอยืม
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
        />
      )}
    </div>
  );
}
