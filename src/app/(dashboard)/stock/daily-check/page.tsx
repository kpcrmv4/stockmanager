'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardContent,
  Tabs,
  EmptyState,
  toast,
} from '@/components/ui';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import { yesterdayBangkok } from '@/lib/utils/date';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import {
  runAutoCompare,
  type AutoCompareResult,
} from '@/lib/stock/auto-compare';
import type { Product } from '@/types/database';
import {
  Search,
  Save,
  Package,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  Info,
  Check,
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
  const [existingCounts, setExistingCounts] = useState<Record<string, number>>(
    {},
  );
  const [showZeroConfirm, setShowZeroConfirm] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());

  // Auto-compare state
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] =
    useState<AutoCompareResult | null>(null);

  // Supplementary count state
  const [supplementaryItems, setSupplementaryItems] = useState<
    Array<{ product_code: string; product_name: string }>
  >([]);
  const [supplementaryCounts, setSupplementaryCounts] = useState<
    Record<string, { count_quantity: number | ''; notes: string }>
  >({});
  const [savingSupplementary, setSavingSupplementary] = useState(false);

  // Business date = yesterday (bars operate past midnight)
  const businessDate = yesterdayBangkok();

  // Track whether this component triggered the realtime event (skip echo)
  const skipRealtimeRef = useRef<Set<string>>(new Set());

  // ── Upsert a single manual_count row ──
  const upsertSingleCount = useCallback(
    async (
      productCode: string,
      quantity: number,
      notes: string | null,
    ): Promise<boolean> => {
      if (!currentStoreId || !user) return false;

      try {
        const supabase = createClient();
        const { error } = await supabase.from('manual_counts').upsert(
          {
            store_id: currentStoreId,
            count_date: businessDate,
            product_code: productCode,
            count_quantity: quantity,
            user_id: user.id,
            notes: notes || null,
            verified: false,
          },
          { onConflict: 'store_id,count_date,product_code' },
        );

        if (error) throw error;
        return true;
      } catch (error) {
        console.error('Error upserting count:', error);
        return false;
      }
    },
    [currentStoreId, businessDate, user],
  );

  // ── On blur: auto-save individual count ──
  const handleCountBlur = useCallback(
    async (productCode: string) => {
      const entry = counts[productCode];
      if (
        entry?.count_quantity === '' ||
        entry?.count_quantity === undefined
      )
        return;
      if (!currentStoreId || !user) return;

      // Skip if value hasn't changed
      if (existingCounts[productCode] === Number(entry.count_quantity)) return;

      setSavingItem(productCode);
      skipRealtimeRef.current.add(productCode);

      const ok = await upsertSingleCount(
        productCode,
        Number(entry.count_quantity),
        entry.notes,
      );

      if (ok) {
        // Fire-and-forget per-item audit log
        const product = products.find((p) => p.product_code === productCode);
        logAudit({
          store_id: currentStoreId,
          action_type: AUDIT_ACTIONS.STOCK_COUNT_SAVED,
          table_name: 'manual_counts',
          record_id: productCode,
          old_value: existingCounts[productCode] != null
            ? { count_quantity: existingCounts[productCode] }
            : null,
          new_value: {
            count_quantity: Number(entry.count_quantity),
            product_code: productCode,
            product_name: product?.product_name || productCode,
            count_date: businessDate,
            type: 'per_item',
          },
          changed_by: user.id,
        });

        setExistingCounts((prev) => ({
          ...prev,
          [productCode]: Number(entry.count_quantity),
        }));
        setSavedItems((prev) => new Set(prev).add(productCode));
        // Clear saved indicator after 2s
        setTimeout(() => {
          setSavedItems((prev) => {
            const next = new Set(prev);
            next.delete(productCode);
            return next;
          });
          skipRealtimeRef.current.delete(productCode);
        }, 2000);
      }

      setSavingItem(null);
    },
    [counts, currentStoreId, user, existingCounts, upsertSingleCount, products, businessDate],
  );

  // ── On blur: auto-save notes ──
  const handleNotesBlur = useCallback(
    async (productCode: string) => {
      const entry = counts[productCode];
      if (
        entry?.count_quantity === '' ||
        entry?.count_quantity === undefined
      )
        return;
      if (!currentStoreId || !user) return;

      skipRealtimeRef.current.add(productCode);
      await upsertSingleCount(
        productCode,
        Number(entry.count_quantity),
        entry.notes,
      );
      setTimeout(() => skipRealtimeRef.current.delete(productCode), 2000);
    },
    [counts, currentStoreId, user, upsertSingleCount],
  );

  // ── Check for POS items not yet counted (supplementary) ──
  const checkSupplementaryItems = useCallback(
    async (
      storeId: string,
      date: string,
      productCodes: Set<string>,
      manualCodes: Set<string>,
    ) => {
      try {
        const supabase = createClient();

        const { data: ocrLogs } = await supabase
          .from('ocr_logs')
          .select('id')
          .eq('store_id', storeId)
          .eq('upload_date', date)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!ocrLogs || ocrLogs.length === 0) return;

        const { data: ocrItems } = await supabase
          .from('ocr_items')
          .select('product_code, product_name')
          .eq('ocr_log_id', ocrLogs[0].id);

        if (!ocrItems || ocrItems.length === 0) return;

        const { data: activeProducts } = await supabase
          .from('products')
          .select('product_code, product_name')
          .eq('store_id', storeId)
          .eq('active', true)
          .eq('count_status', 'active');

        const activeMap = new Map(
          (activeProducts || []).map((p) => [p.product_code, p.product_name]),
        );
        const alreadyCounted = new Set([...productCodes, ...manualCodes]);

        const seen = new Set<string>();
        const missing: Array<{ product_code: string; product_name: string }> =
          [];

        for (const oi of ocrItems) {
          if (
            oi.product_code &&
            activeMap.has(oi.product_code) &&
            !alreadyCounted.has(oi.product_code) &&
            !seen.has(oi.product_code)
          ) {
            seen.add(oi.product_code);
            missing.push({
              product_code: oi.product_code,
              product_name:
                activeMap.get(oi.product_code) ||
                oi.product_name ||
                oi.product_code,
            });
          }
        }

        if (missing.length > 0) {
          setSupplementaryItems(missing);
          const init: Record<
            string,
            { count_quantity: number | ''; notes: string }
          > = {};
          missing.forEach((m) => {
            init[m.product_code] = { count_quantity: '', notes: '' };
          });
          setSupplementaryCounts(init);
        }
      } catch (error) {
        console.error('Error checking supplementary items:', error);
      }
    },
    [],
  );

  // ── Fetch products and existing counts ──
  const fetchProducts = useCallback(async () => {
    if (!currentStoreId) return;

    setLoading(true);
    try {
      const supabase = createClient();

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

      const initialCounts: Record<string, CountEntry> = {};
      (productData || []).forEach((p) => {
        initialCounts[p.product_code] = {
          product_code: p.product_code,
          count_quantity: '',
          notes: '',
        };
      });

      const { data: existingData } = await supabase
        .from('manual_counts')
        .select('product_code, count_quantity, notes')
        .eq('store_id', currentStoreId)
        .eq('count_date', businessDate);

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

        const productCodeSet = new Set(
          (productData || []).map((p) => p.product_code),
        );
        const manualCodeSet = new Set(
          existingData.map((e) => e.product_code),
        );
        await checkSupplementaryItems(
          currentStoreId,
          businessDate,
          productCodeSet,
          manualCodeSet,
        );
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
  }, [currentStoreId, businessDate, checkSupplementaryItems]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ── Realtime subscription: see other staff's updates live ──
  useEffect(() => {
    if (!currentStoreId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`manual-counts-${currentStoreId}-${businessDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'manual_counts',
          filter: `store_id=eq.${currentStoreId}`,
        },
        (payload) => {
          if (
            payload.eventType === 'INSERT' ||
            payload.eventType === 'UPDATE'
          ) {
            const record = payload.new as {
              product_code: string;
              count_quantity: number;
              notes: string | null;
              count_date: string;
            };
            if (record.count_date !== businessDate) return;

            // Skip echo from our own saves
            if (skipRealtimeRef.current.has(record.product_code)) return;

            setCounts((prev) => {
              if (!prev[record.product_code]) return prev;
              return {
                ...prev,
                [record.product_code]: {
                  ...prev[record.product_code],
                  count_quantity: record.count_quantity,
                  notes: record.notes || '',
                },
              };
            });

            setExistingCounts((prev) => ({
              ...prev,
              [record.product_code]: record.count_quantity,
            }));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStoreId, businessDate]);

  // ── Category tabs ──
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

  // ── Filtered products ──
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
          p.product_code.toLowerCase().includes(query),
      );
    }
    return filtered;
  }, [products, activeCategory, searchQuery]);

  // ── Handlers ──
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

  // ── Finalize save: validate + batch upsert + auto-compare ──
  const doSave = async () => {
    if (!currentStoreId || !user) return;

    const entries = Object.values(counts).filter(
      (c) => c.count_quantity !== '' && c.count_quantity !== undefined,
    );

    setSaving(true);
    setShowZeroConfirm(false);
    try {
      const supabase = createClient();

      // Batch upsert all items (catches any not yet saved via blur)
      const upsertData = entries.map((entry) => ({
        store_id: currentStoreId,
        count_date: businessDate,
        product_code: entry.product_code,
        count_quantity: Number(entry.count_quantity),
        user_id: user.id,
        notes: entry.notes || null,
        verified: false,
      }));

      if (upsertData.length > 0) {
        const { error } = await supabase
          .from('manual_counts')
          .upsert(upsertData, {
            onConflict: 'store_id,count_date,product_code',
          });

        if (error) throw error;
      }

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.STOCK_COUNT_SAVED,
        table_name: 'manual_counts',
        new_value: {
          count_date: businessDate,
          items_count: entries.length,
          type: 'batch_finalize',
          products: entries.slice(0, 10).map((e) => {
            const p = products.find((pr) => pr.product_code === e.product_code);
            return p?.product_name || e.product_code;
          }),
        },
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

      // ── Auto-compare ──
      setComparing(true);
      try {
        const result = await runAutoCompare(currentStoreId, businessDate);
        setCompareResult(result);

        if (result.compared) {
          toast({
            type: 'success',
            title: 'เปรียบเทียบอัตโนมัติสำเร็จ',
            message: `ตรง ${result.summary?.match || 0} | เกินเกณฑ์ ${result.summary?.over_tolerance || 0} รายการ`,
          });
        } else if (result.reason === 'no_pos') {
          toast({
            type: 'info',
            title: 'รอข้อมูล POS',
            message:
              'ยังไม่มีข้อมูล POS — ระบบจะเปรียบเทียบอัตโนมัติเมื่อได้รับข้อมูล',
          });
        }

        if (result.missingItems && result.missingItems.length > 0) {
          setSupplementaryItems(result.missingItems);
          const init: Record<
            string,
            { count_quantity: number | ''; notes: string }
          > = {};
          result.missingItems.forEach((item) => {
            init[item.product_code] = { count_quantity: '', notes: '' };
          });
          setSupplementaryCounts(init);
        }
      } catch (err) {
        console.error('Auto-compare error:', err);
        toast({
          type: 'warning',
          title: 'เปรียบเทียบอัตโนมัติล้มเหลว',
          message:
            'สามารถเปรียบเทียบด้วยตนเองได้ที่หน้าผลเปรียบเทียบ',
        });
      } finally {
        setComparing(false);
      }
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

  // ── Save button validation wrapper ──
  const handleSave = async () => {
    if (!currentStoreId || !user) return;

    const unfilledCount = Object.values(counts).filter(
      (c) => c.count_quantity === '' || c.count_quantity === undefined,
    ).length;

    if (unfilledCount > 0) {
      toast({
        type: 'warning',
        title: 'กรุณากรอกให้ครบทุกรายการ',
        message: `ยังไม่ได้กรอกจำนวนอีก ${unfilledCount} รายการ`,
      });
      return;
    }

    const zeroCount = Object.values(counts).filter(
      (c) => c.count_quantity === 0,
    ).length;

    if (zeroCount > 0) {
      setShowZeroConfirm(true);
      return;
    }

    await doSave();
  };

  // ── Save supplementary counts ──
  const handleSaveSupplementary = async () => {
    if (!currentStoreId || !user) return;

    const entries = Object.entries(supplementaryCounts)
      .filter(
        ([, v]) => v.count_quantity !== '' && v.count_quantity !== undefined,
      )
      .map(([code, v]) => ({
        store_id: currentStoreId,
        count_date: businessDate,
        product_code: code,
        count_quantity: Number(v.count_quantity),
        user_id: user.id,
        notes: v.notes || null,
        verified: false,
      }));

    if (entries.length === 0) {
      toast({
        type: 'warning',
        title: 'ไม่มีข้อมูล',
        message: 'กรุณากรอกจำนวนนับรายการเพิ่มเติมอย่างน้อย 1 รายการ',
      });
      return;
    }

    const unfilledSup = supplementaryItems.length - entries.length;
    if (unfilledSup > 0) {
      toast({
        type: 'warning',
        title: 'กรุณากรอกให้ครบทุกรายการ',
        message: `ยังไม่ได้กรอกรายการเพิ่มเติมอีก ${unfilledSup} รายการ`,
      });
      return;
    }

    setSavingSupplementary(true);
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('manual_counts')
        .upsert(entries, {
          onConflict: 'store_id,count_date,product_code',
        });

      if (error) throw error;

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.STOCK_COUNT_SAVED,
        table_name: 'manual_counts',
        new_value: {
          count_date: businessDate,
          items_count: entries.length,
          type: 'supplementary',
          products: supplementaryItems.slice(0, 10).map((s) => s.product_name || s.product_code),
        },
        changed_by: user.id,
      });

      toast({
        type: 'success',
        title: 'บันทึกรายการเพิ่มเติมสำเร็จ',
        message: `บันทึก ${entries.length} รายการเรียบร้อย`,
      });

      setSupplementaryItems([]);
      setSupplementaryCounts({});

      try {
        const result = await runAutoCompare(currentStoreId, businessDate);
        setCompareResult(result);
      } catch {
        // Non-fatal
      }
    } catch (error) {
      console.error('Error saving supplementary counts:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถบันทึกรายการเพิ่มเติมได้',
      });
    } finally {
      setSavingSupplementary(false);
    }
  };

  // ── Reset ──
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

  // ── Computed ──
  const filledCount = Object.values(counts).filter(
    (c) => c.count_quantity !== '' && c.count_quantity !== undefined,
  ).length;

  const zeroQtyCount = Object.values(counts).filter(
    (c) => c.count_quantity === 0,
  ).length;

  // ── Loading state ──
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
            {formatThaiDate(businessDate)} — นับแล้ว {filledCount}/
            {products.length} รายการ
          </p>
        </div>
      </div>

      {/* Business date info */}
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          วันที่นับ: <strong>{formatThaiDate(businessDate)}</strong>{' '}
          (เมื่อวาน — ร้านเปิดข้ามวัน) · บันทึกอัตโนมัติเมื่อกรอกแต่ละรายการ
        </span>
      </div>

      {/* Auto-compare in progress */}
      {comparing && (
        <div className="flex items-center gap-2 rounded-xl bg-indigo-50 p-4 dark:bg-indigo-900/20">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm text-indigo-700 dark:text-indigo-300">
            กำลังเปรียบเทียบอัตโนมัติ...
          </span>
        </div>
      )}

      {/* Auto-compare result banner */}
      {compareResult?.compared && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                เปรียบเทียบอัตโนมัติเรียบร้อย
              </p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-emerald-700 dark:text-emerald-400">
                <span>ตรง {compareResult.summary?.match || 0}</span>
                <span>
                  ภายในเกณฑ์ {compareResult.summary?.within_tolerance || 0}
                </span>
                {(compareResult.summary?.over_tolerance || 0) > 0 && (
                  <span className="font-medium text-red-600 dark:text-red-400">
                    เกินเกณฑ์ {compareResult.summary?.over_tolerance}
                  </span>
                )}
              </div>
              <a
                href="/stock/comparison"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                ดูผลเปรียบเทียบ
                <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Zero qty confirmation */}
      {showZeroConfirm && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                พบ {zeroQtyCount} รายการที่จำนวน = 0
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                กรุณาตรวจสอบให้แน่ใจว่าจำนวนนับถูกต้อง
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowZeroConfirm(false)}
                >
                  กลับไปแก้ไข
                </Button>
                <Button size="sm" onClick={doSave} isLoading={saving}>
                  ยืนยันบันทึก
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              entry?.count_quantity !== '' &&
              entry?.count_quantity !== undefined;
            const isZero = entry?.count_quantity === 0;
            const isSaving = savingItem === product.product_code;
            const justSaved = savedItems.has(product.product_code);

            return (
              <div
                key={product.id}
                className={cn(
                  'rounded-xl bg-white p-4 shadow-sm ring-1 transition-colors dark:bg-gray-800',
                  isZero
                    ? 'ring-amber-300 dark:ring-amber-700'
                    : isFilled
                      ? 'ring-emerald-200 dark:ring-emerald-800'
                      : 'ring-gray-200 dark:ring-gray-700',
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Product Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {product.product_name}
                      </p>
                      {isSaving && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                      )}
                      {justSaved && !isSaving && (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      {hasExisting && !isSaving && !justSaved && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      )}
                      {isZero && (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
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
                      onBlur={() => handleCountBlur(product.product_code)}
                      className={cn(
                        'w-20 rounded-lg border bg-white px-3 py-2 text-center text-sm font-medium outline-none transition-colors',
                        'focus:ring-2 focus:ring-offset-0',
                        'dark:bg-gray-800 dark:text-white',
                        isZero
                          ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-500/20 dark:border-amber-700'
                          : isFilled
                            ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-700'
                            : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500/20 dark:border-gray-600',
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
                      onBlur={() => handleNotesBlur(product.product_code)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:placeholder:text-gray-500"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Supplementary Count Section ── */}
      {supplementaryItems.length > 0 && (
        <Card>
          <CardHeader
            title={`รายการเพิ่มเติมจาก POS (${supplementaryItems.length})`}
          />
          <CardContent>
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                พบรายการสินค้าจาก POS ที่ยังไม่ได้นับ
                กรุณากรอกจำนวนนับเพิ่มเติม
              </p>
            </div>
            <div className="space-y-2">
              {supplementaryItems.map((item) => (
                <div
                  key={item.product_code}
                  className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {item.product_code}
                    </p>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                    value={
                      supplementaryCounts[item.product_code]?.count_quantity ??
                      ''
                    }
                    onChange={(e) =>
                      setSupplementaryCounts((prev) => ({
                        ...prev,
                        [item.product_code]: {
                          ...prev[item.product_code],
                          count_quantity:
                            e.target.value === ''
                              ? ''
                              : Number(e.target.value),
                        },
                      }))
                    }
                    className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                icon={<Save className="h-4 w-4" />}
                isLoading={savingSupplementary}
                onClick={handleSaveSupplementary}
              >
                บันทึกรายการเพิ่มเติม
              </Button>
            </div>
          </CardContent>
        </Card>
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
              {zeroQtyCount > 0 && (
                <span className="ml-2 text-amber-500">
                  ({zeroQtyCount} = 0)
                </span>
              )}
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
                isLoading={saving || comparing}
                onClick={handleSave}
              >
                เสร็จสิ้น ({filledCount}/{products.length})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
