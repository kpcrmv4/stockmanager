'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Warehouse,
  Clock,
  Package,
  BoxSelect,
  Store as StoreIcon,
  ChevronDown,
  ChevronUp,
  Search,
  Eye,
  Check,
  X,
  Camera,
  Loader2,
  RefreshCw,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useRealtime } from '@/hooks/use-realtime';
import { formatThaiDateTime } from '@/lib/utils/format';
import { todayBangkok, startOfTodayBangkokISO, daysAgoBangkokISO } from '@/lib/utils/date';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { toast } from '@/components/ui';
import type { Store } from '@/types/database';
import {
  notifyChatTransferReceived,
  notifyChatTransferRejected,
  notifyChatHqWithdrawal,
} from '@/lib/chat/transfer-bot-client';

// ==========================================
// Types
// ==========================================

interface TransferWithItems {
  id: string;
  transfer_code: string;
  from_store_id: string;
  from_store_name: string;
  deposit_id: string | null;
  product_name: string | null;
  customer_name: string | null;
  deposit_code: string | null;
  quantity: number | null;
  status: string;
  requested_by: string | null;
  requested_by_name: string | null;
  notes: string | null;
  photo_url: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface TransferBatchGroup {
  transfer_code: string;
  from_store_name: string;
  items: TransferWithItems[];
  created_at: string;
}

interface HqDepositItem {
  id: string;
  transfer_id: string | null;
  deposit_id: string | null;
  from_store_id: string | null;
  from_store_name: string;
  product_name: string | null;
  customer_name: string | null;
  deposit_code: string | null;
  category: string | null;
  quantity: number | null;
  status: string;
  received_by: string | null;
  received_by_name: string | null;
  received_photo_url: string | null;
  received_at: string;
  withdrawn_by: string | null;
  withdrawn_by_name: string | null;
  withdrawal_notes: string | null;
  withdrawn_at: string | null;
  notes: string | null;
  created_at: string;
}

interface BranchSummary {
  storeId: string;
  storeName: string;
  pending: number;
  received: number;
}

type TabId = 'pending' | 'received' | 'withdrawn';

// ==========================================
// Main Component
// ==========================================

export default function HqWarehousePage() {
  const { user } = useAuthStore();
  const t = useTranslations('hqWarehouse');
  const unknownBranch = t('unknownBranch');
  const [stores, setStores] = useState<Store[]>([]);
  const mountedRef = useRef(true);

  // Data State
  const [pendingTransfers, setPendingTransfers] = useState<TransferWithItems[]>([]);
  const [receivedItems, setReceivedItems] = useState<HqDepositItem[]>([]);
  const [withdrawnItems, setWithdrawnItems] = useState<HqDepositItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState<TabId>('pending');
  const [showBranchSummary, setShowBranchSummary] = useState(false);
  const [filterBranch, setFilterBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [withdrawnDateFilter, setWithdrawnDateFilter] = useState<'today' | 'week' | 'all'>('today');

  // Modal State
  const [selectedTransfer, setSelectedTransfer] = useState<TransferWithItems | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmStep, setConfirmStep] = useState(1);
  const [confirmPhotoUrl, setConfirmPhotoUrl] = useState<string | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Reject Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingTransfer, setRejectingTransfer] = useState<TransferWithItems | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Withdraw Modal State
  const [selectedHqDeposit, setSelectedHqDeposit] = useState<HqDepositItem | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  // Received tab: view mode + multi-select
  const [receivedViewMode, setReceivedViewMode] = useState<'card' | 'table'>('card');
  const [selectedReceivedIds, setSelectedReceivedIds] = useState<Set<string>>(new Set());
  const [showBulkWithdrawModal, setShowBulkWithdrawModal] = useState(false);
  const [bulkWithdrawNotes, setBulkWithdrawNotes] = useState('');
  const [bulkWithdrawSubmitting, setBulkWithdrawSubmitting] = useState(false);

  // Batch Confirm Modal State (receive all items in a batch)
  const [showBatchConfirmModal, setShowBatchConfirmModal] = useState(false);
  const [batchConfirmGroup, setBatchConfirmGroup] = useState<TransferBatchGroup | null>(null);
  const [batchConfirmStep, setBatchConfirmStep] = useState(1);
  const [batchConfirmPhotoUrl, setBatchConfirmPhotoUrl] = useState<string | null>(null);
  const [batchConfirmNotes, setBatchConfirmNotes] = useState('');
  const [batchConfirmSubmitting, setBatchConfirmSubmitting] = useState(false);

  // Photo Modal State
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // Branch group expand state
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const toggleBranch = (storeId: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  };

  // Get central store(s) for filtering
  const centralStores = useMemo(
    () => stores.filter((s) => s.is_central),
    [stores]
  );
  const centralStoreIds = useMemo(
    () => centralStores.map((s) => s.id),
    [centralStores]
  );

  // Non-central stores for branch summary
  const branchStores = useMemo(
    () => stores.filter((s) => !s.is_central && s.active),
    [stores]
  );

  // ==========================================
  // Fetch Stores
  // ==========================================

  const fetchStores = useCallback(async () => {
    const supabase = createClient();
    // owner/hq/accountant see all stores
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('active', true)
      .order('store_name');
    if (data && mountedRef.current) setStores(data);
  }, []);

  // ==========================================
  // Data Loading
  // ==========================================

