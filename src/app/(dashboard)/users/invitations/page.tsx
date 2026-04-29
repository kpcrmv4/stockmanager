'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Button,
  Badge,
  Card,
  Modal,
  ModalFooter,
  Select,
  Textarea,
  EmptyState,
  toast,
} from '@/components/ui';
import { ROLE_LABELS } from '@/types/roles';
import type { UserRole } from '@/types/roles';
import { formatThaiDate } from '@/lib/utils/format';
import { ArrowLeft, Plus, Copy, Trash2, Mail, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Invitation {
  id: string;
  token: string;
  store_id: string;
  role: UserRole;
  active: boolean;
  used_count: number;
  notes: string | null;
  created_at: string;
  store: { store_name: string; store_code: string } | null;
  creator: { display_name: string | null; username: string } | null;
}

interface StoreOption {
  id: string;
  store_name: string;
}

const INVITABLE_ROLES: UserRole[] = ['accountant', 'manager', 'bar', 'staff', 'hq'];

export default function InvitationsPage() {
  const [items, setItems] = useState<Invitation[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [formStoreId, setFormStoreId] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('staff');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch('/api/users/invitations');
    const data = await res.json();
    if (res.ok) setItems(data.invitations || []);
    else toast({ type: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', message: data.error });
    setIsLoading(false);
  }, []);

  const loadStores = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id, store_name')
      .eq('active', true)
      .order('store_name');
    if (data) {
      setStores(data);
      if (data[0] && !formStoreId) setFormStoreId(data[0].id);
    }
  }, [formStoreId]);

  useEffect(() => {
    load();
    loadStores();
  }, [load, loadStores]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStoreId || !formRole) return;
    setIsSubmitting(true);
    const res = await fetch('/api/users/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: formStoreId, role: formRole, notes: formNotes }),
    });
    const data = await res.json();
    if (res.ok) {
      toast({ type: 'success', title: 'สร้างลิงก์เชิญแล้ว' });
      setShowCreate(false);
      setFormNotes('');
      load();
    } else {
      toast({ type: 'error', title: 'สร้างไม่สำเร็จ', message: data.error });
    }
    setIsSubmitting(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const res = await fetch(`/api/users/invitations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !current }),
    });
    if (res.ok) {
      toast({ type: 'success', title: !current ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว' });
      load();
    } else {
      const data = await res.json();
      toast({ type: 'error', title: 'อัปเดตไม่สำเร็จ', message: data.error });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ลบลิงก์เชิญนี้?')) return;
    const res = await fetch(`/api/users/invitations/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ type: 'success', title: 'ลบแล้ว' });
      load();
    } else {
      const data = await res.json();
      toast({ type: 'error', title: 'ลบไม่สำเร็จ', message: data.error });
    }
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    toast({ type: 'success', title: 'คัดลอกลิงก์แล้ว', message: url });
  };

  return (
    <div className="space-y-6">
      <Link
        href="/users"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปหน้าผู้ใช้
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">จัดการลิงก์เชิญ</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            สร้างลิงก์ให้พนักงานลงทะเบียน — กำหนดตำแหน่งและสาขาได้ต่อลิงก์
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
          สร้างลิงก์เชิญ
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="ยังไม่มีลิงก์เชิญ"
          description="สร้างลิงก์แรกเพื่อให้พนักงานลงทะเบียนเข้ามา"
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
              สร้างลิงก์เชิญ
            </Button>
          }
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                  <th className="px-4 py-3">สาขา</th>
                  <th className="px-4 py-3">ตำแหน่ง</th>
                  <th className="px-4 py-3">หมายเหตุ</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                  <th className="px-4 py-3 text-center">ใช้แล้ว</th>
                  <th className="px-4 py-3">สร้างเมื่อ</th>
                  <th className="px-4 py-3 text-right">การกระทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map((inv) => (
                  <tr key={inv.id} className="text-gray-700 dark:text-gray-300">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {inv.store?.store_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{ROLE_LABELS[inv.role] || inv.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {inv.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(inv.id, inv.active)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          inv.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        title={inv.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                            inv.active ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center text-xs">{inv.used_count}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {formatThaiDate(inv.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => copyLink(inv.token)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30"
                          title="คัดลอกลิงก์"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <a
                          href={`/invite/${inv.token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                          title="เปิดลิงก์"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(inv.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          title="ลบ"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="สร้างลิงก์เชิญใหม่">
        <form onSubmit={handleCreate} className="space-y-4">
          <Select
            label="สาขา"
            value={formStoreId}
            onChange={(e) => setFormStoreId(e.target.value)}
            options={stores.map((s) => ({ value: s.id, label: s.store_name }))}
            required
          />
          <Select
            label="ตำแหน่ง"
            value={formRole}
            onChange={(e) => setFormRole(e.target.value as UserRole)}
            options={INVITABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] || r }))}
            required
          />
          <Textarea
            label="หมายเหตุ (ไม่บังคับ)"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="เช่น: เชิญน้องโจ บาร์ Baccarat"
            rows={2}
          />
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" isLoading={isSubmitting} icon={<Plus className="h-4 w-4" />}>
              สร้างลิงก์
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}

