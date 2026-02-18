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
  EmptyState,
  Modal,
  ModalFooter,
  Textarea,
  toast,
} from '@/components/ui';
import { formatThaiDateTime } from '@/lib/utils/format';
import {
  Inbox,
  CheckCircle2,
  XCircle,
  Wine,
  User,
  Phone,
  Package,
  Clock,
  MessageSquare,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { notifyStaff } from '@/lib/notifications/client';

interface DepositRequest {
  id: string;
  store_id: string;
  line_user_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  product_name: string;
  quantity: number;
  notes: string | null;
  status: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'รอตรวจสอบ', variant: 'warning' },
  approved: { label: 'อนุมัติแล้ว', variant: 'success' },
  rejected: { label: 'ปฏิเสธ', variant: 'danger' },
};

export default function DepositRequestsPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [requests, setRequests] = useState<DepositRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Approval modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DepositRequest | null>(null);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('deposit_requests')
      .select('*')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถโหลดคำขอฝากเหล้าได้' });
    }
    if (data) {
      setRequests(data as DepositRequest[]);
    }
    setIsLoading(false);
  }, [currentStoreId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openApprovalModal = (request: DepositRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setApprovalAction(action);
    setApprovalNotes('');
    setShowApprovalModal(true);
  };

  const handleApproval = async () => {
    if (!selectedRequest || !user || !currentStoreId) return;
    setIsSubmitting(true);
    const supabase = createClient();

    if (approvalAction === 'approve') {
      // Fetch store_code for deposit code format
      const { data: storeData } = await supabase
        .from('stores')
        .select('store_code')
        .eq('id', currentStoreId)
        .single();
      const storeCode = storeData?.store_code || 'UNKNOWN';

      // Generate deposit code: DEP-{STORE_CODE}-{5 random alphanumeric}
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let randomPart = '';
      for (let i = 0; i < 5; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const depositCode = `DEP-${storeCode}-${randomPart}`;

      // Calculate expiry date (30 days from now)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      // Create the deposit record
      const { error: depositError } = await supabase.from('deposits').insert({
        store_id: currentStoreId,
        deposit_code: depositCode,
        line_user_id: selectedRequest.line_user_id,
        customer_name: selectedRequest.customer_name,
        customer_phone: selectedRequest.customer_phone,
        product_name: selectedRequest.product_name,
        quantity: selectedRequest.quantity,
        remaining_qty: selectedRequest.quantity,
        remaining_percent: 100,
        status: 'pending_confirm',
        expiry_date: expiryDate.toISOString(),
        received_by: user.id,
        notes: approvalNotes || null,
      });

      if (depositError) {
        toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถสร้างรายการฝากเหล้าได้' });
        setIsSubmitting(false);
        return;
      }

      // Update request status
      const { error: updateError } = await supabase
        .from('deposit_requests')
        .update({ status: 'approved' })
        .eq('id', selectedRequest.id);

      if (updateError) {
        toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถอัปเดตสถานะได้' });
      } else {
        toast({ type: 'success', title: 'อนุมัติคำขอสำเร็จ', message: `สร้างรายการฝาก ${depositCode} - รอบาร์ยืนยัน` });

        // Notify bar staff about the new deposit from LIFF request
        notifyStaff({
          storeId: currentStoreId,
          type: 'new_deposit',
          title: 'มีรายการฝากเหล้าใหม่',
          body: `${selectedRequest.customer_name} ฝาก ${selectedRequest.product_name} x${selectedRequest.quantity}`,
          data: { deposit_code: depositCode },
          excludeUserId: user?.id,
        });

        await logAudit({
          store_id: currentStoreId,
          action_type: AUDIT_ACTIONS.DEPOSIT_REQUEST_APPROVED,
          table_name: 'deposit_requests',
          record_id: selectedRequest.id,
          new_value: {
            customer_name: selectedRequest.customer_name,
            product_name: selectedRequest.product_name,
            deposit_code: depositCode,
          },
          changed_by: user?.id || null,
        });
      }
    } else {
      // Reject
      const { error } = await supabase
        .from('deposit_requests')
        .update({ status: 'rejected' })
        .eq('id', selectedRequest.id);

      if (error) {
        toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถปฏิเสธคำขอได้' });
      } else {
        toast({ type: 'warning', title: 'ปฏิเสธคำขอแล้ว' });
        await logAudit({
          store_id: currentStoreId,
          action_type: AUDIT_ACTIONS.DEPOSIT_REQUEST_REJECTED,
          table_name: 'deposit_requests',
          record_id: selectedRequest.id,
          new_value: { customer_name: selectedRequest.customer_name, reason: approvalNotes || null },
          changed_by: user?.id || null,
        });
      }
    }

    setIsSubmitting(false);
    setShowApprovalModal(false);
    setSelectedRequest(null);
    loadRequests();
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const processedRequests = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-4">
          <Link
            href="/deposit"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับหน้าฝากเหล้า
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">คำขอฝากเหล้า</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          คำขอฝากเหล้าจากลูกค้าผ่าน LINE รอตรวจสอบและอนุมัติ
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingRequests.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">รอตรวจสอบ</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{processedRequests.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">ดำเนินการแล้ว</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Pending Requests */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        </div>
      ) : pendingRequests.length === 0 && processedRequests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="ไม่มีคำขอฝากเหล้า"
          description="ยังไม่มีคำขอฝากเหล้าจากลูกค้าในขณะนี้"
        />
      ) : (
        <>
          {/* Pending Section */}
          {pendingRequests.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                รอตรวจสอบ ({pendingRequests.length})
              </h2>
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <Card key={request.id} padding="none">
                    <div className="p-4 sm:p-5">
                      {/* Request Info */}
                      <div className="mb-3 flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {request.product_name}
                          </h3>
                          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                            จำนวน: {request.quantity}
                          </p>
                        </div>
                        <Badge variant="warning">รอตรวจสอบ</Badge>
                      </div>

                      {/* Customer Details */}
                      <div className="mb-4 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 shrink-0 text-gray-400" />
                          <span>{request.customer_name}</span>
                        </div>
                        {request.customer_phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                            <span>{request.customer_phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                          <span>{formatThaiDateTime(request.created_at)}</span>
                        </div>
                        {request.notes && (
                          <div className="flex items-start gap-2">
                            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                            <span>{request.notes}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          className="min-h-[44px] flex-1"
                          variant="primary"
                          icon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => openApprovalModal(request, 'approve')}
                        >
                          อนุมัติ
                        </Button>
                        <Button
                          className="min-h-[44px] flex-1"
                          variant="danger"
                          icon={<XCircle className="h-4 w-4" />}
                          onClick={() => openApprovalModal(request, 'reject')}
                        >
                          ปฏิเสธ
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Processed Section */}
          {processedRequests.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                ดำเนินการแล้ว ({processedRequests.length})
              </h2>
              <div className="space-y-3">
                {processedRequests.map((request) => {
                  const config = statusConfig[request.status] || statusConfig.pending;
                  return (
                    <Card key={request.id} padding="none">
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {request.product_name}
                            </h3>
                            <div className="mt-1 space-y-0.5 text-sm text-gray-500 dark:text-gray-400">
                              <p className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" />
                                {request.customer_name}
                              </p>
                              <p>จำนวน: {request.quantity}</p>
                              <p className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                {formatThaiDateTime(request.created_at)}
                              </p>
                            </div>
                          </div>
                          <Badge variant={config.variant}>{config.label}</Badge>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Approval / Rejection Modal */}
      <Modal
        isOpen={showApprovalModal}
        onClose={() => {
          setShowApprovalModal(false);
          setSelectedRequest(null);
        }}
        title={approvalAction === 'approve' ? 'อนุมัติคำขอฝากเหล้า' : 'ปฏิเสธคำขอฝากเหล้า'}
        description={
          selectedRequest
            ? `${selectedRequest.product_name} - ${selectedRequest.customer_name}`
            : undefined
        }
        size="md"
      >
        <div className="space-y-4">
          {selectedRequest && (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">สินค้า</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedRequest.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">ลูกค้า</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedRequest.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">จำนวน</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedRequest.quantity}</span>
                </div>
              </div>
            </div>
          )}

          <Textarea
            label="หมายเหตุ"
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            placeholder={
              approvalAction === 'approve'
                ? 'หมายเหตุเพิ่มเติม (ไม่บังคับ)'
                : 'ระบุเหตุผลในการปฏิเสธ'
            }
            rows={3}
          />
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowApprovalModal(false);
              setSelectedRequest(null);
            }}
          >
            ยกเลิก
          </Button>
          <Button
            variant={approvalAction === 'approve' ? 'primary' : 'danger'}
            onClick={handleApproval}
            isLoading={isSubmitting}
            icon={
              approvalAction === 'approve'
                ? <CheckCircle2 className="h-4 w-4" />
                : <XCircle className="h-4 w-4" />
            }
          >
            {approvalAction === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
