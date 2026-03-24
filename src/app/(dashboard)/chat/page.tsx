'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatRooms } from '@/hooks/use-chat-rooms';
import { useChatBadge } from '@/hooks/use-chat-realtime';
import { useChatStore } from '@/stores/chat-store';
import { EmptyState } from '@/components/ui';
import { CreateRoomDialog } from '@/components/chat/create-room-dialog';
import { MessageSquare, Users, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatThaiDate } from '@/lib/utils/format';

export default function ChatPage() {
  const router = useRouter();
  const { rooms } = useChatRooms();
  const { unreadCounts } = useChatStore();
  const [showCreate, setShowCreate] = useState(false);

  // Subscribe to badge channel
  useChatBadge();

  return (
    <div className="space-y-1">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          แชท
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          สร้างห้อง
        </button>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="ยังไม่มีห้องแชท"
          description="ห้องแชทจะถูกสร้างอัตโนมัติเมื่อมีสาขาในระบบ หรือกดสร้างห้องใหม่"
        />
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:divide-gray-700 dark:bg-gray-800 dark:ring-gray-700">
          {rooms.map((room) => {
            const unread = unreadCounts[room.id] || 0;
            const lastMsg = room.last_message;
            const preview = getMessagePreview(lastMsg);

            return (
              <button
                key={room.id}
                onClick={() => router.push(`/chat/${room.id}`)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                  'hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-700/50 dark:active:bg-gray-700',
                  unread > 0 && 'bg-indigo-50/50 dark:bg-indigo-900/10'
                )}
              >
                {/* Room icon */}
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full',
                    room.type === 'store'
                      ? 'bg-indigo-100 dark:bg-indigo-900/30'
                      : room.type === 'direct'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                        : 'bg-violet-100 dark:bg-violet-900/30'
                  )}
                >
                  {room.avatar_url ? (
                    <img src={room.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : room.type === 'direct' ? (
                    <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <MessageSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'truncate text-sm',
                        unread > 0
                          ? 'font-bold text-gray-900 dark:text-white'
                          : 'font-medium text-gray-700 dark:text-gray-200'
                      )}
                    >
                      {room.name}
                    </span>
                    {lastMsg && (
                      <span className="ml-2 shrink-0 text-xs text-gray-400 dark:text-gray-500">
                        {formatMessageTime(lastMsg.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p
                      className={cn(
                        'mt-0.5 truncate text-xs',
                        unread > 0
                          ? 'font-medium text-gray-700 dark:text-gray-300'
                          : 'text-gray-500 dark:text-gray-400'
                      )}
                    >
                      {preview}
                    </p>
                    <div className="ml-2 flex shrink-0 items-center gap-1">
                      {unread > 0 && (
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-bold text-white">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create room dialog */}
      <CreateRoomDialog isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

// ==========================================
// Helpers
// ==========================================

function getMessagePreview(msg: typeof undefined extends never ? never : ReturnType<typeof useChatRooms>['rooms'][number]['last_message']): string {
  if (!msg) return 'ยังไม่มีข้อความ';

  const senderName = msg.sender?.display_name || msg.sender?.username || 'Bot';
  const prefix = msg.sender_id ? `${senderName}: ` : '';

  switch (msg.type) {
    case 'text':
      return `${prefix}${msg.content || ''}`;
    case 'image':
      return `${prefix}ส่งรูปภาพ`;
    case 'action_card': {
      const meta = msg.metadata as Record<string, unknown> | null;
      const status = meta?.status as string;
      if (status === 'pending') return `${prefix}งานใหม่รอรับ`;
      if (status === 'claimed') return `${prefix}${meta?.claimed_by_name || 'มีคน'} รับงานแล้ว`;
      if (status === 'completed') return `${prefix}งานเสร็จแล้ว`;
      return `${prefix}Action Card`;
    }
    case 'system':
      return msg.content || 'ข้อความระบบ';
    default:
      return '';
  }
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return 'เมื่อกี้';
  if (minutes < 60) return `${minutes} นาที`;
  if (hours < 24) return `${hours} ชม.`;

  // ถ้ามากกว่า 1 วัน แสดงวันที่
  return formatThaiDate(dateStr);
}
