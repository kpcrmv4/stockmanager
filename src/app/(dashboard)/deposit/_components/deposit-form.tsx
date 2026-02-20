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
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { notifyStaff } from '@/lib/notifications/client';
import { expiryDateISO } from '@/lib/utils/date';
import { formatThaiDate } from '@/lib/utils/format';

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

const categoryOptions = [
  { value: '', label: 'เลือกประเภท', disabled: true },
  { value: 'whisky', label: 'วิสกี้' },
  { value: 'vodka', label: 'วอดก้า' },
  { value: 'brandy', label: 'บรั่นดี' },
  { value: 'rum', label: 'รัม' },
  { value: 'gin', label: 'จิน' },
  { value: 'tequila', label: 'เตกิล่า' },
  { value: 'wine', label: 'ไวน์' },
  { value: 'beer', label: 'เบียร์' },
  { value: 'sake', label: 'สาเก' },
  { value: 'soju', label: 'โซจู' },
  { value: 'other', label: 'อื่นๆ' },
];

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
        ชื่อสินค้า *
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
          placeholder="พิมพ์ค้นหาชื่อเหล้า..."
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
                  {categoryOptions.find((c) => c.value === product.category)?.label || product.category}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No results hint */}
      {item.showDropdown && item.searchQuery && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white p-3 text-center text-xs text-gray-400 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
          ไม่พบสินค้าในระบบ — จะใช้ชื่อที่พิมพ์
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Form
// ---------------------------------------------------------------------------

export function DepositForm({ onBack, onSuccess }: DepositFormProps) {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  // ----- Shared fields -----
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [expiryDays, setExpiryDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [receivedPhotoUrl, setReceivedPhotoUrl] = useState<string | null>(null);

  // ----- Multi-item -----
  const [items, setItems] = useState<DepositItem[]>([{ ...EMPTY_ITEM }]);

  // ----- Products from DB -----
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

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

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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
      newErrors.customerName = 'กรุณาระบุชื่อลูกค้า';
    }
    if (!isVip && (!expiryDays || parseInt(expiryDays) <= 0)) {
      newErrors.expiryDays = 'กรุณาระบุจำนวนวันที่ถูกต้อง';
    }

    items.forEach((item, idx) => {
      if (!item.productName.trim()) {
        newErrors[`item_${idx}_productName`] = 'กรุณาระบุชื่อสินค้า';
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        newErrors[`item_${idx}_quantity`] = 'กรุณาระบุจำนวนที่ถูกต้อง';
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
          status: 'pending_confirm',
          is_vip: isVip,
          expiry_date: isVip ? null : expiryDateISO(parseInt(expiryDays)),
          received_by: user.id,
          notes: notes.trim() || null,
          received_photo_url: receivedPhotoUrl || null,
        });

        if (error) {
          toast({
            type: 'error',
            title: 'เกิดข้อผิดพลาด',
            message: `ไม่สามารถบันทึก ${item.productName} ได้`,
          });
          setIsSubmitting(false);
          return;
        }

        await logAudit({
          store_id: currentStoreId,
          action_type: AUDIT_ACTIONS.DEPOSIT_CREATED,
          table_name: 'deposits',
          record_id: depositCode,
          new_value: {
            deposit_code: depositCode,
            customer_name: customerName.trim(),
            product_name: item.productName.trim(),
            quantity: qty,
            category: item.category || null,
          },
          changed_by: user?.id || null,
        });
      }

      const itemsSummary = items
        .map((it) => `${it.productName.trim()} x${it.quantity}`)
        .join(', ');

      toast({
        type: 'success',
        title: 'บันทึกสำเร็จ',
        message:
          items.length === 1
            ? `สร้างรายการฝากเหล้า ${depositCodes[0]}`
            : `สร้าง ${items.length} รายการฝากเหล้า`,
      });

      notifyStaff({
        storeId: currentStoreId,
        type: 'new_deposit',
        title: 'มีรายการฝากเหล้าใหม่',
        body: `${customerName.trim()} ฝาก ${itemsSummary}`,
        data: { deposit_code: depositCodes[0] },
        excludeUserId: user?.id,
      });

      onSuccess();
    } catch {
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ลองอีกครั้ง',
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
          กลับหน้าฝากเหล้า
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
            <Wine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ฝากเหล้าใหม่</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              สร้างรายการฝากเหล้าสำหรับลูกค้า
            </p>
          </div>
        </div>
      </div>

      {/* Customer info */}
      <Card padding="none">
        <CardHeader title="ข้อมูลลูกค้า" description="ระบุข้อมูลลูกค้าที่ต้องการฝากเหล้า" />
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="ชื่อลูกค้า *"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (errors.customerName) setErrors((prev) => ({ ...prev, customerName: '' }));
                }}
                placeholder="เช่น คุณสมชาย"
                error={errors.customerName}
              />
              <Input
                label="เบอร์โทรศัพท์"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="เช่น 0812345678"
                type="tel"
              />
            </div>
            <Input
              label="หมายเลขโต๊ะ"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="เช่น โต๊ะ 12, VIP 3"
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card padding="none">
        <CardHeader
          title="รายการสินค้า"
          description={`${items.length} รายการ — พิมพ์ค้นหาเหล้าในร้านได้ทันที`}
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
                      รายการที่ {idx + 1}
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
                    label="ประเภท"
                    options={categoryOptions}
                    value={item.category}
                    onChange={(e) => updateItem(idx, 'category', e.target.value)}
                    placeholder="เลือกประเภท"
                  />
                  <Input
                    label="จำนวน *"
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    placeholder="1"
                    hint="จำนวนขวด"
                    error={errors[`item_${idx}_quantity`]}
                  />
                </div>

                {/* Auto-filled badge */}
                {item.category && item.productName && (
                  <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                    หมวดหมู่จะถูกเลือกอัตโนมัติเมื่อเลือกจากรายการ — แก้ไขได้
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
              เพิ่มรายการสินค้า
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Storage & Notes */}
      <Card padding="none">
        <CardHeader title="การจัดเก็บ" description="ระยะเวลาเก็บรักษาและหมายเหตุ" />
        <CardContent>
          <div className="space-y-4">
            {/* VIP Toggle */}
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
                    สถานะ VIP
                  </p>
                  <p className={cn('text-xs', isVip ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-500 dark:text-gray-400')}>
                    {isVip ? 'ฝากได้ไม่มีหมดอายุ' : 'มีกำหนดวันหมดอายุปกติ'}
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
                label="ระยะเวลาเก็บรักษา (วัน) *"
                type="number"
                value={expiryDays}
                onChange={(e) => {
                  setExpiryDays(e.target.value);
                  if (errors.expiryDays) setErrors((prev) => ({ ...prev, expiryDays: '' }));
                }}
                placeholder="30"
                hint={
                  expiryDays && parseInt(expiryDays) > 0
                    ? `หมดอายุประมาณ ${formatThaiDate(new Date(Date.now() + parseInt(expiryDays) * 86400000))}`
                    : 'ระบุจำนวนวันที่เก็บรักษา'
                }
                error={errors.expiryDays}
              />
            )}
            <Textarea
              label="หมายเหตุ"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น เหลือประมาณ 60%, ขวดใหม่ยังไม่เปิด"
              rows={3}
            />
            <PhotoUpload
              value={receivedPhotoUrl}
              onChange={(url) => setReceivedPhotoUrl(url)}
              folder="deposits"
              label="ถ่ายรูปเหล้า"
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
          ยกเลิก
        </Button>
        <Button
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={!customerName || !allItemsValid}
          icon={<Save className="h-4 w-4" />}
          className="min-h-[44px] sm:min-h-0"
        >
          {items.length > 1
            ? `บันทึก ${items.length} รายการฝากเหล้า`
            : 'บันทึกรายการฝากเหล้า'}
        </Button>
      </div>
    </div>
  );
}
