'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
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

// Static map for non-component contexts (e.g. ProductSearchInput)
const CATEGORY_LABEL_MAP: Record<string, string> = {
  whisky: 'Whisky', vodka: 'Vodka', brandy: 'Brandy', rum: 'Rum',
  gin: 'Gin', tequila: 'Tequila', wine: 'Wine', beer: 'Beer',
  sake: 'Sake', soju: 'Soju', other: 'Other',
};

function getCategoryOptions(t: (key: string) => string) {
  return [
    { value: '', label: t('form.selectCategory'), disabled: true },
    { value: 'whisky', label: t('form.catWhisky') },
    { value: 'vodka', label: t('form.catVodka') },
    { value: 'brandy', label: t('form.catBrandy') },
    { value: 'rum', label: t('form.catRum') },
    { value: 'gin', label: t('form.catGin') },
    { value: 'tequila', label: t('form.catTequila') },
    { value: 'wine', label: t('form.catWine') },
    { value: 'beer', label: t('form.catBeer') },
    { value: 'sake', label: t('form.catSake') },
    { value: 'soju', label: t('form.catSoju') },
    { value: 'other', label: t('form.catOther') },
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
                  {CATEGORY_LABEL_MAP[product.category] || product.category}
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

export function DepositForm({ onBack, onSuccess }: DepositFormProps) {
  const t = useTranslations('deposit');
  const categoryOptions = getCategoryOptions(t);
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  // ----- Shared fields -----
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [isNoDeposit, setIsNoDeposit] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [expiryDays, setExpiryDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [receivedPhotoUrl, setReceivedPhotoUrl] = useState<string | null>(null);

  // ----- Multi-item -----
  const [items, setItems] = useState<DepositItem[]>([{ ...EMPTY_ITEM }]);

  // ----- Products from DB -----
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // ----- Customers from previous deposits -----
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  // ----- Submit state -----
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

      for (const item of items) {
        const depositCode = await generateDepositCode(currentStoreId);
        depositCodes.push(depositCode);
        const qty = parseFloat(item.quantity);

        const { error } = await supabase.from('deposits').insert({
          store_id: currentStoreId,
          deposit_code: depositCode,
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

      // ส่ง Action Card เข้าห้องแชทสาขา (ไม่ส่งสำหรับรายการ "ไม่ฝาก")
      // Staff สร้าง manual → ส่งเป็น "รอบาร์ยืนยัน" ทันที
      if (!isNoDeposit) {
        for (let i = 0; i < items.length; i++) {
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
      }

      onSuccess();
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
            <Input
              label={t("form.tableNumber")}
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder={t("form.tablePlaceholder")}
              disabled={isNoDeposit}
            />
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
                <ProductSearchInput
                  item={item}
                  index={idx}
                  products={products}
                  onUpdate={updateItem}
                  onSelectProduct={selectProduct}
                  error={errors[`item_${idx}_productName`]}
                />

                {/* Category + Quantity */}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Select
                    label={t("form.category")}
                    options={categoryOptions}
                    value={item.category}
                    onChange={(e) => updateItem(idx, 'category', e.target.value)}
                    placeholder={t("form.selectCategory")}
                  />
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
            <PhotoUpload
              value={receivedPhotoUrl}
              onChange={(url) => setReceivedPhotoUrl(url)}
              folder="deposits"
              label={t("form.photoLabel")}
            />
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
    </div>
  );
}
