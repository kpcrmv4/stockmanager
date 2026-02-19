'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Input,
  Select,
  Modal,
  ModalFooter,
  Badge,
  Card,
  EmptyState,
  toast,
} from '@/components/ui';
import { formatNumber } from '@/lib/utils/format';
import type { Product } from '@/types/database';
import {
  ArrowLeft,
  Plus,
  Search,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Package,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { ImportCSVModal } from './import-csv-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductForm {
  product_code: string;
  product_name: string;
  category: string;
  size: string;
  unit: string;
  price: string;
  active: boolean;
  count_status: 'active' | 'excluded';
}

const emptyForm: ProductForm = {
  product_code: '',
  product_name: '',
  category: '',
  size: '',
  unit: '',
  price: '',
  active: true,
  count_status: 'active',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProductsPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ProductForm, string>>>({});
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);

  // Permission helpers
  const canEdit = user
    ? ['owner', 'accountant', 'manager'].includes(user.role)
    : false;

  // ---------------------------------------------------------------------------
  // Fetch products
  // ---------------------------------------------------------------------------

  const fetchProducts = useCallback(async () => {
    if (!currentStoreId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', currentStoreId)
        .order('product_code', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดข้อมูลสินค้าได้',
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ---------------------------------------------------------------------------
  // Derived / memoized data
  // ---------------------------------------------------------------------------

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [products]);

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: 'ทุกหมวดหมู่' },
      ...categories.map((c) => ({ value: c, label: c })),
      ...(products.some((p) => !p.category)
        ? [{ value: '__none__', label: 'ไม่ระบุหมวดหมู่' }]
        : []),
    ],
    [categories, products]
  );

  const activeFilterOptions = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'active', label: 'เปิดใช้' },
    { value: 'inactive', label: 'ปิดใช้' },
  ];

  const filteredProducts = useMemo(() => {
    let result = products;

    // Active filter
    if (filterActive === 'active') {
      result = result.filter((p) => p.active);
    } else if (filterActive === 'inactive') {
      result = result.filter((p) => !p.active);
    }

    // Category filter
    if (filterCategory !== 'all') {
      if (filterCategory === '__none__') {
        result = result.filter((p) => !p.category);
      } else {
        result = result.filter((p) => p.category === filterCategory);
      }
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.product_code.toLowerCase().includes(q) ||
          p.product_name.toLowerCase().includes(q)
      );
    }

    return result;
  }, [products, filterActive, filterCategory, searchQuery]);

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.active).length;
    const inactive = total - active;
    const excluded = products.filter((p) => p.count_status === 'excluded').length;
    return { total, active, inactive, excluded };
  }, [products]);

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------

  function openAddModal() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormErrors({});
    setShowModal(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setForm({
      product_code: product.product_code,
      product_name: product.product_name,
      category: product.category || '',
      size: product.size || '',
      unit: product.unit || '',
      price: product.price != null ? String(product.price) : '',
      active: product.active,
      count_status: product.count_status || 'active',
    });
    setFormErrors({});
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setFormErrors({});
  }

  function validateForm(): boolean {
    const errors: Partial<Record<keyof ProductForm, string>> = {};
    if (!form.product_code.trim()) errors.product_code = 'กรุณากรอกรหัสสินค้า';
    if (!form.product_name.trim()) errors.product_name = 'กรุณากรอกชื่อสินค้า';
    if (!form.unit.trim()) errors.unit = 'กรุณากรอกหน่วยนับ';
    if (form.price && isNaN(Number(form.price))) errors.price = 'ราคาต้องเป็นตัวเลข';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!currentStoreId || !validateForm()) return;

    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        store_id: currentStoreId,
        product_code: form.product_code.trim(),
        product_name: form.product_name.trim(),
        category: form.category.trim() || null,
        size: form.size.trim() || null,
        unit: form.unit.trim(),
        price: form.price ? Number(form.price) : null,
        active: form.active,
        count_status: form.count_status,
      };

      if (editingProduct) {
        // --- Update ---
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id);

        if (error) throw error;

        // Audit log
        await supabase.from('audit_logs').insert({
          store_id: currentStoreId,
          action_type: 'product_updated',
          table_name: 'products',
          record_id: editingProduct.id,
          old_value: {
            product_code: editingProduct.product_code,
            product_name: editingProduct.product_name,
            category: editingProduct.category,
            size: editingProduct.size,
            unit: editingProduct.unit,
            price: editingProduct.price,
            active: editingProduct.active,
          },
          new_value: payload,
          changed_by: user?.id || null,
        });

        toast({ type: 'success', title: 'อัปเดตสินค้าสำเร็จ' });
      } else {
        // --- Create: check unique product_code in store ---
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('store_id', currentStoreId)
          .eq('product_code', payload.product_code)
          .limit(1)
          .maybeSingle();

        if (existing) {
          setFormErrors({ product_code: 'รหัสสินค้านี้มีอยู่แล้วในสาขานี้' });
          setSaving(false);
          return;
        }

        const { data: inserted, error } = await supabase
          .from('products')
          .insert(payload)
          .select('id')
          .single();

        if (error) throw error;

        // Audit log
        await supabase.from('audit_logs').insert({
          store_id: currentStoreId,
          action_type: 'product_created',
          table_name: 'products',
          record_id: inserted.id,
          new_value: payload,
          changed_by: user?.id || null,
        });

        toast({ type: 'success', title: 'เพิ่มสินค้าสำเร็จ' });
      }

      closeModal();
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถบันทึกสินค้าได้',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(product: Product) {
    if (!currentStoreId) return;

    try {
      const supabase = createClient();
      const newActive = !product.active;

      const { error } = await supabase
        .from('products')
        .update({ active: newActive })
        .eq('id', product.id);

      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        store_id: currentStoreId,
        action_type: 'product_toggled',
        table_name: 'products',
        record_id: product.id,
        old_value: { active: product.active },
        new_value: { active: newActive },
        changed_by: user?.id || null,
      });

      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, active: newActive } : p))
      );

      toast({
        type: 'success',
        title: newActive ? 'เปิดใช้สินค้าแล้ว' : 'ปิดใช้สินค้าแล้ว',
      });
    } catch (error) {
      console.error('Error toggling product:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถเปลี่ยนสถานะสินค้าได้',
      });
    }
  }

  async function handleDelete() {
    if (!deletingProduct || !currentStoreId) return;

    setDeleting(true);
    try {
      const supabase = createClient();

      // Check if the product has ever been used in manual_counts or comparisons
      const { count: usedCount } = await supabase
        .from('manual_counts')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', currentStoreId)
        .eq('product_code', deletingProduct.product_code);

      const { count: compCount } = await supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', currentStoreId)
        .eq('product_code', deletingProduct.product_code);

      const wasUsed = (usedCount || 0) + (compCount || 0) > 0;

      if (wasUsed) {
        // Soft delete: set active = false
        const { error } = await supabase
          .from('products')
          .update({ active: false })
          .eq('id', deletingProduct.id);

        if (error) throw error;

        setProducts((prev) =>
          prev.map((p) =>
            p.id === deletingProduct.id ? { ...p, active: false } : p
          )
        );

        toast({
          type: 'info',
          title: 'ปิดใช้สินค้าแล้ว',
          message: 'สินค้านี้เคยถูกใช้งาน จึงถูกปิดใช้แทนการลบ',
        });
      } else {
        // Hard delete
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', deletingProduct.id);

        if (error) throw error;

        setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id));

        toast({ type: 'success', title: 'ลบสินค้าสำเร็จ' });
      }

      // Audit log
      await createClient().from('audit_logs').insert({
        store_id: currentStoreId,
        action_type: wasUsed ? 'product_soft_deleted' : 'product_hard_deleted',
        table_name: 'products',
        record_id: deletingProduct.id,
        old_value: {
          product_code: deletingProduct.product_code,
          product_name: deletingProduct.product_name,
        },
        changed_by: user?.id || null,
      });

      setDeletingProduct(null);
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถลบสินค้าได้',
      });
    } finally {
      setDeleting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render: loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/stock"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              จัดการสินค้า
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              จัดการรายการสินค้าทั้งหมดของสาขา
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={fetchProducts}
          >
            รีเฟรช
          </Button>
          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                icon={<Upload className="h-4 w-4" />}
                onClick={() => setShowImportModal(true)}
              >
                นำเข้า CSV
              </Button>
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={openAddModal}
              >
                เพิ่มสินค้า
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ---- Stats ---- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
        <span>
          ทั้งหมด{' '}
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatNumber(stats.total)}
          </span>
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>
          เปิดใช้{' '}
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {formatNumber(stats.active)}
          </span>
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>
          ปิดใช้{' '}
          <span className="font-semibold text-gray-500 dark:text-gray-400">
            {formatNumber(stats.inactive)}
          </span>
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>
          ยกเว้นการนับ{' '}
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            {formatNumber(stats.excluded)}
          </span>
        </span>
      </div>

      {/* ---- Filters ---- */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            placeholder="ค้นหารหัสหรือชื่อสินค้า..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            options={categoryOptions}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-40">
          <Select
            options={activeFilterOptions}
            value={filterActive}
            onChange={(e) =>
              setFilterActive(e.target.value as 'all' | 'active' | 'inactive')
            }
          />
        </div>
      </div>

      {/* ---- Product List ---- */}
      {filteredProducts.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={Package}
            title="ไม่พบสินค้า"
            description={
              products.length === 0
                ? 'ยังไม่มีสินค้าในสาขานี้ เริ่มเพิ่มสินค้าใหม่เลย'
                : 'ไม่พบสินค้าที่ตรงกับเงื่อนไขการค้นหา'
            }
            action={
              products.length === 0 && canEdit ? (
                <Button
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={openAddModal}
                >
                  เพิ่มสินค้า
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {/* Desktop table (md+) */}
          <div className="hidden md:block">
            <Card padding="none">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
                      <th className="px-5 py-3">รหัส</th>
                      <th className="px-5 py-3">ชื่อสินค้า</th>
                      <th className="px-5 py-3">หมวดหมู่</th>
                      <th className="px-5 py-3">ขนาด</th>
                      <th className="px-5 py-3">หน่วย</th>
                      <th className="px-5 py-3 text-right">ราคา</th>
                      <th className="px-5 py-3 text-center">สถานะ</th>
                      {canEdit && (
                        <th className="px-5 py-3 text-center">จัดการ</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {filteredProducts.map((product) => (
                      <tr
                        key={product.id}
                        className={cn(
                          'transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30',
                          !product.active && 'opacity-60'
                        )}
                      >
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                          {product.product_code}
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">
                          {product.product_name}
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                          {product.category || '-'}
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                          {product.size || '-'}
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                          {product.unit || '-'}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right text-gray-700 dark:text-gray-300">
                          {product.price != null
                            ? `฿${formatNumber(product.price, 2)}`
                            : '-'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {product.active ? (
                              <Badge variant="success">เปิดใช้</Badge>
                            ) : (
                              <Badge variant="default">ปิดใช้</Badge>
                            )}
                            {product.count_status === 'excluded' && (
                              <Badge variant="warning">ยกเว้นนับ</Badge>
                            )}
                          </div>
                        </td>
                        {canEdit && (
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openEditModal(product)}
                                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700 dark:hover:text-indigo-400"
                                title="แก้ไข"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleToggleActive(product)}
                                className={cn(
                                  'rounded-lg p-1.5 transition-colors',
                                  product.active
                                    ? 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20'
                                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700'
                                )}
                                title={
                                  product.active ? 'ปิดใช้สินค้า' : 'เปิดใช้สินค้า'
                                }
                              >
                                {product.active ? (
                                  <ToggleRight className="h-4 w-4" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={() => setDeletingProduct(product)}
                                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                title="ลบ"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className={cn(
                  'rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700',
                  !product.active && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        {product.product_code}
                      </span>
                      {product.active ? (
                        <Badge variant="success" size="sm">
                          เปิดใช้
                        </Badge>
                      ) : (
                        <Badge variant="default" size="sm">
                          ปิดใช้
                        </Badge>
                      )}
                      {product.count_status === 'excluded' && (
                        <Badge variant="warning" size="sm">
                          ยกเว้นนับ
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 font-medium text-gray-900 dark:text-white">
                      {product.product_name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {product.category && <span>{product.category}</span>}
                      {product.size && <span>{product.size}</span>}
                      {product.unit && <span>{product.unit}</span>}
                      {product.price != null && (
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          ฿{formatNumber(product.price, 2)}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => openEditModal(product)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700 dark:hover:text-indigo-400"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(product)}
                        className={cn(
                          'rounded-lg p-1.5 transition-colors',
                          product.active
                            ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        )}
                      >
                        {product.active ? (
                          <ToggleRight className="h-4 w-4" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setDeletingProduct(product)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---- Add / Edit Modal ---- */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="รหัสสินค้า"
            placeholder="เช่น B001"
            value={form.product_code}
            onChange={(e) =>
              setForm((f) => ({ ...f, product_code: e.target.value }))
            }
            error={formErrors.product_code}
            disabled={!!editingProduct}
          />
          <Input
            label="ชื่อสินค้า"
            placeholder="เช่น เบียร์ช้าง"
            value={form.product_name}
            onChange={(e) =>
              setForm((f) => ({ ...f, product_name: e.target.value }))
            }
            error={formErrors.product_name}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              หมวดหมู่
            </label>
            <div className="relative">
              <input
                list="category-suggestions"
                className={cn(
                  'w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors',
                  'placeholder:text-gray-400',
                  'focus:ring-2 focus:ring-offset-0',
                  'dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500',
                  'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500/20 dark:border-gray-600 dark:focus:border-indigo-400'
                )}
                placeholder="เช่น เบียร์, วิสกี้, น้ำผลไม้"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="ขนาด"
              placeholder="เช่น 330ml"
              value={form.size}
              onChange={(e) =>
                setForm((f) => ({ ...f, size: e.target.value }))
              }
            />
            <Input
              label="หน่วยนับ"
              placeholder="เช่น ขวด, แก้ว, ลัง"
              value={form.unit}
              onChange={(e) =>
                setForm((f) => ({ ...f, unit: e.target.value }))
              }
              error={formErrors.unit}
            />
          </div>
          <Input
            label="ราคา (บาท)"
            placeholder="0.00"
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) =>
              setForm((f) => ({ ...f, price: e.target.value }))
            }
            error={formErrors.price}
          />
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-600">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                สถานะสินค้า
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {form.active ? 'เปิดใช้งาน - สินค้ายังมีในระบบ' : 'ปิดใช้งาน - ซ่อนจากทุกที่'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                form.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                  form.active ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-600">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                สถานะการนับสต๊อก
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {form.count_status === 'active'
                  ? 'นับปกติ - แสดงในรายการนับสต๊อก'
                  : 'ยกเว้นการนับ - มีในระบบแต่ไม่ต้องนับ'}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  count_status:
                    f.count_status === 'active' ? 'excluded' : 'active',
                }))
              }
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                form.count_status === 'active'
                  ? 'bg-blue-500'
                  : 'bg-amber-400 dark:bg-amber-500'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                  form.count_status === 'active'
                    ? 'translate-x-5'
                    : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={closeModal}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave} isLoading={saving}>
            บันทึก
          </Button>
        </ModalFooter>
      </Modal>

      {/* ---- Delete Confirmation Modal ---- */}
      <Modal
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        title="ยืนยันการลบสินค้า"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          คุณต้องการลบสินค้า{' '}
          <span className="font-semibold text-gray-900 dark:text-white">
            {deletingProduct?.product_name}
          </span>{' '}
          ({deletingProduct?.product_code}) ใช่หรือไม่?
        </p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          หากสินค้านี้เคยถูกใช้ในการนับสต๊อก จะถูกปิดใช้งานแทนการลบถาวร
        </p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeletingProduct(null)}>
            ยกเลิก
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleting}>
            ลบสินค้า
          </Button>
        </ModalFooter>
      </Modal>

      {/* ---- Import CSV Modal ---- */}
      <ImportCSVModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={fetchProducts}
      />
    </div>
  );
}