  const loadPendingTransfers = useCallback(async () => {
    if (centralStoreIds.length === 0) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('transfers')
      .select(`
        id, transfer_code, rejection_reason, from_store_id, deposit_id, product_name, quantity,
        status, requested_by, notes, photo_url, created_at
      `)
      .in('to_store_id', centralStoreIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!data || !mountedRef.current) return;

    // Resolve store names and requester names
    const storeMap = new Map(stores.map((s) => [s.id, s.store_name]));
    const userIds = [...new Set(data.map((t) => t.requested_by).filter(Boolean))] as string[];
    let userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', userIds);
      if (profiles) {
        userMap = new Map(profiles.map((p) => [p.id, p.display_name || p.username]));
      }
    }

    // Resolve deposit info
    const depositIds = data.map((t) => t.deposit_id).filter(Boolean) as string[];
    let depositMap = new Map<string, { customer_name: string; deposit_code: string }>();
    if (depositIds.length > 0) {
      const { data: deposits } = await supabase
        .from('deposits')
        .select('id, customer_name, deposit_code')
        .in('id', depositIds);
      if (deposits) {
        depositMap = new Map(deposits.map((d) => [d.id, { customer_name: d.customer_name, deposit_code: d.deposit_code }]));
      }
    }

    const items: TransferWithItems[] = data.map((t) => {
      const depositInfo = t.deposit_id ? depositMap.get(t.deposit_id) : null;
      return {
        id: t.id,
        transfer_code: t.transfer_code || t.id.slice(0, 8).toUpperCase(),
        from_store_id: t.from_store_id,
        from_store_name: storeMap.get(t.from_store_id) || unknownBranch,
        deposit_id: t.deposit_id,
        product_name: t.product_name,
        customer_name: depositInfo?.customer_name || null,
        deposit_code: depositInfo?.deposit_code || null,
        quantity: t.quantity,
        status: t.status,
        requested_by: t.requested_by,
        requested_by_name: t.requested_by ? (userMap.get(t.requested_by) || null) : null,
        notes: t.notes,
        photo_url: t.photo_url,
        rejection_reason: t.rejection_reason || null,
        created_at: t.created_at,
      };
    });

    if (mountedRef.current) setPendingTransfers(items);
  }, [centralStoreIds, stores]);

  const loadReceivedItems = useCallback(async () => {
    if (centralStoreIds.length === 0) return;
    const supabase = createClient();

    // --- Auto-repair: find confirmed transfers without matching hq_deposits ---
    const { data: confirmedTransfers } = await supabase
      .from('transfers')
      .select('id, from_store_id, deposit_id, product_name, quantity, requested_by, confirmed_by, confirm_photo_url, notes, created_at')
      .in('to_store_id', centralStoreIds)
      .eq('status', 'confirmed');

    if (confirmedTransfers && confirmedTransfers.length > 0) {
      const tIds = confirmedTransfers.map((t) => t.id);
      const { data: existingHq } = await supabase
        .from('hq_deposits')
        .select('transfer_id')
        .in('transfer_id', tIds);

      const existingSet = new Set((existingHq || []).map((d) => d.transfer_id));
      const orphaned = confirmedTransfers.filter((t) => !existingSet.has(t.id));

      if (orphaned.length > 0) {
        // Resolve deposit info (customer_name, deposit_code)
        const depIds = orphaned.map((t) => t.deposit_id).filter(Boolean) as string[];
        let depMap = new Map<string, { customer_name: string; deposit_code: string }>();
        if (depIds.length > 0) {
          const { data: deps } = await supabase
            .from('deposits')
            .select('id, customer_name, deposit_code')
            .in('id', depIds);
          if (deps) {
            depMap = new Map(deps.map((d) => [d.id, { customer_name: d.customer_name, deposit_code: d.deposit_code }]));
          }
        }

        const newRecords = orphaned.map((t) => {
          const dep = t.deposit_id ? depMap.get(t.deposit_id) : null;
          return {
            transfer_id: t.id,
            deposit_id: t.deposit_id,
            from_store_id: t.from_store_id,
            product_name: t.product_name,
            customer_name: dep?.customer_name || null,
            deposit_code: dep?.deposit_code || null,
            quantity: t.quantity,
            status: 'awaiting_withdrawal' as const,
            received_by: t.confirmed_by || t.requested_by,
            received_photo_url: t.confirm_photo_url || null,
            notes: t.notes,
          };
        });

        await supabase.from('hq_deposits').insert(newRecords);
      }
    }

    // --- Now load hq_deposits normally ---
    const { data, error } = await supabase
      .from('hq_deposits')
      .select('*')
      .eq('status', 'awaiting_withdrawal')
      .order('received_at', { ascending: false });

    if (error) {
      console.error('[HQ] loadReceivedItems error:', error);
      return;
    }
    if (!data || !mountedRef.current) return;

    const storeMap = new Map(stores.map((s) => [s.id, s.store_name]));
    const userIds = [...new Set([
      ...data.map((d) => d.received_by),
    ].filter(Boolean))] as string[];
    let userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', userIds);
      if (profiles) {
        userMap = new Map(profiles.map((p) => [p.id, p.display_name || p.username]));
      }
    }

    const items: HqDepositItem[] = data.map((d) => ({
      ...d,
      from_store_name: storeMap.get(d.from_store_id || '') || unknownBranch,
      received_by_name: d.received_by ? (userMap.get(d.received_by) || null) : null,
      withdrawn_by_name: null,
    }));

    if (mountedRef.current) setReceivedItems(items);
  }, [centralStoreIds, stores]);

  const loadWithdrawnItems = useCallback(async () => {
    const supabase = createClient();

    const { data } = await supabase
      .from('hq_deposits')
      .select('*')
      .eq('status', 'withdrawn')
      .order('withdrawn_at', { ascending: false });

    if (!data || !mountedRef.current) return;

    const storeMap = new Map(stores.map((s) => [s.id, s.store_name]));
    const userIds = [...new Set([
      ...data.map((d) => d.received_by),
      ...data.map((d) => d.withdrawn_by),
    ].filter(Boolean))] as string[];
    let userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', userIds);
      if (profiles) {
        userMap = new Map(profiles.map((p) => [p.id, p.display_name || p.username]));
      }
    }

    const items: HqDepositItem[] = data.map((d) => ({
      ...d,
      from_store_name: storeMap.get(d.from_store_id || '') || unknownBranch,
      received_by_name: d.received_by ? (userMap.get(d.received_by) || null) : null,
      withdrawn_by_name: d.withdrawn_by ? (userMap.get(d.withdrawn_by) || null) : null,
    }));

    if (mountedRef.current) setWithdrawnItems(items);
  }, [stores]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPendingTransfers(),
        loadReceivedItems(),
        loadWithdrawnItems(),
      ]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loadPendingTransfers, loadReceivedItems, loadWithdrawnItems]);

  useEffect(() => {
    mountedRef.current = true;
    fetchStores();
    return () => { mountedRef.current = false; };
  }, [fetchStores]);

  useEffect(() => {
    if (stores.length > 0) {
      loadAllData();
    }
  }, [stores.length, loadAllData]);

  // Realtime subscriptions
  const realtimeCallback = useCallback(() => {
    loadAllData();
  }, [loadAllData]);

  useRealtime({
    table: 'transfers',
    onInsert: realtimeCallback,
    onUpdate: realtimeCallback,
  });

  useRealtime({
    table: 'hq_deposits',
    onInsert: realtimeCallback,
    onUpdate: realtimeCallback,
  });

  // ==========================================
  // Branch Summary
  // ==========================================

  const branchSummaryData = useMemo<BranchSummary[]>(() => {
    return branchStores.map((store) => ({
      storeId: store.id,
      storeName: store.store_name,
      pending: pendingTransfers.filter((t) => t.from_store_id === store.id).length,
      received: receivedItems.filter((r) => r.from_store_id === store.id).length,
    })).filter((b) => b.pending > 0 || b.received > 0);
  }, [branchStores, pendingTransfers, receivedItems]);

  // ==========================================
  // Summary Counts
  // ==========================================

  const summary = useMemo(() => ({
    pending: pendingTransfers.length,
    received: receivedItems.length,
    withdrawn: withdrawnItems.length,
  }), [pendingTransfers, receivedItems, withdrawnItems]);

  // ==========================================
  // Filtered Lists
  // ==========================================

  const filteredPending = useMemo(() => {
    let result = pendingTransfers;
    if (filterBranch) result = result.filter((t) => t.from_store_id === filterBranch);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.transfer_code.toLowerCase().includes(q) ||
        t.from_store_name.toLowerCase().includes(q) ||
        t.product_name?.toLowerCase().includes(q) ||
        t.customer_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [pendingTransfers, filterBranch, searchQuery]);

  // Group pending transfers by transfer_code (batch)
  const pendingByBatch = useMemo(() => {
    const grouped = new Map<string, TransferBatchGroup>();
    for (const t of filteredPending) {
      const code = t.transfer_code;
      const existing = grouped.get(code);
      if (existing) {
        existing.items.push(t);
      } else {
        grouped.set(code, {
          transfer_code: code,
          from_store_name: t.from_store_name,
          items: [t],
          created_at: t.created_at,
        });
      }
    }
    const batches = Array.from(grouped.values());
    batches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return batches;
  }, [filteredPending]);

  const filteredReceived = useMemo(() => {
    let result = receivedItems;
    if (filterBranch) result = result.filter((i) => i.from_store_id === filterBranch);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        i.product_name?.toLowerCase().includes(q) ||
        i.customer_name?.toLowerCase().includes(q) ||
        i.deposit_code?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [receivedItems, filterBranch, searchQuery]);

  const filteredWithdrawn = useMemo(() => {
    let result = withdrawnItems;
    if (filterBranch) result = result.filter((i) => i.from_store_id === filterBranch);

    if (withdrawnDateFilter === 'today') {
      const todayStr = todayBangkok(); // "YYYY-MM-DD"
      result = result.filter((i) => {
        if (!i.withdrawn_at) return false;
        // Format withdrawn_at in Bangkok timezone to compare date strings
        const dStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(i.withdrawn_at));
        return dStr === todayStr;
      });
    } else if (withdrawnDateFilter === 'week') {
      const weekAgoISO = daysAgoBangkokISO(7);
      result = result.filter((i) => i.withdrawn_at && new Date(i.withdrawn_at) >= new Date(weekAgoISO));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) =>
        i.product_name?.toLowerCase().includes(q) ||
        i.customer_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [withdrawnItems, filterBranch, withdrawnDateFilter, searchQuery]);

  // ==========================================
  // Actions
  // ==========================================

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadAllData();
      toast({ type: 'success', title: t('refreshSuccess') });
    } finally {
      setIsRefreshing(false);
    }
  };

  const openConfirmModal = (transfer: TransferWithItems) => {
    setSelectedTransfer(transfer);
    setConfirmStep(1);
    setConfirmPhotoUrl(null);
    setConfirmNotes('');
    setShowConfirmModal(true);
  };

  const submitConfirmTransfer = async () => {
    if (!selectedTransfer || !confirmPhotoUrl || !user) return;
    setConfirmSubmitting(true);

    try {
      const supabase = createClient();

      // 1. Update transfer status to confirmed
      const { error: transferError } = await supabase
        .from('transfers')
        .update({
          status: 'confirmed',
          confirmed_by: user.id,
          confirm_photo_url: confirmPhotoUrl,
        })
        .eq('id', selectedTransfer.id);

      if (transferError) throw transferError;

      // 2. Create hq_deposit record
      const { error: hqError } = await supabase
        .from('hq_deposits')
        .insert({
          transfer_id: selectedTransfer.id,
          deposit_id: selectedTransfer.deposit_id,
          from_store_id: selectedTransfer.from_store_id,
          product_name: selectedTransfer.product_name,
          customer_name: selectedTransfer.customer_name,
          deposit_code: selectedTransfer.deposit_code,
          quantity: selectedTransfer.quantity,
          status: 'awaiting_withdrawal',
          received_by: user.id,
          received_photo_url: confirmPhotoUrl,
          notes: confirmNotes || null,
        });

      if (hqError) throw hqError;

      // 3. Update original deposit status to transferred_out
      if (selectedTransfer.deposit_id) {
        await supabase
          .from('deposits')
          .update({ status: 'transferred_out' })
          .eq('id', selectedTransfer.deposit_id);
      }

      toast({ type: 'success', title: t('receiveSuccess') });

      // ส่ง system message กลับไปห้องสาขาต้นทาง
      notifyChatTransferReceived(selectedTransfer.from_store_id, {
        transfer_code: selectedTransfer.transfer_code,
        item_count: 1,
        received_by_name: user.displayName || user.username || 'HQ Staff',
      });

      setShowConfirmModal(false);
      setSelectedTransfer(null);
      await loadAllData();
    } catch (err) {
      console.error('Confirm error:', err);
      toast({ type: 'error', title: t('receiveError') });
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const openRejectModal = (transfer: TransferWithItems) => {
    setRejectingTransfer(transfer);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const submitRejectTransfer = async () => {
    if (!rejectingTransfer || !rejectReason.trim()) return;

    setRejectSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('transfers')
        .update({ status: 'rejected', rejection_reason: rejectReason.trim() })
        .eq('id', rejectingTransfer.id);

      if (error) throw error;

      // Revert deposit status back to expired
      if (rejectingTransfer.deposit_id) {
        await supabase
          .from('deposits')
          .update({ status: 'expired' })
          .eq('id', rejectingTransfer.deposit_id)
          .eq('status', 'transfer_pending');
      }

      toast({ type: 'success', title: t('rejectSuccess') });

      // ส่ง system message กลับไปห้องสาขาต้นทาง
      notifyChatTransferRejected(rejectingTransfer.from_store_id, {
        transfer_code: rejectingTransfer.transfer_code,
        product_name: rejectingTransfer.product_name || 'Product',
        rejected_by_name: user?.displayName || user?.username || 'HQ Staff',
        reason: rejectReason.trim(),
      });

      setShowRejectModal(false);
      setRejectingTransfer(null);
      await loadAllData();
    } catch {
      toast({ type: 'error', title: t('rejectError') });
    } finally {
      setRejectSubmitting(false);
    }
  };

  const openBatchConfirmModal = (batch: TransferBatchGroup) => {
    setBatchConfirmGroup(batch);
    setBatchConfirmStep(1);
    setBatchConfirmPhotoUrl(null);
    setBatchConfirmNotes('');
    setShowBatchConfirmModal(true);
  };

  const submitBatchConfirmTransfer = async () => {
    if (!batchConfirmGroup || !batchConfirmPhotoUrl || !user) return;
    setBatchConfirmSubmitting(true);

    try {
      const supabase = createClient();

      for (const transfer of batchConfirmGroup.items) {
        // 1. Update transfer status to confirmed
        const { error: transferError } = await supabase
          .from('transfers')
          .update({
            status: 'confirmed',
            confirmed_by: user.id,
            confirm_photo_url: batchConfirmPhotoUrl,
          })
          .eq('id', transfer.id);

        if (transferError) throw transferError;

        // 2. Create hq_deposit record
        const { error: hqError } = await supabase
          .from('hq_deposits')
          .insert({
            transfer_id: transfer.id,
            deposit_id: transfer.deposit_id,
            from_store_id: transfer.from_store_id,
            product_name: transfer.product_name,
            customer_name: transfer.customer_name,
            deposit_code: transfer.deposit_code,
            quantity: transfer.quantity,
            status: 'awaiting_withdrawal',
            received_by: user.id,
            received_photo_url: batchConfirmPhotoUrl,
            notes: batchConfirmNotes || null,
          });

        if (hqError) throw hqError;

        // 3. Update original deposit status
        if (transfer.deposit_id) {
          await supabase
            .from('deposits')
            .update({ status: 'transferred_out' })
            .eq('id', transfer.deposit_id);
        }
      }

      toast({ type: 'success', title: t('receiveAllSuccess'), message: t('receiveAllSuccessMsg', { count: batchConfirmGroup.items.length, code: batchConfirmGroup.transfer_code }) });

      // ส่ง system message กลับไปห้องสาขาต้นทาง
      notifyChatTransferReceived(batchConfirmGroup.items[0].from_store_id, {
        transfer_code: batchConfirmGroup.transfer_code,
        item_count: batchConfirmGroup.items.length,
        received_by_name: user?.displayName || user?.username || 'HQ Staff',
      });

      setShowBatchConfirmModal(false);
      setBatchConfirmGroup(null);
      await loadAllData();
    } catch (err) {
      console.error('Batch confirm error:', err);
      toast({ type: 'error', title: t('receiveError') });
    } finally {
      setBatchConfirmSubmitting(false);
    }
  };

  const openWithdrawModal = (item: HqDepositItem) => {
    setSelectedHqDeposit(item);
    setWithdrawNotes('');
    setShowWithdrawModal(true);
  };

  // ----- Multi-select helpers for received tab -----
  const canWithdraw = user?.role === 'owner' || user?.role === 'hq';

  const toggleReceivedSelection = (id: string) => {
    setSelectedReceivedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearReceivedSelection = () => setSelectedReceivedIds(new Set());

  // Selected items (derived from current filtered list to avoid stale refs)
  const selectedReceivedItems = useMemo(
    () => filteredReceived.filter((i) => selectedReceivedIds.has(i.id)),
    [filteredReceived, selectedReceivedIds],
  );

  const allFilteredReceivedSelected =
    filteredReceived.length > 0 &&
    filteredReceived.every((i) => selectedReceivedIds.has(i.id));

  const toggleSelectAllReceived = () => {
    if (allFilteredReceivedSelected) {
      clearReceivedSelection();
    } else {
      setSelectedReceivedIds(new Set(filteredReceived.map((i) => i.id)));
    }
  };

  // Clear selection when leaving the received tab or when the filtered set changes
  useEffect(() => {
    if (activeTab !== 'received') clearReceivedSelection();
  }, [activeTab]);

  useEffect(() => {
    // Drop any selected ids that no longer exist in the filtered view
    setSelectedReceivedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(filteredReceived.map((i) => i.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [filteredReceived]);

  const openBulkWithdrawModal = () => {
    if (selectedReceivedItems.length === 0) return;
    setBulkWithdrawNotes('');
    setShowBulkWithdrawModal(true);
  };

  const submitBulkWithdraw = async () => {
    if (selectedReceivedItems.length === 0 || !user) return;
    setBulkWithdrawSubmitting(true);

    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();
      const ids = selectedReceivedItems.map((i) => i.id);

      const { error } = await supabase
        .from('hq_deposits')
        .update({
          status: 'withdrawn',
          withdrawn_by: user.id,
          withdrawal_notes: bulkWithdrawNotes || null,
          withdrawn_at: nowIso,
        })
        .in('id', ids);

      if (error) throw error;

      toast({
        type: 'success',
        title: t('bulkWithdrawSuccess'),
        message: t('bulkWithdrawSuccessMsg', { count: selectedReceivedItems.length }),
      });

      // ส่ง system message ให้ทุกสาขาต้นทางที่เกี่ยวข้อง (deduped)
      const centralId = centralStoreIds[0];
      if (centralId) {
        const announced = new Set<string>();
        for (const item of selectedReceivedItems) {
          const key = `${item.from_store_id || ''}:${item.product_name || ''}`;
          if (announced.has(key)) continue;
          announced.add(key);
          notifyChatHqWithdrawal(centralId, {
            product_name: item.product_name || 'Product',
            customer_name: item.customer_name,
            from_store_name: item.from_store_name,
            withdrawn_by_name: user?.displayName || user?.username || 'HQ Staff',
            notes: bulkWithdrawNotes || null,
          });
        }
      }

      setShowBulkWithdrawModal(false);
      clearReceivedSelection();
      await loadAllData();
    } catch (err) {
      console.error('Bulk withdraw error:', err);
      toast({ type: 'error', title: t('withdrawError') });
    } finally {
      setBulkWithdrawSubmitting(false);
    }
  };

  const submitWithdraw = async () => {
    if (!selectedHqDeposit || !user) return;
    setWithdrawSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('hq_deposits')
        .update({
          status: 'withdrawn',
          withdrawn_by: user.id,
          withdrawal_notes: withdrawNotes || null,
          withdrawn_at: new Date().toISOString(),
        })
        .eq('id', selectedHqDeposit.id);

      if (error) throw error;

      toast({ type: 'success', title: t('withdrawSuccess') });

      // ส่ง system message ไปห้อง HQ + ห้องสาขาต้นทาง
      const centralId = centralStoreIds[0];
      if (centralId) {
        notifyChatHqWithdrawal(centralId, {
          product_name: selectedHqDeposit.product_name || 'Product',
          customer_name: selectedHqDeposit.customer_name,
          from_store_name: selectedHqDeposit.from_store_name,
          withdrawn_by_name: user?.displayName || user?.username || 'HQ Staff',
          notes: withdrawNotes || null,
        });
      }

      setShowWithdrawModal(false);
      setSelectedHqDeposit(null);
      await loadAllData();
    } catch {
      toast({ type: 'error', title: t('withdrawError') });
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  // ==========================================
  // Tabs Config
  // ==========================================

  const tabs: { id: TabId; label: string; icon: typeof Clock; count: number; color: string }[] = [
    { id: 'pending', label: t('tabPending'), icon: Clock, count: summary.pending, color: 'yellow' },
    { id: 'received', label: t('tabReceived'), icon: Package, count: summary.received, color: 'green' },
    { id: 'withdrawn', label: t('tabWithdrawn'), icon: BoxSelect, count: summary.withdrawn, color: 'gray' },
  ];

  // ==========================================
  // No central store check
  // ==========================================

  if (stores.length > 0 && centralStores.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg dark:bg-gray-900">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Warehouse className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('noCentralStore')}</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('noCentralStoreDesc')}
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // Render
  // ==========================================

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 px-4 py-5 text-white shadow-xl">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur-sm">
                <Warehouse className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">{t('title')}</h1>
                <p className="text-sm text-orange-100">
                  {t('subtitle', { stores: centralStores.map((s) => s.store_name).join(', ') })}
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium backdrop-blur-sm transition hover:bg-white/30"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </button>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="border-b bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-900">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tabs.map((tab) => {
              const colorMap: Record<string, string> = {
                yellow: 'border-yellow-200 dark:border-yellow-800',
                green: 'border-green-200 dark:border-green-800',
                gray: 'border-gray-200 dark:border-gray-700',
              };
              const iconBgMap: Record<string, string> = {
                yellow: 'bg-yellow-100 dark:bg-yellow-900/30',
                green: 'bg-green-100 dark:bg-green-900/30',
                gray: 'bg-gray-100 dark:bg-gray-800',
              };
              const textColorMap: Record<string, string> = {
                yellow: 'text-yellow-600 dark:text-yellow-400',
                green: 'text-green-600 dark:text-green-400',
                gray: 'text-gray-600 dark:text-gray-400',
              };
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900',
                    colorMap[tab.color],
                    activeTab === tab.id && 'ring-2 ring-orange-400'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('rounded-lg p-2.5', iconBgMap[tab.color])}>
                      <TabIcon className={cn('h-5 w-5', textColorMap[tab.color])} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{tab.label}</p>
                      <p className={cn('text-2xl font-bold', textColorMap[tab.color])}>{tab.count}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Branch Summary */}
          <div className="mt-3">
            <button
              onClick={() => setShowBranchSummary(!showBranchSummary)}
              className="flex w-full items-center justify-between rounded-lg bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <span className="flex items-center gap-2">
                <StoreIcon className="h-4 w-4" />
                {t('branchSummary')}
              </span>
              {showBranchSummary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showBranchSummary && (
              <div className="mt-2 rounded-lg bg-white p-3 shadow-sm dark:bg-gray-900">
                {branchSummaryData.length === 0 ? (
                  <p className="py-2 text-center text-sm text-gray-400">{t('noBranchData')}</p>
                ) : (
                  <div className="space-y-2">
                    {branchSummaryData.map((branch) => (
                      <div key={branch.storeId} className="flex items-center justify-between border-b py-2 last:border-0 dark:border-gray-800">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{branch.storeName}</span>
                        <div className="flex gap-2 text-xs">
                          {branch.pending > 0 && (
                            <span className="rounded-full bg-yellow-100 px-2 py-1 font-bold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                              {t('pendingLabel', { count: branch.pending })}
                            </span>
                          )}
                          {branch.received > 0 && (
                            <span className="rounded-full bg-green-100 px-2 py-1 font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              {t('receivedLabel', { count: branch.received })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="sticky top-0 z-40 bg-white shadow-sm dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-2">
          <nav className="flex gap-2 overflow-x-auto py-3">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition',
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  )}
                >
                  <TabIcon className="h-4 w-4" />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={cn(
                      'ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold',
                      activeTab === tab.id
                        ? 'bg-white/20 text-white'
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Filters */}
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <div className="flex flex-col gap-2 rounded-lg bg-white p-3 shadow-sm sm:flex-row dark:bg-gray-900">
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className="flex-1 rounded-lg border px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">{t('allBranches')}</option>
            {branchStores.map((store) => (
              <option key={store.id} value={store.id}>{store.store_name}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-lg border py-2 pl-9 pr-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl p-4 pb-24">
        {loading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow dark:bg-gray-900">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-orange-500" />
            <p className="mt-4 text-gray-500 dark:text-gray-400">{t('loadingData')}</p>
          </div>
        ) : (
          <>
            {/* Tab: Pending */}
            {activeTab === 'pending' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 p-4 text-white">
                  <div className="rounded-xl bg-white/20 p-3">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{t('pendingHeader')}</h3>
                    <p className="text-sm text-yellow-100">{t('pendingHeaderDesc')}</p>
                  </div>
                </div>

                {filteredPending.length === 0 ? (
                  <EmptyState message={t('noPendingItems')} />
                ) : (
                  pendingByBatch.map((batch) => {
                    const isExpanded = expandedBranches.has(batch.transfer_code);
                    return (
                      <div key={batch.transfer_code} className="overflow-hidden rounded-xl bg-white shadow-md dark:bg-gray-900">
                        {/* Batch Header */}
                        <button
                          onClick={() => toggleBranch(batch.transfer_code)}
                          className="flex w-full items-center justify-between bg-gradient-to-r from-yellow-50 to-amber-50 px-4 py-3 transition hover:from-yellow-100 hover:to-amber-100 dark:from-yellow-900/20 dark:to-amber-900/20 dark:hover:from-yellow-900/30 dark:hover:to-amber-900/30"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-orange-600 dark:text-orange-400">{batch.transfer_code}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">({batch.from_store_name})</span>
                            <span className="rounded-full bg-yellow-500 px-2 py-0.5 text-xs font-bold text-white">
                              {t('itemCount', { count: batch.items.length })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{formatThaiDateTime(batch.created_at)}</span>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                          </div>
                        </button>

                        {/* Batch-level receive all button */}
                        <div className="border-t border-yellow-100 bg-yellow-50/50 px-4 py-2 dark:border-yellow-900/30 dark:bg-yellow-900/10">
                          <button
                            onClick={() => openBatchConfirmModal(batch)}
                            className="w-full rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 py-2.5 text-sm font-bold text-white shadow-md transition hover:from-green-600 hover:to-emerald-700"
                          >
                            <Check className="mr-1 inline h-4 w-4" /> {t('receiveAll', { count: batch.items.length })}
                          </button>
                        </div>

                        {/* Batch Transfer Cards */}
                        {isExpanded && (
                          <div className="space-y-3 p-3">
                            {batch.items.map((transfer) => (
                              <div key={transfer.id} className="rounded-xl border-l-4 border-yellow-500 bg-gray-50 dark:bg-gray-800">
                                <div className="p-4">
                                  <div className="mb-3 flex items-start justify-between">
                                    <div>
                                      <p className="font-medium text-gray-900 dark:text-white">{transfer.product_name || t('unspecified')}</p>
                                      {transfer.customer_name && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{transfer.customer_name}</p>
                                      )}
                                      {transfer.deposit_code && (
                                        <p className="text-xs font-mono text-gray-400">{transfer.deposit_code}</p>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-gray-700 dark:text-gray-200">
                                        {transfer.quantity || 1} <span className="text-sm font-normal text-gray-500">{t('bottles')}</span>
                                      </p>
                                      {transfer.requested_by_name && (
                                        <p className="text-xs text-gray-400">{t('requestedBy', { name: transfer.requested_by_name })}</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Photo indicator */}
                                  {transfer.photo_url && (
                                    <div className="mb-3">
                                      <button
                                        onClick={() => setViewingPhoto(transfer.photo_url)}
                                        className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400"
                                      >
                                        <ImageIcon className="h-3.5 w-3.5" /> {t('transferPhotoFromBranch')}
                                      </button>
                                    </div>
                                  )}

                                  {/* Actions */}
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => { setSelectedTransfer(transfer); setShowDetailModal(true); }}
                                      className="flex-1 rounded-lg bg-blue-100 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                                    >
                                      <Eye className="mr-1 inline h-4 w-4" /> {t('viewDetail')}
                                    </button>
                                    <button
                                      onClick={() => openConfirmModal(transfer)}
                                      className="flex-1 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 py-2.5 text-sm font-bold text-white shadow-md transition hover:from-green-600 hover:to-emerald-700"
                                    >
                                      <Check className="mr-1 inline h-4 w-4" /> {t('receiveItem')}
                                    </button>
                                    <button
                                      onClick={() => openRejectModal(transfer)}
                                      className="rounded-lg bg-red-100 px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab: Received */}
            {activeTab === 'received' && (
              <div className="space-y-4 pb-20">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 p-4 text-white">
                  <div className="rounded-xl bg-white/20 p-3">
                    <Package className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold">{t('receivedHeader')}</h3>
                    <p className="text-sm text-green-100">{t('receivedHeaderDesc')}</p>
                  </div>
                </div>

                {/* Toolbar: select-all + view mode toggle */}
                {filteredReceived.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-gray-900">
                    {canWithdraw ? (
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={allFilteredReceivedSelected}
                          onChange={toggleSelectAllReceived}
                          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-gray-600"
                        />
                        <span>
                          {selectedReceivedIds.size > 0
                            ? t('selectedCount', { count: selectedReceivedIds.size })
                            : t('selectAll')}
                        </span>
                      </label>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {t('itemCount', { count: filteredReceived.length })}
                      </span>
                    )}

                    <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
                      <button
                        onClick={() => setReceivedViewMode('card')}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition',
                          receivedViewMode === 'card'
                            ? 'bg-white text-orange-600 shadow-sm dark:bg-gray-700 dark:text-orange-400'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400',
                        )}
                        title={t('viewModeCard')}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t('viewModeCard')}</span>
                      </button>
                      <button
                        onClick={() => setReceivedViewMode('table')}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition',
                          receivedViewMode === 'table'
                            ? 'bg-white text-orange-600 shadow-sm dark:bg-gray-700 dark:text-orange-400'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400',
                        )}
                        title={t('viewModeTable')}
                      >
                        <List className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t('viewModeTable')}</span>
                      </button>
                    </div>
                  </div>
                )}

                {filteredReceived.length === 0 ? (
                  <EmptyState message={t('noReceivedItems')} />
                ) : receivedViewMode === 'card' ? (
                  filteredReceived.map((item) => {
                    const isSelected = selectedReceivedIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'rounded-xl border-l-4 bg-white p-4 shadow-md transition dark:bg-gray-900',
                          isSelected
                            ? 'border-orange-500 ring-2 ring-orange-300 dark:ring-orange-700'
                            : 'border-green-500',
                        )}
                      >
                        <div className="mb-2 flex items-start gap-3">
                          {canWithdraw && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleReceivedSelection(item.id)}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-gray-600"
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-bold text-gray-800 dark:text-gray-100">{item.product_name || t('unspecified')}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">{item.customer_name || '-'}</p>
                                <p className="mt-1 text-xs text-gray-400">
                                  {t('fromBranch', { name: item.from_store_name })}
                                  {item.deposit_code && <> &bull; {t('code', { code: item.deposit_code })}</>}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-bold text-green-600">{item.quantity || 1}</span>
                                <span className="ml-1 text-sm text-gray-500">{t('bottles')}</span>
                                <p className="mt-1 text-xs text-gray-400">
                                  {t('receivedAt', { date: formatThaiDateTime(item.received_at) })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          {canWithdraw && (
                            <button
                              onClick={() => openWithdrawModal(item)}
                              className="flex-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 py-2 text-sm font-medium text-white shadow transition hover:from-orange-600 hover:to-amber-700"
                            >
                              <BoxSelect className="mr-1 inline h-4 w-4" /> {t('withdrawItem')}
                            </button>
                          )}
                          {item.received_photo_url && (
                            <button
                              onClick={() => setViewingPhoto(item.received_photo_url)}
                              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                            >
                              <ImageIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
                            {canWithdraw && (
                              <th className="px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={allFilteredReceivedSelected}
                                  onChange={toggleSelectAllReceived}
                                  className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-gray-600"
                                />
                              </th>
                            )}
                            <th className="px-3 py-2.5">{t('colProduct')}</th>
                            <th className="px-3 py-2.5">{t('colCustomer')}</th>
                            <th className="hidden px-3 py-2.5 md:table-cell">{t('colBranch')}</th>
                            <th className="px-3 py-2.5 text-right">{t('colQty')}</th>
                            <th className="hidden px-3 py-2.5 md:table-cell">{t('colReceivedAt')}</th>
                            <th className="px-3 py-2.5 text-right">{t('colActions')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {filteredReceived.map((item) => {
                            const isSelected = selectedReceivedIds.has(item.id);
                            return (
                              <tr
                                key={item.id}
                                className={cn(
                                  'transition-colors',
                                  isSelected
                                    ? 'bg-orange-50 dark:bg-orange-900/20'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                )}
                              >
                                {canWithdraw && (
                                  <td className="px-3 py-2.5">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleReceivedSelection(item.id)}
                                      className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-gray-600"
                                    />
                                  </td>
                                )}
                                <td className="px-3 py-2.5">
                                  <p className="font-medium text-gray-900 dark:text-white">{item.product_name || t('unspecified')}</p>
                                  {item.deposit_code && (
                                    <p className="font-mono text-[10px] text-gray-400">{item.deposit_code}</p>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                                  {item.customer_name || '-'}
                                </td>
                                <td className="hidden px-3 py-2.5 text-gray-600 dark:text-gray-400 md:table-cell">
                                  {item.from_store_name}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-green-600">
                                  {item.quantity || 1} <span className="text-xs font-normal text-gray-400">{t('bottles')}</span>
                                </td>
                                <td className="hidden px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 md:table-cell">
                                  {formatThaiDateTime(item.received_at)}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <div className="inline-flex items-center gap-1">
                                    {item.received_photo_url && (
                                      <button
                                        onClick={() => setViewingPhoto(item.received_photo_url)}
                                        className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                                        title={t('viewAttachedPhoto')}
                                      >
                                        <ImageIcon className="h-4 w-4" />
                                      </button>
                                    )}
                                    {canWithdraw && (
                                      <button
                                        onClick={() => openWithdrawModal(item)}
                                        className="rounded-md bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400"
                                      >
                                        <BoxSelect className="mr-0.5 inline h-3.5 w-3.5" />
                                        {t('withdrawItem')}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sticky bulk action bar when items are selected */}
                {canWithdraw && selectedReceivedIds.size > 0 && (
                  <div className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-orange-900/50 dark:bg-gray-900/95">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-bold text-orange-600 dark:text-orange-400">
                          {selectedReceivedIds.size}
                        </span>{' '}
                        {t('itemsSelected')}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={clearReceivedSelection}
                          className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                        >
                          {t('clearSelection')}
                        </button>
                        <button
                          onClick={openBulkWithdrawModal}
                          className="rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-2 text-sm font-bold text-white shadow transition hover:from-orange-600 hover:to-amber-700"
                        >
                          <BoxSelect className="mr-1 inline h-4 w-4" />
                          {t('withdrawSelected', { count: selectedReceivedIds.size })}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Withdrawn */}
            {activeTab === 'withdrawn' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-gray-500 to-gray-600 p-4 text-white">
                  <div className="rounded-xl bg-white/20 p-3">
                    <BoxSelect className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{t('withdrawnHeader')}</h3>
                    <p className="text-sm text-gray-200">{t('withdrawnHeaderDesc')}</p>
                  </div>
                </div>

                {/* Date filter */}
                <div className="flex gap-2 rounded-lg bg-white p-3 shadow-sm dark:bg-gray-900">
                  {(['today', 'week', 'all'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setWithdrawnDateFilter(filter)}
                      className={cn(
                        'flex-1 rounded-lg py-2 text-sm font-medium transition',
                        withdrawnDateFilter === filter
                          ? 'bg-gray-700 text-white dark:bg-gray-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                      )}
                    >
                      {filter === 'today' ? t('filterToday') : filter === 'week' ? t('filter7Days') : t('filterAllTime')}
                    </button>
                  ))}
                </div>

                {filteredWithdrawn.length === 0 ? (
                  <EmptyState message={t('noWithdrawnItems')} />
                ) : (
                  filteredWithdrawn.map((item) => (
                    <div key={item.id} className="rounded-xl border-l-4 border-gray-400 bg-white p-4 shadow-sm dark:bg-gray-900">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">{item.product_name || t('unspecified')}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{item.customer_name || '-'}</p>
                          <p className="mt-1 text-xs text-gray-400">{t('fromBranch', { name: item.from_store_name })}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-gray-600">{item.quantity || 1}</span>
                          <span className="ml-1 text-sm text-gray-400">{t('bottles')}</span>
                          {item.withdrawn_at && (
                            <p className="mt-1 text-xs text-gray-400">
                              {t('withdrawnAt', { date: formatThaiDateTime(item.withdrawn_at) })}
                            </p>
                          )}
                          {item.withdrawn_by_name && (
                            <p className="text-xs text-gray-400">{t('withdrawnBy', { name: item.withdrawn_by_name })}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

          </>
        )}
      </main>

      {/* ==========================================
          MODALS
          ========================================== */}

      {/* Transfer Detail Modal */}
      {showDetailModal && selectedTransfer && (
        <Modal onClose={() => setShowDetailModal(false)}>
          <div className="rounded-t-2xl bg-gradient-to-r from-blue-500 to-indigo-600 p-5 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/20 p-2">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{t('transferDetailTitle')}</h2>
                  <p className="text-sm text-blue-100">{selectedTransfer.transfer_code}</p>
                </div>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="rounded-xl p-2 transition hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800">
              <div>
                <span className="text-gray-500">{t('originBranch')}</span>
                <p className="font-medium dark:text-gray-200">{selectedTransfer.from_store_name}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('transferDate')}</span>
                <p className="font-medium dark:text-gray-200">{formatThaiDateTime(selectedTransfer.created_at)}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('submitter')}</span>
                <p className="font-medium dark:text-gray-200">{selectedTransfer.requested_by_name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('statusLabel')}</span>
                <p className="font-medium text-yellow-600">{t('statusPending')}</p>
              </div>
              {selectedTransfer.product_name && (
                <div>
                  <span className="text-gray-500">{t('productName')}</span>
                  <p className="font-medium dark:text-gray-200">{selectedTransfer.product_name}</p>
                </div>
              )}
              {selectedTransfer.customer_name && (
                <div>
                  <span className="text-gray-500">{t('customerName')}</span>
                  <p className="font-medium dark:text-gray-200">{selectedTransfer.customer_name}</p>
                </div>
              )}
              {selectedTransfer.quantity && (
                <div>
                  <span className="text-gray-500">{t('quantityLabel')}</span>
                  <p className="font-medium dark:text-gray-200">{selectedTransfer.quantity} {t('bottles')}</p>
                </div>
              )}
            </div>
            {selectedTransfer.notes && (
              <div className="mb-4 rounded-xl bg-gray-50 p-3 dark:bg-gray-800">
                <span className="text-sm text-gray-500">{t('notesLabel')}</span>
                <p className="text-sm dark:text-gray-200">{selectedTransfer.notes}</p>
              </div>
            )}
            {selectedTransfer.photo_url && (
              <div className="mb-4">
                <button
                  onClick={() => setViewingPhoto(selectedTransfer.photo_url)}
                  className="w-full rounded-xl bg-blue-100 py-3 text-sm font-medium text-blue-700 transition hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                >
                  <ImageIcon className="mr-2 inline h-4 w-4" /> {t('viewAttachedPhoto')}
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              >
                {t('close')}
              </button>
              <button
                onClick={() => { setShowDetailModal(false); openRejectModal(selectedTransfer); }}
                className="rounded-xl bg-red-100 px-4 py-3 font-semibold text-red-600 transition hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
              >
                <X className="mr-1 inline h-4 w-4" /> {t('reject')}
              </button>
              <button
                onClick={() => { setShowDetailModal(false); openConfirmModal(selectedTransfer); }}
                className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-semibold text-white shadow-lg transition hover:from-green-600 hover:to-emerald-700"
              >
                <Check className="mr-1 inline h-4 w-4" /> {t('receiveItem')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Transfer Modal */}
      {showConfirmModal && selectedTransfer && (
        <Modal onClose={() => setShowConfirmModal(false)}>
          {confirmStep === 1 ? (
            <>
              <div className="rounded-t-2xl bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/20 p-2">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{t('receiveToWarehouse')}</h2>
                    <p className="text-sm text-green-100">{selectedTransfer.transfer_code}</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800">
                  <div>
                    <span className="text-gray-500">{t('branchLabel')}</span>
                    <p className="font-medium dark:text-gray-200">{selectedTransfer.from_store_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('productName')}</span>
                    <p className="font-medium dark:text-gray-200">{selectedTransfer.product_name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('quantityLabel')}</span>
                    <p className="font-medium dark:text-gray-200">{selectedTransfer.quantity || 1} {t('bottles')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('customerName')}</span>
                    <p className="font-medium dark:text-gray-200">{selectedTransfer.customer_name || '-'}</p>
                  </div>
                </div>

                {selectedTransfer.photo_url && (
                  <div className="mb-4">
                    <button
                      onClick={() => setViewingPhoto(selectedTransfer.photo_url)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 py-3 font-semibold text-white shadow-lg transition hover:from-blue-600 hover:to-indigo-700"
                    >
                      <ImageIcon className="h-4 w-4" /> {t('viewBranchPhoto')}
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={() => setConfirmStep(2)}
                    className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-semibold text-white shadow-lg transition hover:from-green-600 hover:to-emerald-700"
                  >
                    {t('nextStep')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-t-2xl bg-gradient-to-r from-blue-500 to-indigo-600 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/20 p-2">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{t('takeConfirmPhoto')}</h2>
                    <p className="text-sm text-blue-100">{t('takeConfirmPhotoDesc')}</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <PhotoUpload
                  value={confirmPhotoUrl}
                  onChange={setConfirmPhotoUrl}
                  folder="hq-received"
                  label={t('attachConfirmPhoto')}
                  required
                  placeholder={t('photoReceivedProduct')}
                />

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('receiverLabel')}</label>
                  <input
                    type="text"
                    readOnly
                    value={user?.displayName || user?.username || ''}
                    className="w-full rounded-xl border-2 border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('notesOptional')}</label>
                  <textarea
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    rows={2}
                    placeholder={t('notesPlaceholder')}
                    className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 transition focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setConfirmStep(1)}
                    className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {t('goBack')}
                  </button>
                  <button
                    onClick={submitConfirmTransfer}
                    disabled={!confirmPhotoUrl || confirmSubmitting}
                    className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-semibold text-white shadow-lg transition hover:from-green-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {confirmSubmitting ? (
                      <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> {t('saving')}</>
                    ) : (
                      <><Check className="mr-1 inline h-4 w-4" /> {t('confirmReceive')}</>
                    )}
                  </button>
                </div>
                {!confirmPhotoUrl && (
                  <p className="mt-2 text-center text-sm text-red-500">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    {t('photoRequired')}
                  </p>
                )}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && selectedHqDeposit && (
        <Modal onClose={() => setShowWithdrawModal(false)}>
          <div className="rounded-t-2xl bg-gradient-to-r from-orange-500 to-amber-600 p-5 text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2">
                <BoxSelect className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t('withdrawTitle')}</h2>
                <p className="text-sm text-orange-100">{selectedHqDeposit.product_name || ''}</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800">
              <div>
                <span className="text-gray-500">{t('productName')}</span>
                <p className="font-medium dark:text-gray-200">{selectedHqDeposit.product_name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('quantityLabel')}</span>
                <p className="font-medium dark:text-gray-200">{selectedHqDeposit.quantity || 1} {t('bottles')}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('customerName')}</span>
                <p className="font-medium dark:text-gray-200">{selectedHqDeposit.customer_name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('fromBranchField')}</span>
                <p className="font-medium dark:text-gray-200">{selectedHqDeposit.from_store_name}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('dispenserLabel')}</label>
              <input
                type="text"
                readOnly
                value={user?.displayName || user?.username || ''}
                className="w-full rounded-xl border-2 border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('notesOptional')}</label>
              <textarea
                value={withdrawNotes}
                onChange={(e) => setWithdrawNotes(e.target.value)}
                rows={2}
                placeholder={t('notesPlaceholder')}
                className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 transition focus:border-orange-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              >
                {t('cancel')}
              </button>
              <button
                onClick={submitWithdraw}
                disabled={withdrawSubmitting}
                className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 py-3 font-semibold text-white shadow-lg transition hover:from-orange-600 hover:to-amber-700 disabled:opacity-50"
              >
                {withdrawSubmitting ? (
                  <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> {t('saving')}</>
                ) : (
                  <><Check className="mr-1 inline h-4 w-4" /> {t('confirmWithdraw')}</>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Withdraw Modal */}
      {showBulkWithdrawModal && selectedReceivedItems.length > 0 && (
        <Modal onClose={() => setShowBulkWithdrawModal(false)}>
          <div className="rounded-t-2xl bg-gradient-to-r from-orange-500 to-amber-600 p-5 text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2">
                <BoxSelect className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t('bulkWithdrawTitle')}</h2>
                <p className="text-sm text-orange-100">
                  {t('bulkWithdrawSubtitle', { count: selectedReceivedItems.length })}
                </p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 max-h-60 space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3 dark:bg-gray-800">
              {selectedReceivedItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {idx + 1}. {item.product_name || t('unspecified')}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {item.customer_name || '-'} &bull; {item.from_store_name}
                    </p>
                  </div>
                  <span className="ml-2 shrink-0 text-sm font-bold text-gray-700 dark:text-gray-200">
                    {item.quantity || 1} {t('bottles')}
                  </span>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t('dispenserLabel')}
              </label>
              <input
                type="text"
                readOnly
                value={user?.displayName || user?.username || ''}
                className="w-full rounded-xl border-2 border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t('notesOptional')}
              </label>
              <textarea
                value={bulkWithdrawNotes}
                onChange={(e) => setBulkWithdrawNotes(e.target.value)}
                rows={2}
                placeholder={t('notesPlaceholder')}
                className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 transition focus:border-orange-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkWithdrawModal(false)}
                className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              >
                {t('cancel')}
              </button>
              <button
                onClick={submitBulkWithdraw}
                disabled={bulkWithdrawSubmitting}
                className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 py-3 font-semibold text-white shadow-lg transition hover:from-orange-600 hover:to-amber-700 disabled:opacity-50"
              >
                {bulkWithdrawSubmitting ? (
                  <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> {t('saving')}</>
                ) : (
                  <><Check className="mr-1 inline h-4 w-4" /> {t('confirmBulkWithdraw', { count: selectedReceivedItems.length })}</>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {showRejectModal && rejectingTransfer && (
        <Modal onClose={() => setShowRejectModal(false)}>
          <div className="rounded-t-2xl bg-gradient-to-r from-red-500 to-rose-600 p-5 text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2">
                <X className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t('rejectTransferTitle')}</h2>
                <p className="text-sm text-red-100">{rejectingTransfer.product_name || ''}</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800">
              <div>
                <span className="text-gray-500">{t('branchLabel')}</span>
                <p className="font-medium dark:text-gray-200">{rejectingTransfer.from_store_name}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('productName')}</span>
                <p className="font-medium dark:text-gray-200">{rejectingTransfer.product_name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('quantityLabel')}</span>
                <p className="font-medium dark:text-gray-200">{rejectingTransfer.quantity || 1} {t('bottles')}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('customerName')}</span>
                <p className="font-medium dark:text-gray-200">{rejectingTransfer.customer_name || '-'}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t('rejectReasonLabel')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder={t('rejectReasonPlaceholder')}
                className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 transition focus:border-red-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowRejectModal(false); setRejectingTransfer(null); }}
                className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              >
                {t('cancel')}
              </button>
              <button
                onClick={submitRejectTransfer}
                disabled={!rejectReason.trim() || rejectSubmitting}
                className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 py-3 font-semibold text-white shadow-lg transition hover:from-red-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rejectSubmitting ? (
                  <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> {t('saving')}</>
                ) : (
                  <><X className="mr-1 inline h-4 w-4" /> {t('confirmReject')}</>
                )}
              </button>
            </div>
            {!rejectReason.trim() && (
              <p className="mt-2 text-center text-sm text-red-500">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                {t('rejectReasonRequiredMsg')}
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* Batch Confirm Modal (Receive All) */}
      {showBatchConfirmModal && batchConfirmGroup && (
        <Modal onClose={() => setShowBatchConfirmModal(false)}>
          {batchConfirmStep === 1 ? (
            <>
              <div className="rounded-t-2xl bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/20 p-2">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{t('receiveAllTitle')}</h2>
                    <p className="text-sm text-green-100">{batchConfirmGroup.transfer_code} &bull; {t('itemCount', { count: batchConfirmGroup.items.length })}</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="mb-3 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800">
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{t('fromBranchLabel', { name: batchConfirmGroup.from_store_name })}</p>
                  <p className="text-xs text-gray-400">{t('sentAtLabel', { date: formatThaiDateTime(batchConfirmGroup.created_at) })}</p>
                </div>

                <div className="mb-4 max-h-60 space-y-2 overflow-y-auto">
                  {batchConfirmGroup.items.map((transfer, idx) => (
                    <div key={transfer.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{idx + 1}. {transfer.product_name || t('unspecified')}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {transfer.customer_name || '-'}
                          {transfer.deposit_code && <span className="ml-1 font-mono text-gray-400">{transfer.deposit_code}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{transfer.quantity || 1} {t('bottles')}</span>
                        {transfer.photo_url && (
                          <button
                            onClick={() => setViewingPhoto(transfer.photo_url)}
                            className="rounded-md bg-blue-50 p-1 text-blue-600 transition hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowBatchConfirmModal(false)}
                    className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={() => setBatchConfirmStep(2)}
                    className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-semibold text-white shadow-lg transition hover:from-green-600 hover:to-emerald-700"
                  >
                    {t('nextStep')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-t-2xl bg-gradient-to-r from-blue-500 to-indigo-600 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/20 p-2">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{t('takeConfirmPhoto')}</h2>
                    <p className="text-sm text-blue-100">{t('onePhotoForAll', { code: batchConfirmGroup.transfer_code })}</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <PhotoUpload
                  value={batchConfirmPhotoUrl}
                  onChange={setBatchConfirmPhotoUrl}
                  folder="hq-received"
                  label={t('attachConfirmPhoto')}
                  required
                  placeholder={t('photoReceivedProduct')}
                />

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('receiverLabel')}</label>
                  <input
                    type="text"
                    readOnly
                    value={user?.displayName || user?.username || ''}
                    className="w-full rounded-xl border-2 border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('notesOptional')}</label>
                  <textarea
                    value={batchConfirmNotes}
                    onChange={(e) => setBatchConfirmNotes(e.target.value)}
                    rows={2}
                    placeholder={t('notesPlaceholder')}
                    className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 transition focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setBatchConfirmStep(1)}
                    className="flex-1 rounded-xl bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {t('goBack')}
                  </button>
                  <button
                    onClick={submitBatchConfirmTransfer}
                    disabled={!batchConfirmPhotoUrl || batchConfirmSubmitting}
                    className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-semibold text-white shadow-lg transition hover:from-green-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {batchConfirmSubmitting ? (
                      <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> {t('saving')}</>
                    ) : (
                      <><Check className="mr-1 inline h-4 w-4" /> {t('confirmReceiveAll', { count: batchConfirmGroup.items.length })}</>
                    )}
                  </button>
                </div>
                {!batchConfirmPhotoUrl && (
                  <p className="mt-2 text-center text-sm text-red-500">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    {t('photoRequired')}
                  </p>
                )}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Photo Viewer Modal */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewingPhoto(null)}
        >
          <div className="relative max-h-full max-w-full">
            <button
              onClick={() => setViewingPhoto(null)}
              className="absolute -top-10 right-0 text-white/80 transition hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewingPhoto}
              alt="Photo"
              className="max-h-[80vh] max-w-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Sub Components
// ==========================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-white p-8 text-center shadow dark:bg-gray-900">
      <Package className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
      <p className="mt-4 text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
