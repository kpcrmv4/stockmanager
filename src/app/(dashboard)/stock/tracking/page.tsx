'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Card, CardHeader, CardContent, EmptyState, Badge, Textarea, toast } from '@/components/ui';
import { formatNumber, formatThaiDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  Pin,
  PinOff,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Search,
  Loader2,
  Package,
  ArrowUpDown,
  X,
  HelpCircle,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const TRACKING_ROLES = ['owner', 'accountant', 'manager', 'hq'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendRow {
  product_code: string;
  product_name: string | null;
  total_count: number;
  pending_count: number;
  rejected_count: number;
  approved_count: number;
  total_abs_diff: number;
  total_signed_diff: number;
  avg_diff: number;
  last_diff: number;
  last_status: string;
  last_comp_date: string;
  trend_slope: number;
  daily_diffs: Array<{ date: string; diff: number }>;
}

interface TrackingItem {
  id: string;
  store_id: string;
  product_code: string;
  product_name: string | null;
  is_tracking: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  reason: string | null;
  notes: string | null;
  follow_up_action: string | null;
  source: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

type FilterStatus = 'all' | 'tracking' | 'resolved' | 'untracked';
type FilterTrend = 'all' | 'worsening' | 'improving' | 'stable';
type SortBy = 'abs_diff' | 'pending' | 'recent' | 'slope';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyTrend(slope: number): 'worsening' | 'improving' | 'stable' {
  if (slope > 0.05) return 'worsening';
  if (slope < -0.05) return 'improving';
  return 'stable';
}

const PRIORITY_CONFIG: Record<TrackingItem['priority'], { label: string; bg: string; text: string }> = {
  urgent: { label: 'ด่วนมาก', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  high: { label: 'สูง', bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  normal: { label: 'ปกติ', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  low: { label: 'ต่ำ', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
};

// RecentDiffChips: show last N daily diffs as colored numerical chips —
// easier to read at a glance than a tiny sparkline. Newest on the right.
function RecentDiffChips({
  data,
  limit = 7,
}: {
  data: Array<{ date: string; diff: number }>;
  limit?: number;
}) {
  if (data.length === 0) {
    return <span className="text-[10px] text-gray-400">—</span>;
  }
  // Take last `limit` items (already ascending by date from query)
  const recent = data.slice(-limit);
  return (
    <div className="flex items-center gap-0.5">
      {recent.map((d, i) => {
        const v = Number(d.diff);
        const isShort = v < 0;
        const isSurplus = v > 0;
        const text = v === 0 ? '0' : isShort ? `${v}` : `+${v}`;
        return (
          <span
            key={i}
            title={`${formatThaiDate(d.date)}: ${text}`}
            className={cn(
              'inline-flex min-w-[24px] items-center justify-center rounded px-1 py-0.5 text-[10px] font-medium tabular-nums',
              isShort && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              isSurplus && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
              v === 0 && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
            )}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function StockTrackingPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const canEdit = !!user && TRACKING_ROLES.includes(user.role);

  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('tracking');
  const [filterTrend, setFilterTrend] = useState<FilterTrend>('all');
  const [filterPriority, setFilterPriority] = useState<TrackingItem['priority'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('abs_diff');

  const [editingItem, setEditingItem] = useState<{
    product_code: string;
    product_name: string;
    existing: TrackingItem | null;
  } | null>(null);

  const [showHelp, setShowHelp] = useState(false);

  // Per-card history toggle
  interface HistoryEvent {
    id: string;
    action: string;
    payload: Record<string, unknown> | null;
    created_at: string;
    created_by_name?: string | null;
  }
  const [expandedHistory, setExpandedHistory] = useState<Record<string, HistoryEvent[] | 'loading'>>({});

  const toggleHistory = useCallback(async (trackingItemId: string) => {
    if (expandedHistory[trackingItemId]) {
      // Collapse
      setExpandedHistory((prev) => {
        const next = { ...prev };
        delete next[trackingItemId];
        return next;
      });
      return;
    }
    setExpandedHistory((prev) => ({ ...prev, [trackingItemId]: 'loading' }));
    const supabase = createClient();
    const { data } = await supabase
      .from('stock_tracking_history')
      .select('id, action, payload, created_at, profile:profiles!stock_tracking_history_created_by_fkey(display_name, username)')
      .eq('tracking_item_id', trackingItemId)
      .order('created_at', { ascending: false });
    const events: HistoryEvent[] = (data || []).map((d) => {
      const pr = d.profile as { display_name?: string; username?: string } | null;
      return {
        id: d.id,
        action: d.action,
        payload: d.payload as Record<string, unknown> | null,
        created_at: d.created_at,
        created_by_name: pr?.display_name || pr?.username || null,
      };
    });
    setExpandedHistory((prev) => ({ ...prev, [trackingItemId]: events }));
  }, [expandedHistory]);

  const [editForm, setEditForm] = useState({
    is_tracking: true,
    priority: 'normal' as TrackingItem['priority'],
    reason: '',
    notes: '',
    follow_up_action: '',
    resolution_notes: '',
  });

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!currentStoreId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const [trendsRes, itemsRes] = await Promise.all([
        supabase.rpc('get_tracking_trend', { p_store_id: currentStoreId, p_days: 30 }),
        supabase.from('stock_tracking_items').select('*').eq('store_id', currentStoreId),
      ]);
      if (trendsRes.data) setTrends(trendsRes.data as TrendRow[]);
      if (itemsRes.data) setItems(itemsRes.data as TrackingItem[]);
    } catch (err) {
      console.error('Tracking load error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Merge trend + tracking item ──
  const mergedRows = useMemo(() => {
    const itemMap = new Map(items.map((i) => [i.product_code, i]));
    return trends.map((t) => ({
      ...t,
      tracking: itemMap.get(t.product_code) || null,
    }));
  }, [trends, items]);

  // ── Filter + sort ──
  const displayed = useMemo(() => {
    let result = mergedRows;

    // Filter status
    if (filterStatus === 'tracking') {
      result = result.filter((r) => r.tracking?.is_tracking);
    } else if (filterStatus === 'resolved') {
      result = result.filter((r) => r.tracking && !r.tracking.is_tracking);
    } else if (filterStatus === 'untracked') {
      result = result.filter((r) => !r.tracking);
    }

    // Filter trend
    if (filterTrend !== 'all') {
      result = result.filter((r) => classifyTrend(r.trend_slope) === filterTrend);
    }

    // Filter priority
    if (filterPriority !== 'all') {
      result = result.filter((r) => r.tracking?.priority === filterPriority);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.product_code.toLowerCase().includes(q) ||
          (r.product_name || '').toLowerCase().includes(q),
      );
    }

    // Sort
    const sorted = [...result];
    if (sortBy === 'abs_diff') sorted.sort((a, b) => b.total_abs_diff - a.total_abs_diff);
    else if (sortBy === 'pending') sorted.sort((a, b) => b.pending_count - a.pending_count);
    else if (sortBy === 'recent') sorted.sort((a, b) => (a.last_comp_date < b.last_comp_date ? 1 : -1));
    else if (sortBy === 'slope') sorted.sort((a, b) => b.trend_slope - a.trend_slope);
    return sorted;
  }, [mergedRows, filterStatus, filterTrend, filterPriority, searchQuery, sortBy]);

  // ── Stats summary ──
  const stats = useMemo(() => {
    const tracking = items.filter((i) => i.is_tracking).length;
    const urgent = items.filter((i) => i.is_tracking && i.priority === 'urgent').length;
    const totalProducts = trends.length;
    const worsening = trends.filter((t) => classifyTrend(t.trend_slope) === 'worsening').length;
    const totalPending = trends.reduce((s, t) => s + t.pending_count, 0);
    return { tracking, urgent, totalProducts, worsening, totalPending };
  }, [items, trends]);

  // ── Open edit modal ──
  const openEdit = (row: typeof mergedRows[0]) => {
    if (!canEdit) {
      toast({ type: 'warning', title: 'ไม่มีสิทธิ์แก้ไข' });
      return;
    }
    setEditingItem({
      product_code: row.product_code,
      product_name: row.product_name || row.product_code,
      existing: row.tracking,
    });
    if (row.tracking) {
      setEditForm({
        is_tracking: row.tracking.is_tracking,
        priority: row.tracking.priority,
        reason: row.tracking.reason || '',
        notes: row.tracking.notes || '',
        follow_up_action: row.tracking.follow_up_action || '',
        resolution_notes: row.tracking.resolution_notes || '',
      });
    } else {
      setEditForm({
        is_tracking: true,
        priority: 'normal',
        reason: '',
        notes: '',
        follow_up_action: '',
        resolution_notes: '',
      });
    }
  };

  // ── Save (upsert) ──
  const handleSave = async () => {
    if (!editingItem || !user || !currentStoreId) return;
    const supabase = createClient();
    try {
      const isNew = !editingItem.existing;
      let itemId: string | null = editingItem.existing?.id || null;

      if (isNew) {
        const { data, error } = await supabase
          .from('stock_tracking_items')
          .insert({
            store_id: currentStoreId,
            product_code: editingItem.product_code,
            product_name: editingItem.product_name,
            is_tracking: editForm.is_tracking,
            priority: editForm.priority,
            reason: editForm.reason || null,
            notes: editForm.notes || null,
            follow_up_action: editForm.follow_up_action || null,
            source: 'manual',
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        itemId = data.id;
      } else {
        const wasTracking = editingItem.existing!.is_tracking;
        const isResolving = wasTracking && !editForm.is_tracking;
        const isReopening = !wasTracking && editForm.is_tracking;
        const { error } = await supabase
          .from('stock_tracking_items')
          .update({
            is_tracking: editForm.is_tracking,
            priority: editForm.priority,
            reason: editForm.reason || null,
            notes: editForm.notes || null,
            follow_up_action: editForm.follow_up_action || null,
            resolution_notes: isResolving ? editForm.resolution_notes || null : editingItem.existing!.resolution_notes,
            resolved_at: isResolving ? new Date().toISOString() : isReopening ? null : editingItem.existing!.resolved_at,
            resolved_by: isResolving ? user.id : isReopening ? null : editingItem.existing!.resolved_by,
          })
          .eq('id', editingItem.existing!.id);
        if (error) throw error;
      }

      // History log
      if (itemId) {
        const action = isNew
          ? 'flagged'
          : !editForm.is_tracking
            ? 'resolved'
            : !editingItem.existing!.is_tracking
              ? 'reopened'
              : 'noted';
        await supabase.from('stock_tracking_history').insert({
          tracking_item_id: itemId,
          action,
          payload: {
            priority: editForm.priority,
            reason: editForm.reason,
            notes: editForm.notes,
            follow_up_action: editForm.follow_up_action,
            resolution_notes: editForm.resolution_notes,
          },
          created_by: user.id,
        });
      }

      toast({ type: 'success', title: 'บันทึกสำเร็จ' });
      setEditingItem(null);
      await loadData();
    } catch (err) {
      toast({
        type: 'error',
        title: 'บันทึกไม่สำเร็จ',
        message: err instanceof Error ? err.message : '',
      });
    }
  };

  // ── Auto-flag (run server-detected suggestions) ──
  const handleAutoFlag = async () => {
    if (!currentStoreId || !user) return;
    const supabase = createClient();
    // Suggest: products with rejected_count >= 1 OR pending_count >= 3 in 30 days
    // and not already tracked.
    const candidates = trends.filter((t) => {
      if (t.rejected_count >= 1 || t.pending_count >= 3) {
        return !items.find((i) => i.product_code === t.product_code);
      }
      return false;
    });
    if (candidates.length === 0) {
      toast({ type: 'info', title: 'ไม่มีรายการเข้าเกณฑ์ใหม่' });
      return;
    }
    try {
      const rows = candidates.map((c) => ({
        store_id: currentStoreId,
        product_code: c.product_code,
        product_name: c.product_name,
        is_tracking: true,
        priority: c.rejected_count > 0 ? 'high' : 'normal',
        reason:
          c.rejected_count > 0
            ? `เจ้าของไม่อนุมัติคำชี้แจง ${c.rejected_count} ครั้งใน 30 วัน`
            : `ส่วนต่างค้างชี้แจง ${c.pending_count} ครั้งใน 30 วัน`,
        source: c.rejected_count > 0 ? 'auto_rejected' : 'auto_recurring',
        created_by: user.id,
      }));
      const { data, error } = await supabase
        .from('stock_tracking_items')
        .insert(rows)
        .select('id, product_code');
      if (error) throw error;

      if (data) {
        await supabase.from('stock_tracking_history').insert(
          data.map((d) => ({
            tracking_item_id: d.id,
            action: 'auto_flagged',
            payload: { product_code: d.product_code },
            created_by: user.id,
          })),
        );
      }
      toast({
        type: 'success',
        title: `Auto-flag ${candidates.length} รายการ`,
      });
      await loadData();
    } catch (err) {
      toast({
        type: 'error',
        title: 'Auto-flag ไม่สำเร็จ',
        message: err instanceof Error ? err.message : '',
      });
    }
  };

  if (!currentStoreId) {
    return (
      <EmptyState
        icon={Package}
        title="กรุณาเลือกสาขา"
        description="เลือกสาขาก่อนดูข้อมูลติดตาม"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">
            ติดตามผลต่างสต๊อก
          </h1>
          <p className="mt-0.5 text-xs text-gray-500 sm:text-sm dark:text-gray-400">
            ดูแนวโน้มและจัดการรายการที่ต้องติดตาม (30 วันล่าสุด)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<HelpCircle className="h-3.5 w-3.5" />}
            onClick={() => setShowHelp(true)}
          >
            วิธีใช้
          </Button>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              icon={<Pin className="h-3.5 w-3.5" />}
              onClick={handleAutoFlag}
            >
              Auto-flag
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="กำลังติดตาม" value={stats.tracking} color="indigo" icon={Pin} />
        <StatCard label="ด่วนมาก" value={stats.urgent} color="red" icon={AlertTriangle} />
        <StatCard label="แนวโน้มแย่ลง" value={stats.worsening} color="orange" icon={TrendingUp} />
        <StatCard label="ค้างชี้แจง" value={stats.totalPending} color="amber" icon={AlertTriangle} />
        <StatCard label="สินค้ามีผลต่าง" value={stats.totalProducts} color="blue" icon={Package} />
      </div>

      {/* Filter row */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า/รหัส..."
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <FilterPill label="ทั้งหมด" active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} />
            <FilterPill label="กำลังติดตาม" active={filterStatus === 'tracking'} onClick={() => setFilterStatus('tracking')} />
            <FilterPill label="ปิดเคสแล้ว" active={filterStatus === 'resolved'} onClick={() => setFilterStatus('resolved')} />
            <FilterPill label="ยังไม่ flag" active={filterStatus === 'untracked'} onClick={() => setFilterStatus('untracked')} />

            <div className="ml-2 h-4 w-px bg-gray-200 dark:bg-gray-700" />

            <FilterPill label="↗ แย่ลง" active={filterTrend === 'worsening'} onClick={() => setFilterTrend(filterTrend === 'worsening' ? 'all' : 'worsening')} color="red" />
            <FilterPill label="↘ ดีขึ้น" active={filterTrend === 'improving'} onClick={() => setFilterTrend(filterTrend === 'improving' ? 'all' : 'improving')} color="emerald" />

            <div className="ml-2 h-4 w-px bg-gray-200 dark:bg-gray-700" />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="abs_diff">เรียง: ผลต่างรวมมาก</option>
              <option value="pending">เรียง: ค้างชี้แจงมาก</option>
              <option value="slope">เรียง: เทรนแย่ลง</option>
              <option value="recent">เรียง: ล่าสุด</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState icon={Package} title="ไม่มีรายการ" description="ลองเปลี่ยนตัวกรอง หรือไม่มีผลต่างใน 30 วันล่าสุด" />
      ) : (
        <div className="space-y-2">
          {displayed.map((row) => {
            const trendType = classifyTrend(row.trend_slope);
            const tracking = row.tracking;
            return (
              <Card key={row.product_code} padding="sm">
                <CardContent>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    {/* Left: product + chart */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                              {row.product_name || row.product_code}
                            </p>
                            <span className="font-mono text-xs text-gray-400">{row.product_code}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {tracking?.is_tracking && (
                              <Badge size="sm" variant="info">
                                <Pin className="mr-0.5 h-3 w-3" />
                                ติดตาม
                              </Badge>
                            )}
                            {tracking?.is_tracking && tracking.priority !== 'normal' && (
                              <span
                                className={cn(
                                  'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                  PRIORITY_CONFIG[tracking.priority].bg,
                                  PRIORITY_CONFIG[tracking.priority].text,
                                )}
                              >
                                {PRIORITY_CONFIG[tracking.priority].label}
                              </span>
                            )}
                            {tracking && !tracking.is_tracking && (
                              <Badge size="sm" variant="success">
                                <CheckCircle2 className="mr-0.5 h-3 w-3" />
                                ปิดเคสแล้ว
                              </Badge>
                            )}
                            <TrendBadge type={trendType} slope={row.trend_slope} />
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="mb-0.5 text-[10px] text-gray-400">7 วันล่าสุด</p>
                          <RecentDiffChips data={row.daily_diffs} />
                          <p className="mt-1 text-[10px] text-gray-400">รวม {row.daily_diffs.length} วัน</p>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                        <Stat label="ผลต่างรวม" value={`${formatNumber(row.total_abs_diff)}`} />
                        <Stat label="ค่าเฉลี่ย" value={`${formatNumber(Math.round(row.avg_diff * 100) / 100)}`} color={row.avg_diff < 0 ? 'red' : row.avg_diff > 0 ? 'amber' : 'gray'} />
                        <Stat label="ค้างชี้แจง" value={String(row.pending_count)} color={row.pending_count > 0 ? 'amber' : 'gray'} />
                        <Stat label="ปฏิเสธ" value={String(row.rejected_count)} color={row.rejected_count > 0 ? 'red' : 'gray'} />
                      </div>

                      {tracking?.is_tracking && tracking.reason && (
                        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                          <span className="font-semibold">เหตุผล:</span> {tracking.reason}
                        </p>
                      )}
                      {tracking?.is_tracking && tracking.follow_up_action && (
                        <p className="mt-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                          <span className="font-semibold">ติดตาม:</span> {tracking.follow_up_action}
                        </p>
                      )}
                    </div>

                    {/* Right: action */}
                    <div className="flex shrink-0 flex-col gap-2">
                      <Button size="sm" variant={tracking?.is_tracking ? 'outline' : 'primary'} onClick={() => openEdit(row)} disabled={!canEdit}>
                        {tracking?.is_tracking ? 'แก้ไข' : tracking ? 'เปิดอีกครั้ง' : 'flag'}
                      </Button>
                      {tracking && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<History className="h-3.5 w-3.5" />}
                          onClick={() => toggleHistory(tracking.id)}
                        >
                          ประวัติ
                          {expandedHistory[tracking.id] && expandedHistory[tracking.id] !== 'loading'
                            ? <ChevronUp className="ml-1 h-3 w-3" />
                            : <ChevronDown className="ml-1 h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* History timeline */}
                  {tracking && expandedHistory[tracking.id] && (
                    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
                      {expandedHistory[tracking.id] === 'loading' ? (
                        <div className="flex justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                      ) : (expandedHistory[tracking.id] as HistoryEvent[]).length === 0 ? (
                        <p className="text-center text-xs text-gray-400">ไม่มีประวัติ</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {(expandedHistory[tracking.id] as HistoryEvent[]).map((ev) => (
                            <HistoryRow key={ev.id} ev={ev} />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={() => setShowHelp(false)}>
          <div className="my-8 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader
                title="วิธีใช้งานระบบติดตาม"
                description="แนวคิด + การทำงาน + ขั้นตอน"
                action={
                  <button onClick={() => setShowHelp(false)} className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <X className="h-4 w-4" />
                  </button>
                }
              />
              <CardContent>
                <div className="space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  <div>
                    <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">📌 ระบบนี้ทำอะไร</h3>
                    <p>
                      เก็บประวัติสินค้าที่มีผลต่างซ้ำๆ ให้ owner/accountant ติดตามได้ระยะยาว
                      แทนที่จะดู comparison รายวันแยกกัน — รวมเป็น "ภาพรวมต่อสินค้า" ใน 30 วัน
                      พร้อมโน๊ต บทสรุป และ history ทุก action
                    </p>
                  </div>

                  <div>
                    <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">🎯 ขั้นตอนใช้งาน</h3>
                    <ol className="list-decimal space-y-1 pl-5">
                      <li>ดูสินค้าที่ chip เป็น <span className="rounded bg-red-100 px-1 text-red-700 dark:bg-red-900/30 dark:text-red-400">-2</span> ติดกันหลายวัน หรือมี <strong>ค้างชี้แจง</strong>/<strong>ปฏิเสธ</strong> สูง</li>
                      <li>กดปุ่ม <strong>flag</strong> ที่การ์ดนั้น → กรอกเหตุผล + Priority + สิ่งที่ต้องติดตาม</li>
                      <li>เมื่อ comparison ใหม่ๆ เข้ามา → กลับมา <strong>แก้ไข</strong> เพิ่มโน๊ต / เปลี่ยน priority</li>
                      <li>เมื่อปัญหาแก้ได้ → uncheck <strong>กำลังติดตาม</strong> + กรอก <strong>บทสรุป (resolution)</strong> → ปิดเคส</li>
                      <li>ถ้าปัญหากลับมา → กดเปิดเคสอีกครั้ง — ระบบจะเก็บ history ของรอบเก่าไว้</li>
                    </ol>
                  </div>

                  <div>
                    <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">🤖 Auto-flag</h3>
                    <p>
                      กดปุ่มมุมขวาบน — ระบบสแกนสินค้าใน 30 วันหา:
                    </p>
                    <ul className="ml-5 mt-1 list-disc">
                      <li>เจ้าของไม่อนุมัติคำชี้แจง ≥ 1 ครั้ง → flag <strong>priority สูง</strong></li>
                      <li>ค้างชี้แจง pending ≥ 3 ครั้ง → flag <strong>priority ปกติ</strong></li>
                    </ul>
                    <p className="mt-1 text-xs text-gray-500">เฉพาะที่ยังไม่ได้ flag เท่านั้น (ไม่ duplicate)</p>
                  </div>

                  <div>
                    <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">🎨 รหัสสีและสัญลักษณ์</h3>
                    <ul className="space-y-1 text-xs">
                      <li><span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">-2</span> = ขาด (manual &lt; POS)</li>
                      <li><span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">+1</span> = เกิน (manual &gt; POS)</li>
                      <li><span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">0</span> = ตรงเป๊ะ</li>
                      <li><span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">↗ แย่ลง</span> = ผลต่างเพิ่มเรื่อยๆ (linear regression slope &gt; 0.05)</li>
                      <li><span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">↘ ดีขึ้น</span> = ผลต่างลดลง (slope &lt; -0.05)</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">⚙️ ระบบทำงานอัตโนมัติร่วมกัน</h3>
                    <ul className="ml-5 list-disc space-y-1 text-xs">
                      <li><strong>Trigger:</strong> ทุกครั้งที่ owner reject คำชี้แจงในหน้า /stock/approval → ระบบ auto-flag สินค้านั้นทันที (priority=high)</li>
                      <li><strong>Cron daily:</strong> ทุกวัน 08:00 — ตรวจ tracked products ที่ยังเกินเกณฑ์ ส่งแจ้งเตือน owner</li>
                      <li><strong>Cron weekly:</strong> ทุกจันทร์ 09:00 — ส่งสรุปสินค้าทั้งหมดที่ติดตามเข้าแชทสาขา</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">🔐 สิทธิ์การใช้งาน</h3>
                    <ul className="ml-5 list-disc space-y-1 text-xs">
                      <li>owner / accountant / manager / hq — flag/แก้ไข/Auto-flag ได้ทั้งหมด</li>
                      <li>bar / staff — ดูได้ (read-only)</li>
                      <li>customer — ไม่เห็นเลย</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">📜 History (ประวัติ)</h3>
                    <p>กดปุ่ม "ประวัติ" ที่การ์ด → เห็น timeline ทุก action: flagged / noted / resolved / reopened / auto_flagged พร้อมเวลาและคนที่ทำ</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button size="sm" onClick={() => setShowHelp(false)}>เข้าใจแล้ว</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingItem(null)}>
          <div className="w-full max-w-lg" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Card>
            <CardHeader
              title={editingItem.existing ? 'แก้ไขการติดตาม' : 'เริ่มติดตาม'}
              description={`${editingItem.product_name} (${editingItem.product_code})`}
              action={
                <button onClick={() => setEditingItem(null)} className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-4 w-4" />
                </button>
              }
            />
            <CardContent>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editForm.is_tracking}
                    onChange={(e) => setEditForm({ ...editForm, is_tracking: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span>กำลังติดตาม (uncheck เพื่อปิดเคส)</span>
                </label>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">ระดับความสำคัญ</label>
                  <div className="grid grid-cols-4 gap-1">
                    {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, priority: p })}
                        className={cn(
                          'rounded-md py-1.5 text-xs font-medium transition-colors',
                          editForm.priority === p
                            ? `${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].text} ring-1 ring-current`
                            : 'border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
                        )}
                      >
                        {PRIORITY_CONFIG[p].label}
                      </button>
                    ))}
                  </div>
                </div>

                <Textarea
                  label="เหตุผลที่ติดตาม"
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  rows={2}
                  placeholder="เช่น สต๊อกขาดประจำ 5 ครั้งใน 2 สัปดาห์"
                />

                <Textarea
                  label="โน๊ต"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                />

                <Textarea
                  label="ติดตามเรื่องอะไร"
                  value={editForm.follow_up_action}
                  onChange={(e) => setEditForm({ ...editForm, follow_up_action: e.target.value })}
                  rows={2}
                  placeholder="เช่น เช็ค CCTV กะดึก, สอบสวนพนักงานชื่อ X"
                />

                {!editForm.is_tracking && (
                  <Textarea
                    label="บทสรุป (ปิดเคส)"
                    value={editForm.resolution_notes}
                    onChange={(e) => setEditForm({ ...editForm, resolution_notes: e.target.value })}
                    rows={2}
                    placeholder="สรุปผลการติดตาม"
                  />
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingItem(null)}>
                    ยกเลิก
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    บันทึก
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof Package }) {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20',
    red: 'text-red-600 bg-red-50 dark:bg-red-900/20',
    orange: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  };
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <div className={cn('rounded-lg p-1.5', colorMap[color])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  color = 'indigo',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: 'indigo' | 'red' | 'emerald';
}) {
  const colorMap = {
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
        active ? colorMap[color] : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
      )}
    >
      {label}
    </button>
  );
}

function Stat({ label, value, color = 'gray' }: { label: string; value: string; color?: 'gray' | 'red' | 'amber' }) {
  const colorMap = {
    gray: 'text-gray-700 dark:text-gray-200',
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={cn('text-xs font-semibold', colorMap[color])}>{value}</p>
    </div>
  );
}

interface HistoryEvent {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  created_by_name?: string | null;
}

const ACTION_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  flagged: { label: 'เริ่มติดตาม', emoji: '📌', color: 'text-indigo-600 dark:text-indigo-400' },
  noted: { label: 'อัปเดตโน๊ต', emoji: '📝', color: 'text-blue-600 dark:text-blue-400' },
  escalated: { label: 'ยกระดับความสำคัญ', emoji: '⚠️', color: 'text-orange-600 dark:text-orange-400' },
  resolved: { label: 'ปิดเคส', emoji: '✅', color: 'text-emerald-600 dark:text-emerald-400' },
  reopened: { label: 'เปิดเคสใหม่', emoji: '🔄', color: 'text-amber-600 dark:text-amber-400' },
  auto_flagged: { label: 'flag อัตโนมัติ', emoji: '🤖', color: 'text-purple-600 dark:text-purple-400' },
};

function HistoryRow({ ev }: { ev: HistoryEvent }) {
  const cfg = ACTION_CONFIG[ev.action] || { label: ev.action, emoji: '•', color: 'text-gray-600' };
  const dt = new Date(ev.created_at);
  const dateStr = `${dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })} ${dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
  const reason = (ev.payload?.reason as string) || '';
  const notes = (ev.payload?.notes as string) || '';
  const followUp = (ev.payload?.follow_up_action as string) || '';
  const resolution = (ev.payload?.resolution_notes as string) || '';

  return (
    <li className="flex gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs dark:bg-gray-800/50">
      <span>{cfg.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={cn('font-medium', cfg.color)}>{cfg.label}</span>
          {ev.created_by_name && (
            <span className="text-[10px] text-gray-500">โดย {ev.created_by_name}</span>
          )}
          <span className="ml-auto text-[10px] text-gray-400">{dateStr}</span>
        </div>
        {reason && <p className="mt-0.5 text-gray-600 dark:text-gray-300"><span className="text-[10px] text-gray-400">เหตุผล:</span> {reason}</p>}
        {notes && <p className="mt-0.5 text-gray-600 dark:text-gray-300"><span className="text-[10px] text-gray-400">โน๊ต:</span> {notes}</p>}
        {followUp && <p className="mt-0.5 text-gray-600 dark:text-gray-300"><span className="text-[10px] text-gray-400">ติดตาม:</span> {followUp}</p>}
        {resolution && <p className="mt-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"><span className="text-[10px]">บทสรุป:</span> {resolution}</p>}
      </div>
    </li>
  );
}

function TrendBadge({ type, slope }: { type: 'worsening' | 'improving' | 'stable'; slope: number }) {
  if (type === 'worsening') {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <TrendingUp className="h-3 w-3" /> แย่ลง
      </span>
    );
  }
  if (type === 'improving') {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <TrendingDown className="h-3 w-3" /> ดีขึ้น
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      <Minus className="h-3 w-3" /> คงที่
    </span>
  );
}
