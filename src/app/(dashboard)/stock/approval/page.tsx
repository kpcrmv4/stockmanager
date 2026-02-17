'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Input, Badge, Card, CardHeader, Tabs, EmptyState, toast } from '@/components/ui';
import { formatThaiDate, formatNumber, formatPercent } from '@/lib/utils/format';
import type { Comparison } from '@/types/database';
import {
  ArrowLeft,
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Minus,
  Clock,
  CheckCheck,
  Inbox,
  RefreshCw,
} from 'lucide-react';

type ViewFilter = 'explained' | 'approved' | 'rejected';

export default function ApprovalPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('explained');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ownerNotes, setOwnerNotes] = useState<Record<string, string>>({});

  const fetchComparisons = useCallback(async () => {
    if (!currentStoreId) return;

    setLoading(true);
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('comparisons')
        .select('*')
        .eq('store_id', currentStoreId)
        .in('status', ['explained', 'approved', 'rejected'])
        .order('comp_date', { ascending: false })
        .order('product_name', { ascending: true });

      if (error) throw error;

      setComparisons(data || []);
    } catch (error) {
      console.error('Error fetching comparisons:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดข้อมูลรออนุมัติได้',
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    fetchComparisons();
  }, [fetchComparisons]);

  const explainedItems = useMemo(
    () => comparisons.filter((c) => c.status === 'explained'),
    [comparisons]
  );

  const approvedItems = useMemo(
    () => comparisons.filter((c) => c.status === 'approved'),
    [comparisons]
  );

  const rejectedItems = useMemo(
    () => comparisons.filter((c) => c.status === 'rejected'),
    [comparisons]
  );

  const displayItems = useMemo(() => {
    let items: Comparison[];
    switch (viewFilter) {
      case 'explained':
        items = explainedItems;
        break;
      case 'approved':
        items = approvedItems;
        break;
      case 'rejected':
        items = rejectedItems;
        break;
      default:
        items = explainedItems;
    }

    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (c) =>
        (c.product_name || '').toLowerCase().includes(query) ||
        c.product_code.toLowerCase().includes(query)
    );
  }, [viewFilter, explainedItems, approvedItems, rejectedItems, searchQuery]);

  const handleNotesChange = (id: string, value: string) => {
    setOwnerNotes((prev) => ({ ...prev, [id]: value }));
  };

  const handleApprove = async (comparisonId: string) => {
    setProcessingId(comparisonId);
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('comparisons')
        .update({
          status: 'approved',
          approved_by: user?.id || null,
          approval_status: 'approved',
          owner_notes: ownerNotes[comparisonId]?.trim() || null,
        })
        .eq('id', comparisonId);

      if (error) throw error;

      setComparisons((prev) =>
        prev.map((c) =>
          c.id === comparisonId
            ? {
                ...c,
                status: 'approved' as const,
                approved_by: user?.id || null,
                approval_status: 'approved',
                owner_notes: ownerNotes[comparisonId]?.trim() || null,
              }
            : c
        )
      );

      toast({
        type: 'success',
        title: 'อนุมัติสำเร็จ',
        message: 'อนุมัติคำชี้แจงเรียบร้อย',
      });
    } catch (error) {
      console.error('Error approving:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถอนุมัติได้',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (comparisonId: string) => {
    const notes = ownerNotes[comparisonId]?.trim();
    if (!notes) {
      toast({
        type: 'warning',
        title: 'กรุณาระบุเหตุผล',
        message: 'กรุณาระบุหมายเหตุก่อนปฏิเสธ',
      });
      return;
    }

    setProcessingId(comparisonId);
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('comparisons')
        .update({
          status: 'rejected',
          approved_by: user?.id || null,
          approval_status: 'rejected',
          owner_notes: notes,
        })
        .eq('id', comparisonId);

      if (error) throw error;

      setComparisons((prev) =>
        prev.map((c) =>
          c.id === comparisonId
            ? {
                ...c,
                status: 'rejected' as const,
                approved_by: user?.id || null,
                approval_status: 'rejected',
                owner_notes: notes,
              }
            : c
        )
      );

      toast({
        type: 'success',
        title: 'ปฏิเสธสำเร็จ',
        message: 'ปฏิเสธคำชี้แจงเรียบร้อย',
      });
    } catch (error) {
      console.error('Error rejecting:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถปฏิเสธได้',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === explainedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(explainedItems.map((c) => c.id)));
    }
  };

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) {
      toast({
        type: 'warning',
        title: 'ไม่มีรายการที่เลือก',
        message: 'กรุณาเลือกรายการที่ต้องการอนุมัติ',
      });
      return;
    }

    setBatchProcessing(true);
    try {
      const supabase = createClient();

      const updates = Array.from(selectedIds).map((id) =>
        supabase
          .from('comparisons')
          .update({
            status: 'approved',
            approved_by: user?.id || null,
            approval_status: 'approved',
            owner_notes: ownerNotes[id]?.trim() || null,
          })
          .eq('id', id)
      );

      await Promise.all(updates);

      setComparisons((prev) =>
        prev.map((c) =>
          selectedIds.has(c.id)
            ? {
                ...c,
                status: 'approved' as const,
                approved_by: user?.id || null,
                approval_status: 'approved',
                owner_notes: ownerNotes[c.id]?.trim() || null,
              }
            : c
        )
      );

      toast({
        type: 'success',
        title: 'อนุมัติสำเร็จ',
        message: `อนุมัติ ${selectedIds.size} รายการเรียบร้อย`,
      });

      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error batch approving:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถอนุมัติแบบกลุ่มได้',
      });
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleBatchReject = async () => {
    if (selectedIds.size === 0) {
      toast({
        type: 'warning',
        title: 'ไม่มีรายการที่เลือก',
        message: 'กรุณาเลือกรายการที่ต้องการปฏิเสธ',
      });
      return;
    }

    setBatchProcessing(true);
    try {
      const supabase = createClient();

      const updates = Array.from(selectedIds).map((id) =>
        supabase
          .from('comparisons')
          .update({
            status: 'rejected',
            approved_by: user?.id || null,
            approval_status: 'rejected',
            owner_notes: ownerNotes[id]?.trim() || 'ปฏิเสธแบบกลุ่ม',
          })
          .eq('id', id)
      );

      await Promise.all(updates);

      setComparisons((prev) =>
        prev.map((c) =>
          selectedIds.has(c.id)
            ? {
                ...c,
                status: 'rejected' as const,
                approved_by: user?.id || null,
                approval_status: 'rejected',
                owner_notes: ownerNotes[c.id]?.trim() || 'ปฏิเสธแบบกลุ่ม',
              }
            : c
        )
      );

      toast({
        type: 'success',
        title: 'ปฏิเสธสำเร็จ',
        message: `ปฏิเสธ ${selectedIds.size} รายการเรียบร้อย`,
      });

      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error batch rejecting:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถปฏิเสธแบบกลุ่มได้',
      });
    } finally {
      setBatchProcessing(false);
    }
  };

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
              อนุมัติคำชี้แจงสต๊อก
            </h1>
          </div>
          <p className="mt-0.5 ml-9 text-sm text-gray-500 dark:text-gray-400">
            ตรวจสอบและอนุมัติคำชี้แจงส่วนต่างจากพนักงาน
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={fetchComparisons}
        >
          รีเฟรช
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-900/20">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              รออนุมัติ
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">
            {explainedItems.length}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-900/20">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-emerald-700 dark:text-emerald-300">
              อนุมัติ
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">
            {approvedItems.length}
          </p>
        </div>
        <div className="rounded-xl bg-red-50 p-4 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span className="text-sm text-red-700 dark:text-red-300">
              ปฏิเสธ
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-800 dark:text-red-200">
            {rejectedItems.length}
          </p>
        </div>
      </div>

      {/* View Filter Tabs */}
      <Tabs
        tabs={[
          {
            id: 'explained',
            label: 'รออนุมัติ',
            count: explainedItems.length,
          },
          { id: 'approved', label: 'อนุมัติแล้ว', count: approvedItems.length },
          { id: 'rejected', label: 'ปฏิเสธแล้ว', count: rejectedItems.length },
        ]}
        activeTab={viewFilter}
        onChange={(id) => {
          setViewFilter(id as ViewFilter);
          setSelectedIds(new Set());
        }}
      />

      {/* Search */}
      <Input
        placeholder="ค้นหาสินค้า..."
        leftIcon={<Search className="h-4 w-4" />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Select All (for explained view) */}
      {viewFilter === 'explained' && explainedItems.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={
                selectedIds.size === explainedItems.length &&
                explainedItems.length > 0
              }
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
            />
            เลือกทั้งหมด ({explainedItems.length})
          </label>
          {selectedIds.size > 0 && (
            <span className="text-xs text-indigo-600 dark:text-indigo-400">
              เลือกแล้ว {selectedIds.size} รายการ
            </span>
          )}
        </div>
      )}

      {/* Items List */}
      {displayItems.length === 0 ? (
        <EmptyState
          icon={viewFilter === 'explained' ? Shield : Inbox}
          title={
            viewFilter === 'explained'
              ? 'ไม่มีรายการรออนุมัติ'
              : viewFilter === 'approved'
                ? 'ยังไม่มีรายการที่อนุมัติ'
                : 'ยังไม่มีรายการที่ปฏิเสธ'
          }
          description={
            viewFilter === 'explained'
              ? 'คำชี้แจงทั้งหมดได้รับการตรวจสอบแล้ว'
              : 'เมื่อมีการอนุมัติ/ปฏิเสธจะแสดงที่นี่'
          }
        />
      ) : (
        <div className="space-y-3">
          {displayItems.map((item) => {
            const isProcessing = processingId === item.id;
            const isExplained = item.status === 'explained';
            const isSelected = selectedIds.has(item.id);
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
                  'rounded-xl bg-white p-4 shadow-sm ring-1 transition-colors dark:bg-gray-800',
                  isSelected
                    ? 'ring-indigo-300 dark:ring-indigo-700'
                    : 'ring-gray-200 dark:ring-gray-700',
                  isProcessing && 'opacity-60'
                )}
              >
                {/* Header with checkbox */}
                <div className="flex items-start gap-3">
                  {isExplained && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectItem(item.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.product_name || item.product_code}
                        </p>
                        <p className="text-xs text-gray-400">
                          {item.product_code}
                        </p>
                      </div>
                      {item.status === 'approved' && (
                        <Badge variant="success">อนุมัติ</Badge>
                      )}
                      {item.status === 'rejected' && (
                        <Badge variant="danger">ปฏิเสธ</Badge>
                      )}
                      {item.status === 'explained' && (
                        <Badge variant="info">รออนุมัติ</Badge>
                      )}
                    </div>

                    {/* Quantity Details */}
                    <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          POS
                        </p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.pos_quantity !== null
                            ? formatNumber(item.pos_quantity)
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          นับจริง
                        </p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.manual_quantity !== null
                            ? formatNumber(item.manual_quantity)
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          ส่วนต่าง
                        </p>
                        <div className="flex items-center gap-1">
                          <DiffIcon
                            className={cn(
                              'h-3 w-3',
                              isOverTolerance
                                ? 'text-red-500'
                                : 'text-yellow-500'
                            )}
                          />
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
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          %
                        </p>
                        <p
                          className={cn(
                            'text-sm font-medium',
                            isOverTolerance
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-yellow-600 dark:text-yellow-400'
                          )}
                        >
                          {item.diff_percent !== null
                            ? formatPercent(item.diff_percent)
                            : '-'}
                        </p>
                      </div>
                    </div>

                    {/* Staff Explanation */}
                    {item.explanation && (
                      <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
                        <p className="text-[10px] font-medium text-blue-600 dark:text-blue-500">
                          คำชี้แจงจากพนักงาน:
                        </p>
                        <div className="mt-0.5 flex items-start gap-1.5">
                          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            {item.explanation}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Date */}
                    <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                      วันที่: {formatThaiDate(item.comp_date)}
                    </p>

                    {/* Owner Notes & Actions (for explained items) */}
                    {isExplained && (
                      <div className="mt-3 space-y-2">
                        <input
                          type="text"
                          placeholder="หมายเหตุจากเจ้าของ (ถ้ามี)..."
                          value={ownerNotes[item.id] || ''}
                          onChange={(e) =>
                            handleNotesChange(item.id, e.target.value)
                          }
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:placeholder:text-gray-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(item.id)}
                            disabled={isProcessing}
                            className={cn(
                              'flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors',
                              'hover:bg-emerald-700 active:bg-emerald-800',
                              'disabled:cursor-not-allowed disabled:opacity-60'
                            )}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                            อนุมัติ
                          </button>
                          <button
                            onClick={() => handleReject(item.id)}
                            disabled={isProcessing}
                            className={cn(
                              'flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors',
                              'hover:bg-red-700 active:bg-red-800',
                              'disabled:cursor-not-allowed disabled:opacity-60'
                            )}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            ปฏิเสธ
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Owner Notes Display (for processed items) */}
                    {(item.status === 'approved' || item.status === 'rejected') &&
                      item.owner_notes && (
                        <div
                          className={cn(
                            'mt-2 rounded-lg px-3 py-2',
                            item.status === 'approved'
                              ? 'bg-emerald-50 dark:bg-emerald-900/20'
                              : 'bg-red-50 dark:bg-red-900/20'
                          )}
                        >
                          <p
                            className={cn(
                              'text-[10px] font-medium',
                              item.status === 'approved'
                                ? 'text-emerald-600 dark:text-emerald-500'
                                : 'text-red-600 dark:text-red-500'
                            )}
                          >
                            หมายเหตุจากเจ้าของ:
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 text-sm',
                              item.status === 'approved'
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-red-700 dark:text-red-300'
                            )}
                          >
                            {item.owner_notes}
                          </p>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Batch Action Footer (only for explained view with selections) */}
      {viewFilter === 'explained' && selectedIds.size > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              เลือกแล้ว{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {selectedIds.size}
              </span>{' '}
              รายการ
            </div>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                icon={<XCircle className="h-4 w-4" />}
                isLoading={batchProcessing}
                onClick={handleBatchReject}
              >
                ปฏิเสธทั้งหมด
              </Button>
              <Button
                size="sm"
                icon={<CheckCheck className="h-4 w-4" />}
                isLoading={batchProcessing}
                onClick={handleBatchApprove}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                อนุมัติทั้งหมด ({selectedIds.size})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
