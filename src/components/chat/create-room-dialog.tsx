'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import { Loader2, Check, Users, User, MessageCircle, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ChatRoomType } from '@/types/chat';

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StoreUser {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  store_id?: string;
  store_name?: string;
}

interface StoreInfo {
  id: string;
  name: string;
}

type CreatableRoomType = 'dm' | 'direct' | 'cross_store';

// Role hierarchy: higher number = higher privilege
const ROLE_LEVEL: Record<string, number> = {
  staff: 1,
  bar: 2,
  accountant: 3,
  manager: 4,
  owner: 5,
  admin: 5,
};

const ROOM_TYPE_OPTIONS: { value: CreatableRoomType; label: string; description: string; icon: typeof MessageCircle; minRole: number }[] = [
  {
    value: 'dm',
    label: '1:1',
    description: 'แชทตัวต่อตัว',
    icon: User,
    minRole: 1, // ทุก role
  },
  {
    value: 'direct',
    label: 'กลุ่ม',
    description: 'สร้างกลุ่มแชทในสาขา',
    icon: MessageCircle,
    minRole: 2, // bar ขึ้นไป
  },
  {
    value: 'cross_store',
    label: 'ข้ามสาขา',
    description: 'แชทประสานงานระหว่างสาขา',
    icon: Building2,
    minRole: 5, // owner/admin เท่านั้น
  },
];

