'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Input, Badge, Card, CardHeader, Tabs, EmptyState, Textarea, toast } from '@/components/ui';
import { formatThaiDate, formatNumber, formatPercent } from '@/lib/utils/format';
import type { Comparison } from '@/types/database';
import {
  ArrowLeft,
  Search,
  FileText,
  Send,
  Loader2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
  Clock,
  MessageSquare,
  Inbox,
} from 'lucide-react';

type ViewFilter = 'pending' | 'explained';

export default function ExplanationPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submittingAll, setSubmittingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('pending');

  const fetchComparisons = useCallback(async () => {
    if (!currentStoreId) return;

    setLoading(true);
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('comparisons')
        .select('*')
        .eq('store_id', currentStoreId)
        .in('status', ['pending', 'explained'])
        .neq('difference', 0)
        .order('comp_date', { ascending: false })
        .order('product_name', { ascending: true });

      if (error) throw error;

      setComparisons(data || []);

      // Initialize explanation text from existing data
      const initExplanations: Record<string, string> = {};
      (data || []).forEach((c) => {
        initExplanations[c.id] = c.explanation || '';
      });
      setExplanations(initExplanations);
    } catch (error) {
      console.error('Error fetching comparisons:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดข้อมูลส่วนต่างได้',
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    fetchComparisons();
  }, [fetchComparisons]);

  const pendingItems = useMemo(
    () => comparisons.filter((c) => c.status === 'pending'),
    [comparisons]
  );

  const explainedItems = useMemo(
    () => comparisons.filter((c) => c.status === 'explained'),
    [comparisons]
  );

  const displayItems = useMemo(() => {
    const items = viewFilter === 'pending' ? pendingItems : explainedItems;
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (c) =>
        (c.product_name || '').toLowerCase().includes(query) ||
        c.product_code.toLowerCase().includes(query)
    );
  }, [viewFilter, pendingItems, explainedItems, searchQuery]);

  const handleExplanationChange = (id: string, value: string) => {
    setExplanations((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmitSingle = async (comparisonId: string) => {
    const explanation = explanations[comparisonId]?.trim();
    if (!explanation) {
      toast({
        type: 'warning',
        title: 'กรุณากรอกคำชี้แจง',
        message: 'ต้องระบุเหตุผลประกอบการชี้แจงส่วนต่าง',
      });
      return;
    }

    setSubmittingId(comparisonId);
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('comparisons')
        .update({
          explanation,
          explained_by: user?.id || null,
          status: 'explained',
        })
        .eq('id', comparisonId);

      if (error) throw error;

      // Update local state
      setComparisons((prev) =>
        prev.map((c) =>
          c.id === comparisonId
            ? { ...c, explanation, explained_by: user?.id || null, status: 'explained' as const }
            : c
        )
      );

      toast({
        type: 'success',
        title: 'บันทึกสำเร็จ',
        message: 'ส่งคำชี้แจงเรียบร้อย',
      });
    } catch (error) {
      console.error('Error submitting explanation:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถบันทึกคำชี้แจงได้',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleSubmitAll = async () => {
    const itemsToSubmit = pendingItems.filter(
      (c) => explanations[c.id]?.trim()
    );

    if (itemsToSubmit.length === 0) {
      toast({
        type: 'warning',
        title: 'ไม่มีรายการที่จะส่ง',
        message: 'กรุณากรอกคำชี้แจงอย่างน้อย 1 รายการ',
      });
      return;
    }

    setSubmittingAll(true);
    try {
      const supabase = createClient();

      // Submit all explanations
      const updates = itemsToSubmit.map((item) =>
        supabase
          .from('comparisons')
          .update({
            explanation: explanations[item.id].trim(),
            explained_by: user?.id || null,
            status: 'explained',
          })
          .eq('id', item.id)
      );

      await Promise.all(updates);

      // Update local state
      const submittedIds = new Set(itemsToSubmit.map((i) => i.id));
      setComparisons((prev) =>
        prev.map((c) =>
          submittedIds.has(c.id)
            ? {
                ...c,
                explanation: explanations[c.id].trim(),
                explained_by: user?.id || null,
                status: 'explained' as const,
              }
            : c
        )
      );

      toast({
        type: 'success',
        title: 'บันทึกสำเร็จ',
        message: `ส่งคำชี้แจง ${itemsToSubmit.length} รายการเรียบร้อย`,
      });
    } catch (error) {
      console.error('Error submitting all explanations:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถบันทึกคำชี้แจงได้',
      });
    } finally {
      setSubmittingAll(false);
    }
  };

  const filledCount = pendingItems.filter(
    (c) => explanations[c.id]?.trim()
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
      <div>
        <div className="flex items-center gap-2">
          <a
            href="/stock"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </a>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            ชี้แจงส่วนต่างสต๊อก
          </h1>
        </div>
        <p className="mt-0.5 ml-9 text-sm text-gray-500 dark:text-gray-400">
          อธิบายเหตุผลสำหรับสินค้าที่มีส่วนต่าง
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-900/20">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              รอชี้แจง
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">
            {pendingItems.length}
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              ชี้แจงแล้ว
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">
            {explainedItems.length}
          </p>
        </div>
      </div>

      {/* View Filter Tabs */}
      <Tabs
        tabs={[
          { id: 'pending', label: 'รอชี้แจง', count: pendingItems.length },
          { id: 'explained', label: 'ชี้แจงแล้ว', count: explainedItems.length },
        ]}
        activeTab={viewFilter}
        onChange={(id) => setViewFilter(id as ViewFilter)}
      />

      {/* Search */}
      <Input
        placeholder="ค้นหาสินค้า..."
        leftIcon={<Search className="h-4 w-4" />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Items List */}
      {displayItems.length === 0 ? (
        <EmptyState
          icon={viewFilter === 'pending' ? Inbox : FileText}
          title={
            viewFilter === 'pending'
              ? 'ไม่มีรายการที่รอชี้แจง'
              : 'ยังไม่มีรายการที่ชี้แจงแล้ว'
          }
          description={
            viewFilter === 'pending'
              ? 'รายการส่วนต่างทั้งหมดได้รับการชี้แจงแล้ว'
              : 'เมื่อชี้แจงส่วนต่างแล้วจะแสดงที่นี่'
          }
        />
      ) : (
        <div className="space-y-3">
          {displayItems.map((item) => {
            const isSubmitting = submittingId === item.id;
            const isPending = item.status === 'pending';
            const explanation = explanations[item.id] || '';
            const DiffIcon =
              item.difference === null || item.difference === 0
                ? Minus
                : item.difference > 0
                  ? TrendingUp
                  : TrendingDown;
            const isOverTolerance =
              item.diff_percent !== null && Math.abs(item.diff_percent) > 5;

            return (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl bg-white p-4 shadow-sm ring-1 dark:bg-gray-800',
                  isOverTolerance
                    ? 'ring-red-200 dark:ring-red-800'
                    : 'ring-gray-200 dark:ring-gray-700'
                )}
              >
                {/* Product Info */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.product_name || item.product_code}
                    </p>
                    <p className="text-xs text-gray-400">{item.product_code}</p>
                  </div>
                  {isPending ? (
                    <Badge variant="warning">รอชี้แจง</Badge>
                  ) : (
                    <Badge variant="info">ชี้แจงแล้ว</Badge>
                  )}
                </div>

                {/* Discrepancy Details */}
                <div className="mt-3 flex items-center gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">POS</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.pos_quantity !== null
                        ? formatNumber(item.pos_quantity)
                        : '-'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">
                      นับจริง
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.manual_quantity !== null
                        ? formatNumber(item.manual_quantity)
                        : '-'}
                    </p>
                  </div>
                  <div className="flex-1" />
                  <div className="flex items-center gap-1.5">
                    <DiffIcon
                      className={cn(
                        'h-4 w-4',
                        isOverTolerance
                          ? 'text-red-500'
                          : 'text-yellow-500'
                      )}
                    />
                    <div className="text-right">
                      <p
                        className={cn(
                          'text-sm font-bold',
                          isOverTolerance
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                        )}
                      >
                        {item.difference !== null
                          ? (item.difference > 0 ? '+' : '') +
                            formatNumber(item.difference)
                          : '-'}
                      </p>
                      <p
                        className={cn(
                          'text-[10px] font-medium',
                          isOverTolerance
                            ? 'text-red-500'
                            : 'text-yellow-500'
                        )}
                      >
                        {item.diff_percent !== null
                          ? formatPercent(item.diff_percent)
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Date */}
                <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                  วันที่: {formatThaiDate(item.comp_date)}
                </p>

                {/* Explanation Input / Display */}
                <div className="mt-3">
                  {isPending ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        placeholder="กรอกคำชี้แจงส่วนต่าง เช่น แตกเสียหาย, ของหมดอายุ, คำนวณผิด..."
                        value={explanation}
                        onChange={(e) =>
                          handleExplanationChange(item.id, e.target.value)
                        }
                        className={cn(
                          'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors',
                          'placeholder:text-gray-400',
                          'focus:ring-2 focus:ring-offset-0',
                          'dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500',
                          'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500/20 dark:border-gray-600 dark:focus:border-indigo-400'
                        )}
                      />
                      <Button
                        size="sm"
                        icon={<Send className="h-3.5 w-3.5" />}
                        isLoading={isSubmitting}
                        disabled={!explanation.trim()}
                        onClick={() => handleSubmitSingle(item.id)}
                        className="w-full"
                      >
                        ส่งคำชี้แจง
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          {item.explanation}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Batch Submit Footer (only for pending view) */}
      {viewFilter === 'pending' && pendingItems.length > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              กรอกแล้ว{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {filledCount}
              </span>{' '}
              / {pendingItems.length} รายการ
            </div>
            <Button
              size="sm"
              icon={<Send className="h-4 w-4" />}
              isLoading={submittingAll}
              disabled={filledCount === 0}
              onClick={handleSubmitAll}
            >
              ส่งทั้งหมด ({filledCount})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
