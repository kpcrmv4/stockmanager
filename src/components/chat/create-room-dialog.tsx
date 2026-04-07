'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import { Loader2, Check, Users } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StoreUser {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
}

export function CreateRoomDialog({ isOpen, onClose }: CreateRoomDialogProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { rooms, setRooms } = useChatStore();

  const [name, setName] = useState('');
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load store users
  useEffect(() => {
    if (!isOpen || !user) return;

    const supabase = createClient();
    const storeId = user.storeIds?.[0];
    if (!storeId) return;

    supabase
      .from('user_stores')
      .select('user_id, profiles:user_id(id, username, display_name, role)')
      .eq('store_id', storeId)
      .then(({ data }) => {
        if (data) {
          const users = data
            .map((d) => d.profiles as unknown as StoreUser)
            .filter(Boolean)
            .filter((u) => u.id !== user.id);
          setStoreUsers(users);

          // Owner ต้องอยู่ทุกห้อง — auto-select owners
          const ownerIds = new Set<string>();
          users.forEach((u) => {
            if (u.role === 'owner') ownerIds.add(u.id);
          });
          setSelectedIds(ownerIds);
        }
      });
  }, [isOpen, user]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setSelectedIds(new Set());
      setSearchQuery('');
    }
  }, [isOpen]);

  const toggleUser = (userId: string) => {
    // Don't allow deselecting owner
    const userObj = storeUsers.find((u) => u.id === userId);
    if (userObj?.role === 'owner') return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (!user || !name.trim()) return;

    setCreating(true);
    const supabase = createClient();
    const storeId = user.storeIds?.[0] || null;

    // 1. Create room
    const { data: newRoom, error } = await supabase
      .from('chat_rooms')
      .insert({
        store_id: storeId,
        name: name.trim(),
        type: 'direct' as const,
        created_by: user.id,
      })
      .select('id, store_id, name, type, is_active, pinned_summary, avatar_url, created_by, created_at, updated_at')
      .single();

    if (error || !newRoom) {
      setCreating(false);
      return;
    }

    // 2. Add creator as admin
    await supabase.from('chat_members').insert({
      room_id: newRoom.id,
      user_id: user.id,
      role: 'admin',
    });

    // 3. Add selected members
    if (selectedIds.size > 0) {
      const memberInserts = Array.from(selectedIds).map((uid) => ({
        room_id: newRoom.id,
        user_id: uid,
        role: 'member' as const,
      }));
      await supabase.from('chat_members').insert(memberInserts);
    }

    // 4. Update local state
    setRooms([
      {
        ...newRoom,
        avatar_url: newRoom.avatar_url || null,
        created_by: newRoom.created_by || null,
        unread_count: 0,
        last_message: null,
      },
      ...rooms,
    ]);

    setCreating(false);
    onClose();
    router.push(`/chat/${newRoom.id}`);
  };

  const filteredUsers = storeUsers.filter(
    (u) =>
      !searchQuery ||
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="สร้างห้องแชทใหม่" size="md">
      <div className="space-y-4">
        {/* Room name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            ชื่อห้อง
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ทีมบาร์ สาขา A"
            autoFocus
          />
        </div>

        {/* Select members */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Users className="h-4 w-4" />
            เลือกสมาชิก ({selectedIds.size} คน)
          </label>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาพนักงาน..."
            className="mb-2"
          />
          <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
            {filteredUsers.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-gray-400">
                ไม่พบพนักงาน
              </p>
            )}
            {filteredUsers.map((su) => {
              const isSelected = selectedIds.has(su.id);
              const isOwner = su.role === 'owner';
              return (
                <button
                  key={su.id}
                  onClick={() => toggleUser(su.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                      isSelected
                        ? 'border-indigo-600 bg-indigo-600'
                        : 'border-gray-300 dark:border-gray-600',
                      isOwner && 'opacity-50'
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                      {su.display_name || su.username}
                      {isOwner && (
                        <span className="ml-1 text-xs text-amber-500">(เจ้าของ)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">@{su.username}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button onClick={handleCreate} disabled={creating || !name.trim()}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          สร้างห้อง
        </Button>
      </ModalFooter>
    </Modal>
  );
}
