'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import {
  Camera,
  Loader2,
  UserPlus,
  UserMinus,
  Crown,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ChatMember } from '@/types/chat';

interface ChatRoomSettingsProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface StoreUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
}

export function ChatRoomSettings({ roomId, isOpen, onClose }: ChatRoomSettingsProps) {
  const { user } = useAuthStore();
  const { rooms, setRooms } = useChatStore();
  const room = rooms.find((r) => r.id === roomId);

  const [name, setName] = useState(room?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(room?.avatar_url || '');
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin =
    user?.role === 'owner' ||
    user?.role === 'manager' ||
    members.some((m) => m.user_id === user?.id && m.role === 'admin');

  // Load members
  useEffect(() => {
    if (!isOpen || !roomId) return;

    const supabase = createClient();

    supabase
      .from('chat_members')
      .select('id, room_id, user_id, role, muted, last_read_at, joined_at, profiles:user_id(id, username, display_name, avatar_url, role)')
      .eq('room_id', roomId)
      .then(({ data }) => {
        if (data) {
          setMembers(
            data.map((m) => ({
              ...m,
              muted: m.muted ?? false,
              profile: m.profiles as unknown as ChatMember['profile'],
            })) as ChatMember[]
          );
        }
      });

    // Load store users for adding
    if (room?.store_id) {
      supabase
        .from('user_stores')
        .select('user_id, profiles:user_id(id, username, display_name, avatar_url, role)')
        .eq('store_id', room.store_id)
        .then(({ data }) => {
          if (data) {
            setStoreUsers(
              data.map((d) => (d.profiles as unknown as StoreUser))
                .filter(Boolean)
            );
          }
        });
    }
  }, [isOpen, roomId, room?.store_id]);

  // Reset form when room changes
  useEffect(() => {
    if (room) {
      setName(room.name);
      setAvatarUrl(room.avatar_url || '');
    }
  }, [room]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'chat-rooms');

    try {
      const res = await fetch('/api/upload/photo', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) setAvatarUrl(url);
      }
    } catch {
      // ignore
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);

    const supabase = createClient();
    const updates: Record<string, unknown> = {};
    if (name !== room?.name) updates.name = name;
    if (avatarUrl !== (room?.avatar_url || '')) updates.avatar_url = avatarUrl || null;

    if (Object.keys(updates).length > 0) {
      await supabase.from('chat_rooms').update(updates).eq('id', roomId);

      // Update local state
      setRooms(
        rooms.map((r) =>
          r.id === roomId ? { ...r, ...updates } as typeof r : r
        )
      );
    }

    setSaving(false);
    onClose();
  };

  const handleAddMember = async (userId: string) => {
    if (!isAdmin) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('chat_members')
      .insert({ room_id: roomId, user_id: userId, role: 'member' })
      .select('id, room_id, user_id, role, muted, last_read_at, joined_at, profiles:user_id(id, username, display_name, avatar_url, role)')
      .single();

    if (data) {
      setMembers((prev) => [
        ...prev,
        {
          ...data,
          muted: data.muted ?? false,
          profile: data.profiles as unknown as ChatMember['profile'],
        } as ChatMember,
      ]);
    }
  };

  const handleRemoveMember = async (memberId: string, userId: string) => {
    if (!isAdmin) return;
    // Don't allow removing owner
    const memberProfile = members.find((m) => m.id === memberId)?.profile;
    if (memberProfile?.role === 'owner') return;

    const supabase = createClient();
    await supabase.from('chat_members').delete().eq('id', memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const nonMemberUsers = storeUsers.filter(
    (su) => !members.some((m) => m.user_id === su.id)
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ตั้งค่าห้องแชท" size="md">
      <div className="space-y-5">
        {/* Room avatar + name */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gray-100 ring-2 ring-gray-200 dark:bg-gray-700 dark:ring-gray-600">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Users className="h-7 w-7 text-gray-400" />
              )}
            </div>
            {isAdmin && (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              ชื่อห้อง
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
              placeholder="ชื่อห้องแชท"
            />
          </div>
        </div>

        {/* Members */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <Users className="h-4 w-4" />
            สมาชิก ({members.length})
          </h3>

          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
            {members.map((m) => {
              const profile = m.profile;
              const isOwnerRole = profile?.role === 'owner';
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                      {profile?.display_name || profile?.username}
                      {m.role === 'admin' && (
                        <Crown className="ml-1 inline h-3 w-3 text-amber-500" />
                      )}
                    </p>
                    <p className="text-xs text-gray-400">@{profile?.username}</p>
                  </div>
                  {isAdmin && !isOwnerRole && m.user_id !== user?.id && (
                    <button
                      onClick={() => handleRemoveMember(m.id, m.user_id)}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Add members */}
        {isAdmin && nonMemberUsers.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
              เพิ่มสมาชิก
            </h3>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
              {nonMemberUsers.map((su) => (
                <button
                  key={su.id}
                  onClick={() => handleAddMember(su.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                    {(su.display_name || su.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-700 dark:text-gray-300">
                      {su.display_name || su.username}
                    </p>
                  </div>
                  <UserPlus className="h-4 w-4 text-indigo-500" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            บันทึก
          </Button>
        </ModalFooter>
      )}
    </Modal>
  );
}
