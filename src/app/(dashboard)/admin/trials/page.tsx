'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { Button, Badge, Card, EmptyState, Modal, ModalFooter, toast } from '@/components/ui';
import { formatThaiDate } from '@/lib/utils/format';
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Store,
  Mail,
  Phone,
  MessageSquare,
} from 'lucide-react';

interface TrialRegistration {
  id: string;
  store_name: string;
  email: string;
  phone: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
}

export default function AdminTrialsPage() {
  const [registrations, setRegistrations] = useState<TrialRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; storeName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadRegistrations = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('trial_registrations')
      .select('id, store_name, email, phone, status, rejection_reason, created_at, approved_at')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRegistrations(data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  const filtered = registrations.filter((r) => r.status === activeTab);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch('/api/admin/approve-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: id, action: 'approve' }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: data.error });
        return;
      }

      toast({
        type: 'success',
        title: 'อนุมัติสำเร็จ',
        message: data.smsSent ? 'ส่ง SMS แจ้งเตือนแล้ว' : 'อนุมัติแล้ว (SMS ไม่สำเร็จ)',
      });
      loadRegistrations();
    } catch {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessingId(rejectModal.id);
    try {
      const res = await fetch('/api/admin/approve-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId: rejectModal.id,
          action: 'reject',
          rejectionReason: rejectReason || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: data.error });
        return;
      }

      toast({ type: 'success', title: 'ปฏิเสธแล้ว' });
      setRejectModal(null);
      setRejectReason('');
      loadRegistrations();
    } catch {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = registrations.filter((r) => r.status === 'pending').length;
  const approvedCount = registrations.filter((r) => r.status === 'approved').length;
  const rejectedCount = registrations.filter((r) => r.status === 'rejected').length;

  const tabs = [
    { id: 'pending' as const, label: 'รออนุมัติ', count: pendingCount },
    { id: 'approved' as const, label: 'อนุมัติแล้ว', count: approvedCount },
    { id: 'rejected' as const, label: 'ปฏิเสธ', count: rejectedCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">จัดการทดลองใช้</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          อนุมัติหรือปฏิเสธผู้สมัครทดลองใช้ระบบ
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                tab.id === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={activeTab === 'pending' ? 'ไม่มีรายการรออนุมัติ' : 'ไม่มีรายการ'}
          description="ยังไม่มีผู้สมัครทดลองใช้ในหมวดนี้"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((reg) => (
            <Card key={reg.id} padding="md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-gray-400" />
                    <span className="font-semibold text-gray-900 dark:text-white">{reg.store_name}</span>
                    <Badge
                      variant={reg.status === 'pending' ? 'warning' : reg.status === 'approved' ? 'success' : 'danger'}
                      size="sm"
                    >
                      {reg.status === 'pending' ? 'รออนุมัติ' : reg.status === 'approved' ? 'อนุมัติแล้ว' : 'ปฏิเสธ'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {reg.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {reg.phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatThaiDate(reg.created_at)}
                    </span>
                  </div>
                  {reg.rejection_reason && (
                    <p className="text-sm text-red-500 dark:text-red-400">
                      เหตุผล: {reg.rejection_reason}
                    </p>
                  )}
                </div>

                {reg.status === 'pending' && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      icon={<CheckCircle className="h-4 w-4" />}
                      isLoading={processingId === reg.id}
                      onClick={() => handleApprove(reg.id)}
                    >
                      อนุมัติ
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<XCircle className="h-4 w-4" />}
                      disabled={!!processingId}
                      onClick={() => setRejectModal({ id: reg.id, storeName: reg.store_name })}
                    >
                      ปฏิเสธ
                    </Button>
                  </div>
                )}

                {reg.status === 'approved' && reg.approved_at && (
                  <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                    <MessageSquare className="h-4 w-4" />
                    SMS ส่งแล้ว
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <Modal
          isOpen
          onClose={() => { setRejectModal(null); setRejectReason(''); }}
          title={`ปฏิเสธ "${rejectModal.storeName}"`}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                เหตุผล (ไม่บังคับ)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="เช่น ข้อมูลไม่ครบ, ซ้ำกับบัญชีเดิม"
                rows={3}
                className={cn(
                  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none',
                  'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
                  'dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                )}
              />
            </div>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setRejectModal(null); setRejectReason(''); }}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              isLoading={!!processingId}
              onClick={handleReject}
            >
              ยืนยันปฏิเสธ
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