export function CreateRoomDialog({ isOpen, onClose }: CreateRoomDialogProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { rooms, setRooms } = useChatStore();

  const [roomType, setRoomType] = useState<CreatableRoomType>('dm');
  const [name, setName] = useState('');
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [allStoreUsers, setAllStoreUsers] = useState<StoreUser[]>([]);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dmSelectedId, setDmSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingCrossStore, setLoadingCrossStore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all');

  const userRoleLevel = ROLE_LEVEL[user?.role || ''] || 0;

  // Load store users for direct/dm chat
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
            .filter((u) => u.id !== user.id)
            .filter((u) => !u.username?.startsWith('printer'));
          setStoreUsers(users);
        }
      });
  }, [isOpen, user]);

  // Load all stores + users for cross_store chat
  useEffect(() => {
    if (!isOpen || !user || roomType !== 'cross_store') return;

    const supabase = createClient();

    const loadData = async () => {
      setLoadingCrossStore(true);
      const [{ data: storeData }, { data: userStoreData }] = await Promise.all([
        supabase.from('stores').select('id, name').order('name'),
        supabase
          .from('user_stores')
          .select('store_id, user_id, stores:store_id(name), profiles:user_id(id, username, display_name, role)')
          .order('store_id'),
      ]);

      if (storeData) {
        setStores(storeData);
      }

      if (userStoreData) {
        const users = userStoreData
          .map((d) => {
            const profile = d.profiles as unknown as StoreUser;
            const store = d.stores as unknown as { name: string } | null;
            if (!profile) return null;
            return {
              ...profile,
              store_id: d.store_id,
              store_name: store?.name || '',
            } as StoreUser;
          })
          .filter((u): u is StoreUser => u !== null && u.id !== user.id && !u.username?.startsWith('printer'));

        setAllStoreUsers(users);
      }
      setLoadingCrossStore(false);
    };

    loadData();
  }, [isOpen, user, roomType]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setRoomType('dm');
      setSelectedIds(new Set());
      setDmSelectedId(null);
      setSearchQuery('');
      setSelectedStoreFilter('all');
    }
  }, [isOpen]);

  // Reset selections when switching room type
  useEffect(() => {
    setSelectedIds(new Set());
    setDmSelectedId(null);
  }, [roomType]);

  const toggleUser = (userId: string) => {
    if (roomType === 'dm') {
      // DM: select only one person
      setDmSelectedId((prev) => (prev === userId ? null : userId));
      return;
    }

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
    if (!user) return;

    // Validate based on type
    if (roomType === 'dm') {
      if (!dmSelectedId) return;
    } else {
      if (!name.trim()) return;
    }

    setCreating(true);
    const supabase = createClient();

    // For DM: check if a 1:1 room already exists
    if (roomType === 'dm' && dmSelectedId) {
      const { data: existingMembers } = await supabase
        .from('chat_members')
        .select('room_id')
        .eq('user_id', user.id);

      if (existingMembers && existingMembers.length > 0) {
        const myRoomIds = existingMembers.map((m) => m.room_id);

        // Find rooms where the other user is also a member and room type is 'direct' with exactly 2 members
        const { data: otherMembers } = await supabase
          .from('chat_members')
          .select('room_id')
          .eq('user_id', dmSelectedId)
          .in('room_id', myRoomIds);

        if (otherMembers && otherMembers.length > 0) {
          const sharedRoomIds = otherMembers.map((m) => m.room_id);

          // Check if any of these shared rooms is a DM (type='direct' with exactly 2 members)
          for (const roomId of sharedRoomIds) {
            const { data: room } = await supabase
              .from('chat_rooms')
              .select('id, type')
              .eq('id', roomId)
              .eq('type', 'direct')
              .eq('is_active', true)
              .single();

            if (room) {
              const { count } = await supabase
                .from('chat_members')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', roomId);

              if (count === 2) {
                // Existing DM found — navigate to it
                setCreating(false);
                onClose();
                router.push(`/chat/${roomId}`);
                return;
              }
            }
          }
        }
      }
    }

    // Generate room name for DM
    const dmUser = roomType === 'dm' ? storeUsers.find((u) => u.id === dmSelectedId) : null;
    const roomName = roomType === 'dm'
      ? `${user.displayName || user.username}, ${dmUser?.display_name || dmUser?.username || ''}`
      : name.trim();

    const storeId = roomType === 'cross_store' ? null : (user.storeIds?.[0] || null);

    // 1. Create room
    const { data: newRoom, error } = await supabase
      .from('chat_rooms')
      .insert({
        store_id: storeId,
        name: roomName,
        type: (roomType === 'dm' ? 'direct' : roomType) as ChatRoomType,
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

    // 3. Add members
    if (roomType === 'dm' && dmSelectedId) {
      await supabase.from('chat_members').insert({
        room_id: newRoom.id,
        user_id: dmSelectedId,
        role: 'member',
      });
    } else if (selectedIds.size > 0) {
      const uniqueUserIds = new Set(selectedIds);
      const memberInserts = Array.from(uniqueUserIds).map((uid) => ({
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

  // Users to display based on room type
  const displayUsers = useMemo(() => {
    if (roomType === 'dm' || roomType === 'direct') {
      return storeUsers.filter(
        (u) =>
          !searchQuery ||
          u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // cross_store
    let users = allStoreUsers;
    if (selectedStoreFilter !== 'all') {
      users = users.filter((u) => u.store_id === selectedStoreFilter);
    }
    if (searchQuery) {
      users = users.filter(
        (u) =>
          u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return users;
  }, [roomType, storeUsers, allStoreUsers, searchQuery, selectedStoreFilter]);

  // Group cross_store users by store for display
  const groupedUsers = useMemo(() => {
    if (roomType !== 'cross_store') return null;

    const groups = new Map<string, { storeName: string; users: StoreUser[] }>();
    for (const u of displayUsers) {
      const key = u.store_id || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, { storeName: u.store_name || 'ไม่ระบุสาขา', users: [] });
      }
      groups.get(key)!.users.push(u);
    }
    return groups;
  }, [roomType, displayUsers]);

  const memberCount = roomType === 'dm' ? (dmSelectedId ? 1 : 0) : selectedIds.size;

  const canCreate = roomType === 'dm'
    ? !!dmSelectedId
    : !!name.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="สร้างห้องแชทใหม่" size="md">
      <div className="space-y-4">
        {/* Room type selector */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            ประเภทห้อง
          </label>
          <div className="grid grid-cols-3 gap-2">
            {ROOM_TYPE_OPTIONS.filter(
              (opt) => userRoleLevel >= opt.minRole
            ).map((opt) => {
              const Icon = opt.icon;
              const isActive = roomType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setRoomType(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-all',
                    isActive
                      ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5',
                      isActive
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-400'
                    )}
                  />
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isActive
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-400'
                    )}
                  >
                    {opt.label}
                  </span>
                  <span className="text-[11px] leading-tight text-gray-400 dark:text-gray-500">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Room name — hide for DM */}
        {roomType !== 'dm' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              ชื่อห้อง
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                roomType === 'cross_store'
                  ? 'เช่น ประสานงานสต๊อก ทุกสาขา'
                  : 'เช่น ทีมบาร์ สาขา A'
              }
              autoFocus
            />
          </div>
        )}

        {/* Store filter tabs for cross_store */}
        {roomType === 'cross_store' && stores.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              เลือกสาขา
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedStoreFilter('all')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  selectedStoreFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                )}
              >
                ทุกสาขา
              </button>
              {stores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStoreFilter(s.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    selectedStoreFilter === s.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Select members */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {roomType === 'dm' ? (
              <User className="h-4 w-4" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            {roomType === 'dm' ? 'เลือกคนที่ต้องการแชท' : `เลือกสมาชิก (${memberCount} คน)`}
          </label>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาพนักงาน..."
            className="mb-2"
            autoFocus={roomType === 'dm'}
          />
          <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
            {roomType === 'cross_store' && loadingCrossStore ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-400">กำลังโหลดพนักงาน...</span>
              </div>
            ) : displayUsers.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-400">
                ไม่พบพนักงาน
              </p>
            ) : null}

            {roomType === 'cross_store' && groupedUsers ? (
              // Grouped by store
              Array.from(groupedUsers.entries()).map(([storeId, group]) => (
                <div key={storeId}>
                  <div className="sticky top-0 z-10 bg-gray-50 px-3 py-1.5 dark:bg-gray-700/50">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      <Building2 className="mr-1 inline h-3 w-3" />
                      {group.storeName}
                    </span>
                  </div>
                  {group.users.map((su) => (
                    <UserRow
                      key={`${storeId}-${su.id}`}
                      user={su}
                      isSelected={selectedIds.has(su.id)}
                      isOwner={su.role === 'owner'}
                      canDeselect={true}
                      isDm={false}
                      onToggle={() => toggleUser(su.id)}
                    />
                  ))}
                </div>
              ))
            ) : (
              // Flat list for DM and direct
              displayUsers.map((su) => (
                <UserRow
                  key={su.id}
                  user={su}
                  isSelected={roomType === 'dm' ? dmSelectedId === su.id : selectedIds.has(su.id)}
                  isOwner={su.role === 'owner'}
                  canDeselect={true}
                  isDm={roomType === 'dm'}
                  onToggle={() => toggleUser(su.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button onClick={handleCreate} disabled={creating || !canCreate}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {roomType === 'dm' ? 'เริ่มแชท' : 'สร้างห้อง'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ==========================================
// UserRow component
// ==========================================

function UserRow({
  user,
  isSelected,
  isOwner,
  canDeselect,
  isDm,
  storeName,
  onToggle,
}: {
  user: StoreUser;
  isSelected: boolean;
  isOwner: boolean;
  canDeselect: boolean;
  isDm: boolean;
  storeName?: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
        isSelected
          ? 'bg-indigo-50 dark:bg-indigo-900/20'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
      )}
    >
      {isDm ? (
        // Radio button for DM
        <div
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            isSelected
              ? 'border-indigo-600 bg-indigo-600'
              : 'border-gray-300 dark:border-gray-600'
          )}
        >
          {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
        </div>
      ) : (
        // Checkbox for group
        <div
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
            isSelected
              ? 'border-indigo-600 bg-indigo-600'
              : 'border-gray-300 dark:border-gray-600',
            !canDeselect && isSelected && 'opacity-50'
          )}
        >
          {isSelected && <Check className="h-3 w-3 text-white" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
          {user.display_name || user.username}
          {isOwner && (
            <span className="ml-1 text-xs text-amber-500">(เจ้าของ)</span>
          )}
        </p>
        <p className="text-xs text-gray-400">
          @{user.username}
          {storeName && (
            <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              {storeName}
            </span>
          )}
        </p>
      </div>
    </button>
  );
}
