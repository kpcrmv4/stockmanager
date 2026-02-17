'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Tabs,
  EmptyState,
  Modal,
  ModalFooter,
  Select,
  Input,
  Textarea,
  toast,
} from '@/components/ui';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import {
  Truck,
  Plus,
  ArrowRight,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Store,
} from 'lucide-react';

interface Transfer {
  id: string;
  from_store_id: string;
  to_store_id: string;
  deposit_id: string | null;
  product_name: string;
  quantity: number;
  status: 'pending' | 'confirmed' | 'rejected';
  requested_by: string;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
  from_store?: { store_name: string };
  to_store?: { store_name: string };
  requester?: { display_name: string; username: string };
}

interface StoreOption {
  id: string;
  store_name: string;
  store_code: string;
  is_central: boolean;
}

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger'; icon: typeof Clock }> = {
  pending: { label: 'รอยืนยัน', variant: 'warning', icon: Clock },
  confirmed: { label: 'ยืนยันแล้ว', variant: 'success', icon: CheckCircle2 },
  rejected: { label: 'ปฏิเสธ', variant: 'danger', icon: XCircle },
};

const tabs = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'pending', label: 'รอยืนยัน' },
  { id: 'confirmed', label: 'ยืนยันแล้ว' },
  { id: 'rejected', label: 'ปฏิเสธ' },
];

export default function TransferPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New transfer form
  const [formToStore, setFormToStore] = useState('');
  const [formProduct, setFormProduct] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTransfers = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('transfers')
      .select('*, from_store:stores!transfers_from_store_id_fkey(store_name), to_store:stores!transfers_to_store_id_fkey(store_name)')
      .or(`from_store_id.eq.${currentStoreId},to_store_id.eq.${currentStoreId}`)
      .order('created_at', { ascending: false });

    if (activeTab !== 'all') {
      query = query.eq('status', activeTab);
    }

    const { data, error } = await query;
    if (!error && data) {
      setTransfers(data as unknown as Transfer[]);
    }
    setIsLoading(false);
  }, [currentStoreId, activeTab]);

  const loadStores = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id, store_name, store_code, is_central')
      .eq('active', true)
      .order('store_name');
    if (data) setStores(data);
  }, []);

  useEffect(() => {
    loadTransfers();
    loadStores();
  }, [loadTransfers, loadStores]);

  const handleCreateTransfer = async () => {
    if (!formToStore || !formProduct || !formQuantity || !currentStoreId || !user) return;

    setIsSubmitting(true);
    const supabase = createClient();

    const { error } = await supabase.from('transfers').insert({
      from_store_id: currentStoreId,
      to_store_id: formToStore,
      product_name: formProduct,
      quantity: parseFloat(formQuantity),
      notes: formNotes || null,
      requested_by: user.id,
    });

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถสร้างรายการโอนได้' });
    } else {
      toast({ type: 'success', title: 'สร้างรายการโอนสำเร็จ' });
      setShowNewModal(false);
      resetForm();
      loadTransfers();
    }
    setIsSubmitting(false);
  };

  const handleConfirm = async (transferId: string) => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('transfers')
      .update({ status: 'confirmed', confirmed_by: user.id })
      .eq('id', transferId);

    if (!error) {
      toast({ type: 'success', title: 'ยืนยันการโอนสำเร็จ' });
      loadTransfers();
    }
  };

  const handleReject = async (transferId: string) => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('transfers')
      .update({ status: 'rejected', confirmed_by: user.id })
      .eq('id', transferId);

    if (!error) {
      toast({ type: 'warning', title: 'ปฏิเสธการโอน' });
      loadTransfers();
    }
  };

  const resetForm = () => {
    setFormToStore('');
    setFormProduct('');
    setFormQuantity('');
    setFormNotes('');
  };

  const filteredTransfers = transfers.filter((t) =>
    !searchQuery ||
    t.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.from_store?.store_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.to_store?.store_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingCount = transfers.filter((t) => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">โอนสต๊อก</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            จัดการการโอนสินค้าระหว่างสาขา
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewModal(true)}>
          สร้างรายการโอน
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{transfers.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ทั้งหมด</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">รอยืนยัน</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {transfers.filter((t) => t.status === 'confirmed').length}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ยืนยันแล้ว</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {transfers.filter((t) => t.status === 'rejected').length}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ปฏิเสธ</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={tabs.map((t) => ({
            ...t,
            count: t.id === 'pending' ? pendingCount : undefined,
          }))}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาสินค้า/สาขา..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>

      {/* Transfer List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        </div>
      ) : filteredTransfers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="ไม่มีรายการโอน"
          description="ยังไม่มีรายการโอนสต๊อกระหว่างสาขา"
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewModal(true)}>
              สร้างรายการโอน
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredTransfers.map((transfer) => {
            const config = statusConfig[transfer.status];
            const StatusIcon = config.icon;
            const isIncoming = transfer.to_store_id === currentStoreId;

            return (
              <Card key={transfer.id} padding="none">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        isIncoming
                          ? 'bg-emerald-50 dark:bg-emerald-900/20'
                          : 'bg-blue-50 dark:bg-blue-900/20'
                      )}
                    >
                      {isIncoming ? (
                        <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {transfer.product_name}
                        </p>
                        <Badge variant={config.variant as 'warning' | 'success' | 'danger'}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {config.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                        <Store className="h-3.5 w-3.5" />
                        <span>{transfer.from_store?.store_name || 'ไม่ทราบ'}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span>{transfer.to_store?.store_name || 'ไม่ทราบ'}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        จำนวน: {formatNumber(transfer.quantity)} | {formatThaiDate(transfer.created_at)}
                      </p>
                      {transfer.notes && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                          หมายเหตุ: {transfer.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions - only for incoming pending transfers */}
                  {isIncoming && transfer.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={() => handleConfirm(transfer.id)}
                      >
                        ยืนยัน
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => handleReject(transfer.id)}
                      >
                        ปฏิเสธ
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Transfer Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => {
          setShowNewModal(false);
          resetForm();
        }}
        title="สร้างรายการโอนสต๊อก"
        description="โอนสินค้าไปยังสาขาอื่นหรือคลังกลาง"
        size="lg"
      >
        <div className="space-y-4">
          <Select
            label="ปลายทาง"
            options={stores
              .filter((s) => s.id !== currentStoreId)
              .map((s) => ({
                value: s.id,
                label: `${s.store_name}${s.is_central ? ' (คลังกลาง)' : ''}`,
              }))}
            value={formToStore}
            onChange={(e) => setFormToStore(e.target.value)}
            placeholder="เลือกสาขาปลายทาง"
          />
          <Input
            label="ชื่อสินค้า"
            value={formProduct}
            onChange={(e) => setFormProduct(e.target.value)}
            placeholder="เช่น Johnnie Walker Black Label"
          />
          <Input
            label="จำนวน"
            type="number"
            value={formQuantity}
            onChange={(e) => setFormQuantity(e.target.value)}
            placeholder="0"
            hint="หน่วยตามสินค้า (ขวด/ลัง)"
          />
          <Textarea
            label="หมายเหตุ"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="ระบุเหตุผลการโอน (ถ้ามี)"
            rows={3}
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowNewModal(false);
              resetForm();
            }}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleCreateTransfer}
            isLoading={isSubmitting}
            disabled={!formToStore || !formProduct || !formQuantity}
            icon={<Truck className="h-4 w-4" />}
          >
            สร้างรายการโอน
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
