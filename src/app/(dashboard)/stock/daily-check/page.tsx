'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Input, Card, CardHeader, CardContent, Tabs, EmptyState, toast } from '@/components/ui';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import { todayBangkok } from '@/lib/utils/date';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import type { Product } from '@/types/database';
import {
  Search,
  Save,
  Camera,
  Upload,
  Package,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  RotateCcw,
  FileUp,
} from 'lucide-react';

interface CountEntry {
  product_code: string;
  count_quantity: number | '';
  notes: string;
}

export default function DailyCheckPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, CountEntry>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [existingCounts, setExistingCounts] = useState<Record<string, number>>({});
  const [showOcrUpload, setShowOcrUpload] = useState(false);

  const today = todayBangkok();

  const fetchProducts = useCallback(async () => {
    if (!currentStoreId) return;

    setLoading(true);
    try {
      const supabase = createClient();

      // Fetch active products ที่ต้องนับ (active=true AND count_status='active')
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', currentStoreId)
        .eq('active', true)
        .eq('count_status', 'active')
        .order('category', { ascending: true })
        .order('product_name', { ascending: true });

      if (productError) throw productError;

      setProducts(productData || []);

      // Initialize counts map
      const initialCounts: Record<string, CountEntry> = {};
      (productData || []).forEach((p) => {
        initialCounts[p.product_code] = {
          product_code: p.product_code,
          count_quantity: '',
          notes: '',
        };
      });

      // Check for existing counts for today
      const { data: existingData } = await supabase
        .from('manual_counts')
        .select('product_code, count_quantity, notes')
        .eq('store_id', currentStoreId)
        .eq('count_date', today);

      if (existingData && existingData.length > 0) {
        const existingMap: Record<string, number> = {};
        existingData.forEach((ec) => {
          existingMap[ec.product_code] = ec.count_quantity;
          if (initialCounts[ec.product_code]) {
            initialCounts[ec.product_code].count_quantity = ec.count_quantity;
            initialCounts[ec.product_code].notes = ec.notes || '';
          }
        });
        setExistingCounts(existingMap);
      }

      setCounts(initialCounts);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดรายการสินค้าได้',
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, today]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Build category tabs
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    const tabs = [{ id: 'all', label: 'ทั้งหมด', count: products.length }];
    Array.from(cats)
      .sort()
      .forEach((cat) => {
        tabs.push({
          id: cat,
          label: cat,
          count: products.filter((p) => p.category === cat).length,
        });
      });
    return tabs;
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (activeCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.product_name.toLowerCase().includes(query) ||
          p.product_code.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [products, activeCategory, searchQuery]);

  const handleCountChange = (productCode: string, value: string) => {
    setCounts((prev) => ({
      ...prev,
      [productCode]: {
        ...prev[productCode],
        count_quantity: value === '' ? '' : Number(value),
      },
    }));
  };

  const handleNotesChange = (productCode: string, value: string) => {
    setCounts((prev) => ({
      ...prev,
      [productCode]: {
        ...prev[productCode],
        notes: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!currentStoreId || !user) return;

    // Collect only entries with a count
    const entries = Object.values(counts).filter(
      (c) => c.count_quantity !== '' && c.count_quantity !== undefined
    );

    if (entries.length === 0) {
      toast({
        type: 'warning',
        title: 'ไม่มีข้อมูลที่จะบันทึก',
        message: 'กรุณากรอกจำนวนนับอย่างน้อย 1 รายการ',
      });
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Upsert manual counts
      const upsertData = entries.map((entry) => ({
        store_id: currentStoreId,
        count_date: today,
        product_code: entry.product_code,
        count_quantity: Number(entry.count_quantity),
        user_id: user.id,
        notes: entry.notes || null,
        verified: false,
      }));

      // Delete existing counts for today, then insert fresh
      await supabase
        .from('manual_counts')
        .delete()
        .eq('store_id', currentStoreId)
        .eq('count_date', today);

      const { error } = await supabase
        .from('manual_counts')
        .insert(upsertData);

      if (error) throw error;

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.STOCK_COUNT_SAVED,
        table_name: 'manual_counts',
        new_value: { count_date: today, items_count: entries.length },
        changed_by: user.id,
      });

      toast({
        type: 'success',
        title: 'บันทึกสำเร็จ',
        message: `บันทึกจำนวนนับ ${entries.length} รายการเรียบร้อย`,
      });

      // Update existing counts state
      const newExisting: Record<string, number> = {};
      entries.forEach((e) => {
        newExisting[e.product_code] = Number(e.count_quantity);
      });
      setExistingCounts(newExisting);
    } catch (error) {
      console.error('Error saving counts:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถบันทึกข้อมูลการนับได้',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const resetCounts: Record<string, CountEntry> = {};
    products.forEach((p) => {
      resetCounts[p.product_code] = {
        product_code: p.product_code,
        count_quantity: '',
        notes: '',
      };
    });
    setCounts(resetCounts);
  };

  const filledCount = Object.values(counts).filter(
    (c) => c.count_quantity !== '' && c.count_quantity !== undefined
  ).length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <a
              href="/stock"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <ArrowLeft className="h-5 w-5" />
            </a>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              นับสต๊อกประจำวัน
            </h1>
          </div>
          <p className="mt-0.5 ml-9 text-sm text-gray-500 dark:text-gray-400">
            {formatThaiDate(today)} — นับแล้ว {filledCount}/{products.length} รายการ
          </p>
        </div>
      </div>

      {/* OCR Upload Area (Placeholder) */}
      <div
        className={cn(
          'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          showOcrUpload
            ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20'
            : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
            <Camera className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              สแกนใบเสร็จ POS (OCR)
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              อัพโหลดรูปหรือถ่ายภาพใบเสร็จเพื่อนำเข้าข้อมูลอัตโนมัติ
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Camera className="h-4 w-4" />}
              onClick={() => {
                toast({
                  type: 'info',
                  title: 'เร็ว ๆ นี้',
                  message: 'ฟีเจอร์สแกน OCR กำลังพัฒนา',
                });
              }}
            >
              ถ่ายภาพ
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<FileUp className="h-4 w-4" />}
              onClick={() => {
                toast({
                  type: 'info',
                  title: 'เร็ว ๆ นี้',
                  message: 'ฟีเจอร์อัพโหลดไฟล์ OCR กำลังพัฒนา',
                });
              }}
            >
              อัพโหลดไฟล์
            </Button>
          </div>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="ค้นหาสินค้า... (ชื่อ หรือ รหัส)"
        leftIcon={<Search className="h-4 w-4" />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Category Tabs */}
      {categories.length > 1 && (
        <Tabs
          tabs={categories}
          activeTab={activeCategory}
          onChange={setActiveCategory}
        />
      )}

      {/* Product Count List */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={Package}
          title="ไม่พบสินค้า"
          description={
            searchQuery
              ? 'ลองเปลี่ยนคำค้นหา หรือเลือกหมวดหมู่อื่น'
              : 'ยังไม่มีสินค้าในระบบ'
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredProducts.map((product) => {
            const entry = counts[product.product_code];
            const hasExisting =
              existingCounts[product.product_code] !== undefined;
            const isFilled =
              entry?.count_quantity !== '' && entry?.count_quantity !== undefined;

            return (
              <div
                key={product.id}
                className={cn(
                  'rounded-xl bg-white p-4 shadow-sm ring-1 transition-colors dark:bg-gray-800',
                  isFilled
                    ? 'ring-emerald-200 dark:ring-emerald-800'
                    : 'ring-gray-200 dark:ring-gray-700'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {product.product_name}
                      </p>
                      {hasExisting && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                      <span>{product.product_code}</span>
                      {product.category && <span>{product.category}</span>}
                      {product.size && <span>{product.size}</span>}
                      {product.unit && <span>({product.unit})</span>}
                    </div>
                  </div>

                  {/* Count Input */}
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="0"
                      value={entry?.count_quantity ?? ''}
                      onChange={(e) =>
                        handleCountChange(product.product_code, e.target.value)
                      }
                      className={cn(
                        'w-20 rounded-lg border bg-white px-3 py-2 text-center text-sm font-medium outline-none transition-colors',
                        'focus:ring-2 focus:ring-offset-0',
                        'dark:bg-gray-800 dark:text-white',
                        isFilled
                          ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-700'
                          : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500/20 dark:border-gray-600'
                      )}
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {product.unit || 'ชิ้น'}
                    </span>
                  </div>
                </div>

                {/* Notes input (shown when count is filled) */}
                {isFilled && (
                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="หมายเหตุ (ถ้ามี)..."
                      value={entry?.notes || ''}
                      onChange={(e) =>
                        handleNotesChange(product.product_code, e.target.value)
                      }
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:placeholder:text-gray-500"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Action Bar */}
      {products.length > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-white">
                {filledCount}
              </span>{' '}
              / {products.length} รายการ
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={handleReset}
              >
                รีเซ็ต
              </Button>
              <Button
                size="sm"
                icon={<Save className="h-4 w-4" />}
                isLoading={saving}
                onClick={handleSave}
              >
                บันทึก ({filledCount})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
