'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import {
  Button,
  Badge,
  Card,
  Input,
  Modal,
  ModalFooter,
  Select,
  EmptyState,
  toast,
} from '@/components/ui';
import { formatThaiDate } from '@/lib/utils/format';
import { ROLE_LABELS } from '@/types/roles';
import type { UserRole } from '@/types/roles';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Shield,
  UserCheck,
  UserX,
  Store,
} from 'lucide-react';

interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  display_name: string | null;
  active: boolean;
  created_at: string;
  line_user_id: string | null;
  stores: Array<{ store_id: string; store: { store_name: string } }>;
}

interface StoreOption {
  id: string;
  store_name: string;
}

const roleBadgeVariants: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  owner: 'danger',
  accountant: 'info',
  manager: 'warning',
  bar: 'success',
  staff: 'default',
  customer: 'default',
};

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // Create form
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<string>('staff');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formStoreId, setFormStoreId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('profiles')
      .select('*, stores:user_stores(store_id, store:stores(store_name))')
      .neq('role', 'customer')
      .order('created_at', { ascending: false });

    if (data) setUsers(data as unknown as UserProfile[]);
    setIsLoading(false);
  }, []);

  const loadStores = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id, store_name')
      .eq('active', true)
      .order('store_name');
    if (data) setStores(data);
  }, []);

  useEffect(() => {
    loadUsers();
    loadStores();
  }, [loadUsers, loadStores]);

  const handleCreateUser = async () => {
    if (!formUsername || !formPassword || !currentUser) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formUsername.trim(),
          password: formPassword,
          role: formRole,
          displayName: formDisplayName.trim() || null,
          storeId: formStoreId || null,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: result.error || 'ไม่สามารถสร้างผู้ใช้ได้' });
      } else {
        toast({ type: 'success', title: 'สร้างผู้ใช้สำเร็จ' });
        setShowCreateModal(false);
        resetForm();
        loadUsers();
      }
    } catch {
      toast({ type: 'error', title: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
    }
    setIsSubmitting(false);
  };

  const toggleUserActive = async (userId: string, currentActive: boolean) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ active: !currentActive })
      .eq('id', userId);

    if (!error) {
      toast({ type: 'success', title: currentActive ? 'ปิดใช้งานผู้ใช้' : 'เปิดใช้งานผู้ใช้' });
      loadUsers();
    }
  };

  const resetForm = () => {
    setFormUsername('');
    setFormPassword('');
    setFormRole('staff');
    setFormDisplayName('');
    setFormStoreId('');
  };

  const filteredUsers = users.filter(
    (u) =>
      !searchQuery ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">จัดการผู้ใช้</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            จัดการพนักงานและกำหนดสิทธิ์การเข้าถึง
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>
          เพิ่มผู้ใช้
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ค้นหาผู้ใช้..."
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {/* User List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="ไม่พบผู้ใช้"
          description="เพิ่มผู้ใช้เพื่อเริ่มจัดการทีม"
        />
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => (
            <Card key={u.id} padding="none">
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                    {(u.display_name || u.username).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {u.display_name || u.username}
                      </p>
                      <Badge variant={roleBadgeVariants[u.role] || 'default'}>
                        {ROLE_LABELS[u.role] || u.role}
                      </Badge>
                      {!u.active && <Badge variant="danger">ปิดใช้งาน</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      @{u.username} | สร้างเมื่อ {formatThaiDate(u.created_at)}
                    </p>
                    {u.stores && u.stores.length > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <Store className="h-3 w-3" />
                        {u.stores.map((s) => s.store?.store_name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {u.id !== currentUser?.id && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleUserActive(u.id, u.active)}
                      className={cn(
                        'rounded-lg p-2 transition-colors',
                        u.active
                          ? 'text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20'
                          : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-900/20'
                      )}
                      title={u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    >
                      {u.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        title="เพิ่มผู้ใช้ใหม่"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="ชื่อผู้ใช้"
            value={formUsername}
            onChange={(e) => setFormUsername(e.target.value)}
            placeholder="เช่น somchai"
            hint="ใช้ภาษาอังกฤษ ตัวเลข หรือขีดล่าง"
          />
          <Input
            label="รหัสผ่าน"
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            placeholder="กำหนดรหัสผ่าน"
          />
          <Input
            label="ชื่อที่แสดง"
            value={formDisplayName}
            onChange={(e) => setFormDisplayName(e.target.value)}
            placeholder="เช่น สมชาย (ไม่บังคับ)"
          />
          <Select
            label="ตำแหน่ง"
            value={formRole}
            onChange={(e) => setFormRole(e.target.value)}
            options={[
              { value: 'staff', label: 'พนักงาน (Staff)' },
              { value: 'bar', label: 'หัวหน้าบาร์ (Bar)' },
              { value: 'manager', label: 'ผู้จัดการ (Manager)' },
              { value: 'accountant', label: 'บัญชี (Accountant)' },
              { value: 'hq', label: 'พนักงานคลังกลาง (HQ)' },
            ]}
          />
          <Select
            label="สาขา"
            value={formStoreId}
            onChange={(e) => setFormStoreId(e.target.value)}
            placeholder="เลือกสาขา"
            options={stores.map((s) => ({ value: s.id, label: s.store_name }))}
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleCreateUser}
            isLoading={isSubmitting}
            disabled={!formUsername || !formPassword}
            icon={<Plus className="h-4 w-4" />}
          >
            สร้างผู้ใช้
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
