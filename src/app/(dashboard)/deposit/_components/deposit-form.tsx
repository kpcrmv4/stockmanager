'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { useTutorialStore } from '@/stores/tutorial-store';
import { getFlow } from '@/lib/tutorial/steps';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Input,
  Modal,
  Select,
  Textarea,
  toast,
  PhotoUpload,
} from '@/components/ui';
import {
  ArrowLeft,
  Wine,
  Save,
  Plus,
  X,
  Search,
  Loader2,
  Package,
  Crown,
  Truck,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { notifyStaff } from '@/lib/notifications/client';
import { notifyChatNewDepositForBar } from '@/lib/chat/bot-client';
import { expiryDateISO } from '@/lib/utils/date';
import { formatThaiDate } from '@/lib/utils/format';
import { useTranslations } from 'next-intl';

interface DepositFormProps {
  onBack: () => void;
  onSuccess: () => void;
  /**
   * When provided, the form is in "fulfil-customer-request" mode:
   *   - prefill customer/phone/table/notes from the LIFF request
   *   - the first item UPDATEs the existing deposit row (from
   *     status='pending_staff' → 'pending_confirm') instead of INSERTing a
   *     new one — keeping the deposit_code stable across the lifecycle so
   *     the chat action card and customer LIFF view stay in sync.
   *   - additional items still INSERT as new pending_confirm rows (staff
   *     might physically receive multiple bottles for one request).
   *   - on success, also sync the chat action card to status='pending_bar'.
   */
  pendingDeposit?: {
    id: string;
    deposit_code: string;
    customer_name: string;
    customer_phone: string | null;
    table_number: string | null;
    notes: string | null;
    line_user_id: string | null;
    customer_photo_url: string | null;
  };
}

interface ProductOption {
  product_name: string;
  category: string | null;
}

interface DepositItem {
  productName: string;
  category: string;
  quantity: string;
  searchQuery: string;
  showDropdown: boolean;
}

// Build the category dropdown from whatever categories actually exist
// in the store's products table (free-form strings like "MAT-Wine"),
// not a hardcoded enum, so auto-fill matches what stock/products shows.
function buildCategoryOptions(t: (key: string) => string, products: ProductOption[]) {
  const seen = new Set<string>();
  for (const p of products) {
    if (p.category) seen.add(p.category);
  }
  const sorted = Array.from(seen).sort((a, b) => a.localeCompare(b));
  return [
    { value: '', label: t('form.selectCategory'), disabled: true },
    ...sorted.map((c) => ({ value: c, label: c })),
  ];
}

const EMPTY_ITEM: DepositItem = {
  productName: '',
  category: '',
  quantity: '1',
  searchQuery: '',
  showDropdown: false,
};

function generateRandomAlphanumeric(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function generateDepositCode(storeId: string): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from('stores')
    .select('store_code')
    .eq('id', storeId)
    .single();
  const storeCode = data?.store_code || 'UNKNOWN';
  const random = generateRandomAlphanumeric(5);
  return `DEP-${storeCode}-${random}`;
}

// ---------------------------------------------------------------------------
// Customer option from previous deposits
// ---------------------------------------------------------------------------

interface CustomerOption {
  customer_name: string;
  customer_phone: string | null;
}

// ---------------------------------------------------------------------------
// Customer Search Input — autocomplete with free-text support
// ---------------------------------------------------------------------------

function CustomerSearchInput({
  value,
  onChange,
  onSelectCustomer,
  label,
  placeholder,
  icon: Icon,
  error,
  disabled,
  customers,
  matchField,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectCustomer: (customer: CustomerOption) => void;
  label: string;
  placeholder: string;
  icon: typeof User;
  error?: string;
  disabled?: boolean;
  customers: CustomerOption[];
  matchField: 'customer_name' | 'customer_phone';
}) {
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = value.trim()
    ? customers.filter((c) => {
        const field = matchField === 'customer_name' ? c.customer_name : (c.customer_phone || '');
        return field.toLowerCase().includes(value.toLowerCase());
      })
    : customers;

  const handleBlur = () => {
    blurTimeout.current = setTimeout(() => setShowDropdown(false), 200);
  };

  const handleFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setShowDropdown(true);
  };

  const handleSelect = (customer: CustomerOption) => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setShowDropdown(false);
    onSelectCustomer(customer);
  };

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type={matchField === 'customer_phone' ? 'tel' : 'text'}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm transition-colors',
            'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
            'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-indigo-400 dark:focus:ring-indigo-400',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300'
          )}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Dropdown */}
      {showDropdown && !disabled && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {filtered.slice(0, 30).map((customer, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(customer)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            >
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {customer.customer_name}
              </span>
              {customer.customer_phone && (
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  {customer.customer_phone}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Search Input — autocomplete from products table
// ---------------------------------------------------------------------------

function ProductSearchInput({
  item,
  index,
  products,
  onUpdate,
  onSelectProduct,
  error,
}: {
  item: DepositItem;
  index: number;
  products: ProductOption[];
  onUpdate: (index: number, field: keyof DepositItem, value: string | boolean) => void;
  onSelectProduct: (index: number, product: ProductOption) => void;
  error?: string;
}) {
  const t = useTranslations('deposit');
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = item.searchQuery
    ? products.filter((p) =>
        p.product_name.toLowerCase().includes(item.searchQuery.toLowerCase())
      )
    : products;

  const handleBlur = () => {
    // Delay to allow click on dropdown item
    blurTimeout.current = setTimeout(() => {
      onUpdate(index, 'showDropdown', false);
    }, 200);
  };

  const handleFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    onUpdate(index, 'showDropdown', true);
  };

  const handleSelect = (product: ProductOption) => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    onSelectProduct(index, product);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {t("form.productName")}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={item.searchQuery}
          onChange={(e) => {
            onUpdate(index, 'searchQuery', e.target.value);
            onUpdate(index, 'productName', e.target.value);
            onUpdate(index, 'showDropdown', true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={t("form.searchProductPlaceholder")}
          className={cn(
            'w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm transition-colors',
            'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
            'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-indigo-400 dark:focus:ring-indigo-400',
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300'
          )}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Dropdown */}
      {item.showDropdown && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {filtered.slice(0, 50).map((product, pIdx) => (
            <button
              key={pIdx}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(product)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            >
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {product.product_name}
              </span>
              {product.category && (
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                  {product.category}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No results hint */}
      {item.showDropdown && item.searchQuery && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white p-3 text-center text-xs text-gray-400 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
          {t("form.noProductFound")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Form
// ---------------------------------------------------------------------------

export function DepositForm({ onBack, onSuccess, pendingDeposit }: DepositFormProps) {
  const t = useTranslations('deposit');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const tutorialActive = useTutorialStore((s) => s.active);
  const tutorialFeature = useTutorialStore((s) => s.feature);
  const tutorialStepIndex = useTutorialStore((s) => s.stepIndex);
  const tutorialNext = useTutorialStore((s) => s.next);
  const setTutorialDepositCode = useTutorialStore((s) => s.setCreatedDepositCode);
  const isTutorial = tutorialActive && tutorialFeature === 'deposit';
  const isFulfillingRequest = !!pendingDeposit;

  // ----- Shared fields ----- (pre-fill from the customer LIFF request when
  // fulfilling a pending_staff row)
  const [customerName, setCustomerName] = useState(pendingDeposit?.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(pendingDeposit?.customer_phone || '');
  const [tableNumber, setTableNumber] = useState(pendingDeposit?.table_number || '');
  const [isNoDeposit, setIsNoDeposit] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [expiryDays, setExpiryDays] = useState('30');
  const [notes, setNotes] = useState(pendingDeposit?.notes || '');
  const [receivedPhotoUrl, setReceivedPhotoUrl] = useState<string | null>(
    pendingDeposit?.customer_photo_url || null,
  );

  // ----- Multi-item -----
  const [items, setItems] = useState<DepositItem[]>([{ ...EMPTY_ITEM }]);

  // ----- Products from DB -----
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const categoryOptions = buildCategoryOptions(t, products);

  // ----- Customers from previous deposits -----
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  // ----- Submit state -----
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Staff must shoot a photo of the bottle before saving, and after a
  // successful save we show a hand-off modal reminding them to walk the
  // bottle over to the bar. Bar/manager/owner skip both checks because
  // they're often the ones doing the bar-confirm step themselves.
  const isStaff = user?.role === 'staff';
  const [showSendToBarModal, setShowSendToBarModal] = useState(false);
  const [savedDepositCodes, setSavedDepositCodes] = useState<string[]>([]);

  // ----- Fetch products -----
  const fetchProducts = useCallback(async () => {
    if (!currentStoreId) return;
    setLoadingProducts(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('product_name, category')
      .eq('store_id', currentStoreId)
      .eq('active', true)
      .order('product_name');
    if (data) setProducts(data);
    setLoadingProducts(false);
  }, [currentStoreId]);

  // ----- Fetch unique customers from deposits -----
  const fetchCustomers = useCallback(async () => {
    if (!currentStoreId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('deposits')
      .select('customer_name, customer_phone')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (data) {
      // Deduplicate by customer_name
      const seen = new Map<string, CustomerOption>();
      for (const d of data) {
        const key = d.customer_name.toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, { customer_name: d.customer_name, customer_phone: d.customer_phone });
        } else if (!seen.get(key)!.customer_phone && d.customer_phone) {
          // Fill in phone if missing
          seen.set(key, { customer_name: d.customer_name, customer_phone: d.customer_phone });
        }
      }
      setCustomers(Array.from(seen.values()));
    }
  }, [currentStoreId]);

  useEffect(() => {
    fetchProducts();
    fetchCustomers();
  }, [fetchProducts, fetchCustomers]);

  // ----- Item helpers -----
  const updateItem = (index: number, field: keyof DepositItem, value: string | boolean) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    // Clear item-level errors when user types
    if (errors[`item_${index}_productName`] || errors[`item_${index}_quantity`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`item_${index}_productName`];
        delete next[`item_${index}_quantity`];
        return next;
      });
    }
  };

  const selectProduct = (index: number, product: ProductOption) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productName: product.product_name,
        category: product.category || '',
        searchQuery: product.product_name,
        showDropdown: false,
      };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ----- Validation -----
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!customerName.trim()) {
      newErrors.customerName = t('form.errorCustomerName');
    }
    if (!isNoDeposit && !isVip && (!expiryDays || parseInt(expiryDays) <= 0)) {
      newErrors.expiryDays = t('form.errorExpiryDays');
    }

    // Staff must attach a photo of the bottle on a real deposit (we skip
    // this for "ไม่ฝาก" since there's no physical bottle to photograph,
    // and for tutorial mode where we don't actually upload anything).
    if (isStaff && !isNoDeposit && !isTutorial && !receivedPhotoUrl) {
      newErrors.photo = 'กรุณาถ่ายรูปขวดเหล้าก่อนบันทึก';
    }

    items.forEach((item, idx) => {
      if (!item.productName.trim()) {
        newErrors[`item_${idx}_productName`] = t('form.errorProductName');
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        newErrors[`item_${idx}_quantity`] = t('form.errorQuantity');
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ----- Submit -----
  const handleSubmit = async () => {
    if (!validate() || !currentStoreId || !user) return;

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const depositCodes: string[] = [];

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const qty = parseFloat(item.quantity);

        // First item in fulfil-request mode → UPDATE the existing
        // pending_staff row to keep the deposit_code stable through the
        // lifecycle (so chat action card + LIFF view stay in sync).
        if (isFulfillingRequest && idx === 0 && pendingDeposit) {
          depositCodes.push(pendingDeposit.deposit_code);

          const { error } = await supabase
            .from('deposits')
            .update({
              customer_name: customerName.trim(),
              customer_phone: customerPhone.trim() || null,
              product_name: item.productName.trim(),
              category: item.category || null,
              quantity: qty,
              remaining_qty: qty,
              remaining_percent: 100,
              table_number: tableNumber.trim() || null,
              status: isNoDeposit ? 'expired' : 'pending_confirm',
              is_vip: isNoDeposit ? false : isVip,
              is_no_deposit: isNoDeposit,
              expiry_date: isNoDeposit
                ? new Date().toISOString()
                : isVip
                  ? null
                  : expiryDateISO(parseInt(expiryDays)),
              received_by: user.id,
              notes: isNoDeposit
                ? (notes.trim() ? `[${t('form.noDepositTag')}] ${notes.trim()}` : t('form.noDepositDefaultNote'))
                : (notes.trim() || null),
              received_photo_url: receivedPhotoUrl || null,
            })
            .eq('id', pendingDeposit.id);

          if (error) {
            toast({
              type: 'error',
              title: t('form.error'),
              message: t('form.errorSaveProduct', { name: item.productName }),
            });
            setIsSubmitting(false);
            return;
          }

          // Seed bottle rows now that qty is known (auto-bottle trigger only
          // fires on INSERT, and the original INSERT had qty=0).
          if (!isNoDeposit && qty > 0) {
            const bottleRows = [];
            for (let b = 1; b <= qty; b++) {
              bottleRows.push({
                deposit_id: pendingDeposit.id,
                bottle_no: b,
                remaining_percent: 100,
                status: 'in_store',
              });
            }
            await supabase.from('deposit_bottles').insert(bottleRows);
          }
          continue;
        }

        // Otherwise (or additional items in fulfil mode) → INSERT new row.
        // Tutorial mode uses a DEMO-prefixed code so the row is easy to
        // spot in the list, and skips the photo + side-effects entirely.
        const depositCode = isTutorial
          ? `DEMO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
          : await generateDepositCode(currentStoreId);
        depositCodes.push(depositCode);

        const { error } = await supabase.from('deposits').insert({
          store_id: currentStoreId,
          deposit_code: depositCode,
          line_user_id: pendingDeposit?.line_user_id || null,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          product_name: item.productName.trim(),
          category: item.category || null,
          quantity: qty,
          remaining_qty: qty,
          remaining_percent: 100,
          table_number: tableNumber.trim() || null,
          status: isNoDeposit ? 'expired' : 'pending_confirm',
          is_vip: isNoDeposit ? false : isVip,
          is_no_deposit: isNoDeposit,
          expiry_date: isNoDeposit
            ? new Date().toISOString()
            : isVip
              ? null
              : expiryDateISO(parseInt(expiryDays)),
          received_by: user.id,
          notes: isNoDeposit
            ? (notes.trim() ? `[${t('form.noDepositTag')}] ${notes.trim()}` : t('form.noDepositDefaultNote'))
            : (notes.trim() || null),
          received_photo_url: isTutorial ? null : (receivedPhotoUrl || null),
          is_tutorial: isTutorial,
        });

        if (error) {
          toast({
            type: 'error',
            title: t('form.error'),
            message: t('form.errorSaveProduct', { name: item.productName }),
          });
          setIsSubmitting(false);
          return;
        }

        // Tutorial rows skip audit log so demo activity doesn't pollute
        // reports / activity feed.
        if (!isTutorial) {
          await logAudit({
            store_id: currentStoreId,
            action_type: isNoDeposit
              ? AUDIT_ACTIONS.DEPOSIT_NO_DEPOSIT_CREATED
              : AUDIT_ACTIONS.DEPOSIT_CREATED,
            table_name: 'deposits',
            record_id: depositCode,
            new_value: {
              deposit_code: depositCode,
              customer_name: customerName.trim(),
              product_name: item.productName.trim(),
              quantity: qty,
              category: item.category || null,
              ...(isNoDeposit && { is_no_deposit: true }),
            },
            changed_by: user?.id || null,
          });
        }
      }

      const itemsSummary = items
        .map((it) => `${it.productName.trim()} x${it.quantity}`)
        .join(', ');

      toast({
        type: 'success',
        title: isNoDeposit ? t('form.createPendingSuccess') : t('form.saveSuccess'),
        message: isNoDeposit
          ? (items.length === 1
              ? t('form.createdPendingSingle', { code: depositCodes[0] })
              : t('form.createdPendingMultiple', { count: items.length }))
          : (items.length === 1
              ? t('form.createdDepositSingle', { code: depositCodes[0] })
              : t('form.createdDepositMultiple', { count: items.length })),
      });

      // Tutorial mode suppresses every outbound channel — push, in-store
      // chat action card, and the chat-card status sync below — so a demo
      // run never leaks to bar / staff phones / LINE OA.
      if (!isTutorial) {
        notifyStaff({
          storeId: currentStoreId,
          type: 'new_deposit',
          title: isNoDeposit ? t('form.notifyNoDeposit') : t('form.notifyNewDeposit'),
          body: isNoDeposit
            ? `${customerName.trim()} ${t('form.notifyNoDepositBody', { items: itemsSummary })}`
            : `${customerName.trim()} ${t('form.notifyDepositBody', { items: itemsSummary })}`,
          data: { deposit_code: depositCodes[0] },
          excludeUserId: user?.id,
        });
      }

      // ส่ง Action Card เข้าห้องแชทสาขา (ไม่ส่งสำหรับรายการ "ไม่ฝาก")
      // Staff สร้าง manual → ส่งเป็น "รอบาร์ยืนยัน" ทันที
      if (!isNoDeposit && !isTutorial) {
        const startIdx = isFulfillingRequest ? 1 : 0;
        // The first item in fulfil-request mode reuses the existing chat
        // action card (transitioned from pending → pending_bar), so we only
        // post NEW cards for additional items.
        for (let i = startIdx; i < items.length; i++) {
          notifyChatNewDepositForBar(currentStoreId, {
            deposit_code: depositCodes[i],
            customer_name: customerName.trim(),
            product_name: items[i].productName.trim(),
            quantity: parseFloat(items[i].quantity),
            table_number: tableNumber.trim() || null,
            notes: notes.trim() || null,
            received_by_name: user.displayName || user.username || t("form.staffFallback"),
          });
        }

        // Fulfil-request: transition the existing chat action card forward
        // (pending → pending_bar) so bar can verify in chat.
        if (isFulfillingRequest && pendingDeposit) {
          const { syncChatActionCardStatus } = await import('@/lib/chat/bot-client');
          syncChatActionCardStatus({
            storeId: currentStoreId,
            referenceId: pendingDeposit.deposit_code,
            actionType: 'deposit_claim',
            newStatus: 'pending_bar',
            completedBy: user.id,
            completedByName: user.displayName || user.username || '',
          });
        }
      }

      // Tutorial: skip the staff hand-off modal (no real bottle to walk
      // over) and advance the walkthrough panel to its final step.
      if (isTutorial) {
        setTutorialDepositCode(depositCodes[0] ?? null);
        tutorialNext();
        onSuccess();
      } else if (isStaff && !isNoDeposit) {
        // Staff: pause on a hand-off modal reminding them to deliver the
        // bottle to bar before the row leaves the screen.
        setSavedDepositCodes(depositCodes);
        setShowSendToBarModal(true);
      } else {
        onSuccess();
      }
    } catch {
      toast({
        type: 'error',
        title: t('form.error'),
        message: t('form.tryAgain'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const allItemsValid = items.every(
    (it) => it.productName.trim() && parseFloat(it.quantity) > 0
  );

  // -------------------------------------------------------------------------
  // Tutorial autopilot — when stepIndex changes, apply that step's `fill`
  // payload to the form state so the user watches the values appear in the
  // highlighted field. The save step also triggers the actual insert via
  // handleSubmit; on success the submit handler advances to the final step.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isTutorial) return;
    const flow = getFlow('deposit');
    const step = flow?.steps[tutorialStepIndex];
    if (!step) return;

    const f = step.fill;
    if (f) {
      if (f.customerName !== undefined) setCustomerName(f.customerName);
      if (f.customerPhone !== undefined) setCustomerPhone(f.customerPhone);
      if (f.tableNumber !== undefined) setTableNumber(f.tableNumber);
      if (f.expiryDays !== undefined) setExpiryDays(f.expiryDays);
      if (f.notes !== undefined) setNotes(f.notes);
      if (
        f.itemProductName !== undefined ||
        f.itemCategory !== undefined ||
        f.itemQuantity !== undefined
      ) {
        // Pick a real product from the store if we have one loaded; the
        // user sees a real catalog name instead of the placeholder.
        const fallbackName = f.itemProductName ?? '';
        const realProduct = products[0];
        const productName = realProduct?.product_name ?? fallbackName;
        const category = realProduct?.category ?? f.itemCategory ?? '';
        setItems((prev) => {
          const next = [...prev];
          const cur = next[0] ?? { ...EMPTY_ITEM };
          next[0] = {
            ...cur,
            productName: f.itemProductName !== undefined ? productName : cur.productName,
            searchQuery: f.itemProductName !== undefined ? productName : cur.searchQuery,
            category: f.itemCategory !== undefined || f.itemProductName !== undefined ? category : cur.category,
            quantity: f.itemQuantity !== undefined ? f.itemQuantity : cur.quantity,
          };
          return next;
        });
      }
    }

    if (step.autoSave) {
      // Tiny delay so the spotlight has a moment on the save button before
      // the form unmounts on success.
      const timer = setTimeout(() => {
        handleSubmit();
      }, 600);
      return () => clearTimeout(timer);
    }
  // handleSubmit is intentionally excluded from deps — it captures form
  // state but we only need to re-run when the step actually changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTutorial, tutorialStepIndex, products]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("form.backToDeposit")}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
            <Wine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("form.newDeposit")}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("form.newDepositDesc")}
            </p>
          </div>
        </div>
      </div>

      {/* Customer info */}
      <Card padding="none">
        <CardHeader
          title={t("form.customerInfo")}
          description={isNoDeposit ? t("form.customerAutoFill") : t("form.customerInfoDesc")}
        />
        <CardContent>
          <div className={cn('space-y-4', isNoDeposit && 'opacity-60')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div data-tutorial-id="tut-customer-name">
                <CustomerSearchInput
                  label={t("form.customerName")}
                  value={customerName}
                  onChange={(v) => {
                    setCustomerName(v);
                    if (errors.customerName) setErrors((prev) => ({ ...prev, customerName: '' }));
                  }}
                  onSelectCustomer={(c) => {
                    setCustomerName(c.customer_name);
                    if (c.customer_phone) setCustomerPhone(c.customer_phone);
                    if (errors.customerName) setErrors((prev) => ({ ...prev, customerName: '' }));
                  }}
                  placeholder={t("form.searchCustomerPlaceholder")}
                  icon={User}
                  error={errors.customerName}
                  disabled={isNoDeposit}
                  customers={customers}
                  matchField="customer_name"
                />
              </div>
              <div data-tutorial-id="tut-customer-phone">
                <CustomerSearchInput
                  label={t("form.phone")}
                  value={customerPhone}
                  onChange={setCustomerPhone}
                  onSelectCustomer={(c) => {
                    setCustomerPhone(c.customer_phone || '');
                    if (!customerName) setCustomerName(c.customer_name);
                  }}
                  placeholder={t("form.searchPhonePlaceholder")}
                  icon={Phone}
                  disabled={isNoDeposit}
                  customers={customers.filter((c) => !!c.customer_phone)}
                  matchField="customer_phone"
                />
              </div>
            </div>
            <div data-tutorial-id="tut-table-number">
              <Input
                label={t("form.tableNumber")}
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder={t("form.tablePlaceholder")}
                disabled={isNoDeposit}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card padding="none">
        <CardHeader
          title={t("form.productList")}
          description={`${items.length} ${t("form.itemsSearchHint")}`}
          action={
            loadingProducts ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {products.length} สินค้าในระบบ
              </span>
            )
          }
        />
        <CardContent>
          <div className="space-y-4">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="relative rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/30"
              >
                {/* Item header */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {t("form.itemNumber", { num: idx + 1 })}
                    </span>
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Product search */}
                <div {...(idx === 0 ? { 'data-tutorial-id': 'tut-item-product' } : {})}>
                  <ProductSearchInput
                    item={item}
                    index={idx}
                    products={products}
                    onUpdate={updateItem}
                    onSelectProduct={selectProduct}
                    error={errors[`item_${idx}_productName`]}
                  />
                </div>

                {/* Category + Quantity */}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Select
                    label={t("form.category")}
                    options={categoryOptions}
                    value={item.category}
                    onChange={(e) => updateItem(idx, 'category', e.target.value)}
                    placeholder={t("form.selectCategory")}
                  />
                  <div {...(idx === 0 ? { 'data-tutorial-id': 'tut-item-quantity' } : {})}>
                    <Input
                      label={t("form.quantity")}
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      placeholder="1"
                      hint={t("form.bottleCount")}
                      error={errors[`item_${idx}_quantity`]}
                    />
                  </div>
                </div>

                {/* Auto-filled badge */}
                {item.category && item.productName && (
                  <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                    {t("form.categoryAutoFillHint")}
                  </p>
                )}
              </div>
            ))}

            {/* Add item button */}
            <button
              type="button"
              onClick={addItem}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
            >
              <Plus className="h-4 w-4" />
              {t("form.addProduct")}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Storage & Notes */}
      <Card padding="none">
        <CardHeader title={t("form.storage")} description={t("form.storageDesc")} />
        <CardContent>
          <div className="space-y-4">
            {/* No-Deposit Toggle */}
            <div
              className={cn(
                'flex items-center justify-between rounded-lg border p-4 transition-colors',
                isNoDeposit
                  ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20'
                  : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
              )}
            >
              <div className="flex items-center gap-3">
                <Truck className={cn('h-5 w-5', isNoDeposit ? 'text-orange-500' : 'text-gray-400')} />
                <div>
                  <p className={cn('text-sm font-medium', isNoDeposit ? 'text-orange-700 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300')}>
                    {t("form.noDeposit")}
                  </p>
                  <p className={cn('text-xs', isNoDeposit ? 'text-orange-600 dark:text-orange-500' : 'text-gray-500 dark:text-gray-400')}>
                    {isNoDeposit ? t("form.noDepositActiveDesc") : t("form.noDepositDesc")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !isNoDeposit;
                  setIsNoDeposit(next);
                  if (next) {
                    setIsVip(false);
                    setCustomerName(t('form.generalCustomer'));
                    setCustomerPhone('');
                    setTableNumber('');
                  } else {
                    setCustomerName('');
                    setCustomerPhone('');
                    setTableNumber('');
                  }
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                  isNoDeposit ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-600'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                    isNoDeposit ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            {/* VIP Toggle + Expiry — hidden when isNoDeposit */}
            {!isNoDeposit && (
              <>
                <div
                  className={cn(
                    'flex items-center justify-between rounded-lg border p-4 transition-colors',
                    isVip
                      ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20'
                      : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Crown className={cn('h-5 w-5', isVip ? 'text-yellow-500' : 'text-gray-400')} />
                    <div>
                      <p className={cn('text-sm font-medium', isVip ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-700 dark:text-gray-300')}>
                        {t("form.vipStatus")}
                      </p>
                      <p className={cn('text-xs', isVip ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-500 dark:text-gray-400')}>
                        {isVip ? t("form.vipActiveDesc") : t("form.vipInactiveDesc")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsVip(!isVip)}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                      isVip ? 'bg-yellow-500' : 'bg-gray-200 dark:bg-gray-600'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                        isVip ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                {!isVip && (
                  <div data-tutorial-id="tut-expiry-days">
                    <Input
                      label={t("form.storageDays")}
                      type="number"
                      value={expiryDays}
                      onChange={(e) => {
                        setExpiryDays(e.target.value);
                        if (errors.expiryDays) setErrors((prev) => ({ ...prev, expiryDays: '' }));
                      }}
                      placeholder="30"
                      hint={
                        expiryDays && parseInt(expiryDays) > 0
                          ? t('form.expiryApprox', { date: formatThaiDate(new Date(Date.now() + parseInt(expiryDays) * 86400000)) })
                          : t("form.storageDaysHint")
                      }
                      error={errors.expiryDays}
                    />
                  </div>
                )}
              </>
            )}
            <Textarea
              label={t("form.notes")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("form.notesPlaceholder")}
              rows={3}
            />
            <div data-tutorial-id="tut-photo">
              <PhotoUpload
                value={receivedPhotoUrl}
                onChange={(url) => {
                  setReceivedPhotoUrl(url);
                  if (errors.photo) setErrors((prev) => ({ ...prev, photo: '' }));
                }}
                folder="deposits"
                label={t("form.photoLabel")}
                required={isStaff && !isNoDeposit && !isTutorial}
              />
              {errors.photo && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.photo}
                </p>
              )}
              {isTutorial && (
                <p className="mt-1 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
                  <Info className="h-3.5 w-3.5" />
                  โหมดทดลอง — ข้ามขั้นถ่ายรูปได้เลย ระบบจะไม่อัพโหลดจริง
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={onBack}
          className="min-h-[44px] sm:min-h-0"
        >
          {t('form.cancel')}
        </Button>
        <Button
          data-tutorial-id="tut-save"
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={!customerName || !allItemsValid}
          icon={<Save className="h-4 w-4" />}
          className="min-h-[44px] sm:min-h-0"
        >
          {isNoDeposit
            ? (items.length > 1
                ? t('form.savePendingMultiple', { count: items.length })
                : t('form.savePendingSingle'))
            : (items.length > 1
                ? t('form.saveDepositMultiple', { count: items.length })
                : t('form.saveDepositSingle'))}
        </Button>
      </div>

      {/* Hand-off modal — staff sees this after a successful save so they
          remember to physically deliver the bottle to the bar before bar
          can confirm it. Closing the modal returns to the deposit list. */}
      <Modal
        isOpen={showSendToBarModal}
        onClose={() => {
          setShowSendToBarModal(false);
          onSuccess();
        }}
        title="บันทึกสำเร็จ"
        size="sm"
        showClose={false}
      >
        <div className="space-y-4 px-1 pb-1">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-900/20">
            <Truck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                กรุณานำขวดเหล้าไปส่งให้ Bar
              </p>
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                บันทึกรายการแล้ว — โปรดเดินขวดไปส่งให้บาร์เพื่อยืนยันรับเข้าระบบ ก่อนรายการจะถูกใช้งานได้
              </p>
            </div>
          </div>
          {savedDepositCodes.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800/50">
              <span className="text-gray-500 dark:text-gray-400">รหัสรายการ: </span>
              <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">
                {savedDepositCodes.join(', ')}
              </span>
            </div>
          )}
          <Button
            onClick={() => {
              setShowSendToBarModal(false);
              onSuccess();
            }}
            icon={<CheckCircle2 className="h-4 w-4" />}
            className="min-h-[44px] w-full justify-center"
          >
            เข้าใจแล้ว
          </Button>
        </div>
      </Modal>
    </div>
  );
}
