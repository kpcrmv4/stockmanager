'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Badge,
  Card,
  EmptyState,
  Input,
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
  User,
  Phone,
  Package,
  Clock,
  MessageSquare,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { syncChatActionCardStatus } from '@/lib/chat/bot-client';
import { DepositForm } from '../_components/deposit-form';

/**
 * Staff queue for customer-submitted deposit requests.
 *
 * Source of truth = `deposits` table (status='pending_staff' rows are
 * customer LIFF submissions). On approve, the same row transitions to
 * status='pending_confirm' with product/quantity filled in — bar then
 * verifies via the chat action card or /bar-approval page.
 */

interface DepositRequest {
  id: string;
  store_id: string;
  deposit_code: string;
  line_user_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  product_name: string | null;
  quantity: number | null;
  table_number: string | null;
  customer_photo_url: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

const statusVariant: Record<string, 'warning' | 'success' | 'danger'> = {
  pending_staff: 'warning',
  pending_confirm: 'success',
  in_store: 'success',
  cancelled: 'danger',
};

const statusLabelKey: Record<string, string> = {
  pending_staff: 'requests.statusPending',
  pending_confirm: 'requests.statusApproved',
  in_store: 'requests.statusApproved',
  cancelled: 'requests.statusRejected',
};

export default function DepositRequestsPage() {
  const t = useTranslations('deposit');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [requests, setRequests] = useState<DepositRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Reject modal state (approve uses the full DepositForm rendered inline)
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DepositRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When set, the page renders <DepositForm> inline (replacing the list)
  // pre-filled with the customer's request. Same UX as "+ ฝากเหล้าใหม่".
  const [fulfillingRequest, setFulfillingRequest] = useState<DepositRequest | null>(null);

  const loadRequests = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();

    // Pull pending_staff (queue) + recently-processed (pending_confirm /
    // in_store / cancelled in last 7 days) so staff can see what they just
    // approved without leaving the page.
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data, error } = await supabase
      .from('deposits')
      .select(
        'id, store_id, deposit_code, line_user_id, customer_name, customer_phone, product_name, quantity, table_number, customer_photo_url, notes, status, created_at',
      )
      .eq('store_id', currentStoreId)
      .or(
        `status.eq.pending_staff,and(status.in.(pending_confirm,in_store,cancelled),created_at.gte.${sevenDaysAgo})`,
      )
      .order('created_at', { ascending: false });

    if (error) {
      toast({ type: 'error', title: t('loadError'), message: t('requests.loadError') });
    }
    if (data) {
      setRequests(data as DepositRequest[]);
    }
    setIsLoading(false);
  }, [currentStoreId, t]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openApprove = (request: DepositRequest) => {
    // Approve uses the full DepositForm component (rendered inline) so
    // staff get the same product autocomplete + category picker + multi-item
    // UX as the "+ ฝากเหล้าใหม่" flow. Customer info is pre-filled.
    setFulfillingRequest(request);
  };

  const openReject = (request: DepositRequest) => {
    setSelectedRequest(request);
    setRejectNotes('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!selectedRequest || !user || !currentStoreId) return;
    setIsSubmitting(true);
    const supabase = createClient();

    // Reject: mark the deposit as cancelled (no bottle data to clean up
    // because qty was 0 and the bottle trigger never fired).
    const { error } = await supabase
      .from('deposits')
      .update({
        status: 'cancelled',
        notes: rejectNotes
          ? `${selectedRequest.notes || ''}${selectedRequest.notes ? ' | ' : ''}ปฏิเสธ: ${rejectNotes}`
          : `${selectedRequest.notes || ''}${selectedRequest.notes ? ' | ' : ''}ปฏิเสธโดย Staff`,
      })
      .eq('id', selectedRequest.id);

    if (error) {
      toast({ type: 'error', title: t('loadError'), message: t('requests.rejectError') });
    } else {
      toast({ type: 'warning', title: t('requests.rejectSuccess') });

      syncChatActionCardStatus({
        storeId: currentStoreId,
        referenceId: selectedRequest.deposit_code,
        actionType: 'deposit_claim',
        newStatus: 'completed',
        completedBy: user.id,
        completedByName: user.username || user.id,
      });

      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.DEPOSIT_REQUEST_REJECTED,
        table_name: 'deposits',
        record_id: selectedRequest.id,
        new_value: {
          customer_name: selectedRequest.customer_name,
          deposit_code: selectedRequest.deposit_code,
          reason: rejectNotes || null,
        },
        changed_by: user?.id || null,
      });
    }

    setIsSubmitting(false);
    setShowRejectModal(false);
    setSelectedRequest(null);
    loadRequests();
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending_staff');
  const processedRequests = requests.filter((r) => r.status !== 'pending_staff');

  // When staff clicked Approve, render the full DepositForm pre-filled
  // with the customer's request — same UX as "+ ฝากเหล้าใหม่".
  if (fulfillingRequest) {
    return (
      <DepositForm
        pendingDeposit={{
          id: fulfillingRequest.id,
          deposit_code: fulfillingRequest.deposit_code,
          customer_name: fulfillingRequest.customer_name,
          customer_phone: fulfillingRequest.customer_phone,
          table_number: fulfillingRequest.table_number,
          notes: fulfillingRequest.notes,
          line_user_id: fulfillingRequest.line_user_id,
          customer_photo_url: fulfillingRequest.customer_photo_url,
        }}
        onBack={() => setFulfillingRequest(null)}
        onSuccess={() => {
          setFulfillingRequest(null);
          loadRequests();
        }}
      />
    );
  }

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
            {t('requests.backToDeposit')}
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('requests.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('requests.subtitle')}
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
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('requests.pendingReview')}</p>
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
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('requests.processed')}</p>
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
          title={t('requests.noRequests')}
          description={t('requests.noRequestsDesc')}
        />
      ) : (
        <>
          {pendingRequests.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                {t('requests.pendingReview')} ({pendingRequests.length})
              </h2>
              <div className="space-y-3">
                {pendingRequests.map((request) => {
                  const needsDetails = !request.product_name || request.quantity == null || request.quantity <= 0;
                  return (
                  <Card key={request.id} padding="none">
                    <div className="p-4 sm:p-5">
                      <div className="mb-3 flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {request.product_name || t('requests.awaitingDetails')}
                          </h3>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {request.deposit_code}
                          </p>
                          {!needsDetails && request.quantity != null && (
                            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                              {t('requests.quantity', { qty: request.quantity })}
                            </p>
                          )}
                        </div>
                        <Badge variant="warning">{t('requests.pendingReview')}</Badge>
                      </div>

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
                        {request.table_number && (
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 shrink-0 text-gray-400" />
                            <span>{t('requests.tableLabel')}: {request.table_number}</span>
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
                        {request.customer_photo_url && (
                          <a
                            href={request.customer_photo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={request.customer_photo_url}
                              alt="customer bottle"
                              className="h-24 w-24 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                            />
                          </a>
                        )}
                        {needsDetails && (
                          <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            {t('requests.needsDetailsHint')}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          className="min-h-[44px] flex-1"
                          variant="primary"
                          icon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => openApprove(request)}
                        >
                          {t('requests.approve')}
                        </Button>
                        <Button
                          className="min-h-[44px] flex-1"
                          variant="danger"
                          icon={<XCircle className="h-4 w-4" />}
                          onClick={() => openReject(request)}
                        >
                          {t('requests.reject')}
                        </Button>
                      </div>
                    </div>
                  </Card>
                  );
                })}
              </div>
            </div>
          )}

          {processedRequests.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                {t('requests.processed')} ({processedRequests.length})
              </h2>
              <div className="space-y-3">
                {processedRequests.map((request) => {
                  const variant = statusVariant[request.status] || 'warning';
                  const labelKey = statusLabelKey[request.status] || statusLabelKey.pending_staff;
                  return (
                    <Card key={request.id} padding="none">
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {request.product_name || t('requests.awaitingDetails')}
                            </h3>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {request.deposit_code}
                            </p>
                            <div className="mt-1 space-y-0.5 text-sm text-gray-500 dark:text-gray-400">
                              <p className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" />
                                {request.customer_name}
                              </p>
                              {request.quantity != null && request.quantity > 0 && (
                                <p>{t('requests.quantity', { qty: request.quantity })}</p>
                              )}
                              <p className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                {formatThaiDateTime(request.created_at)}
                              </p>
                            </div>
                          </div>
                          <Badge variant={variant}>{t(labelKey)}</Badge>
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

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setSelectedRequest(null);
        }}
        title={t('requests.rejectTitle')}
        description={
          selectedRequest
            ? `${selectedRequest.product_name || t('requests.awaitingDetails')} - ${selectedRequest.customer_name}`
            : undefined
        }
        size="md"
      >
        <div className="space-y-4">
          {selectedRequest && (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('requests.customerLabel')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{selectedRequest.customer_name}</span>
                </div>
                {selectedRequest.table_number && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('requests.tableLabel')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{selectedRequest.table_number}</span>
                  </div>
                )}
                {selectedRequest.notes && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('requests.notesLabel')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{selectedRequest.notes}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <Textarea
            label={t('requests.notesLabel')}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder={t('requests.rejectNotesPlaceholder')}
            rows={3}
          />
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowRejectModal(false);
              setSelectedRequest(null);
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={handleReject}
            isLoading={isSubmitting}
            icon={<XCircle className="h-4 w-4" />}
          >
            {t('requests.reject')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
