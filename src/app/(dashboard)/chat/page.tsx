'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatRooms } from '@/hooks/use-chat-rooms';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState } from '@/components/ui';
import { CreateRoomDialog } from '@/components/chat/create-room-dialog';
import { BotSettingsDialog } from '@/components/chat/bot-settings-dialog';
import { MessageSquare, Users, Plus, Bot } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatThaiDate } from '@/lib/utils/format';
import { PushPrompt } from '@/components/notification/push-prompt';

export default function ChatPage() {
  const router = useRouter();
  const { rooms } = useChatRooms();
  const { unreadCounts } = useChatStore();
  const { user } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showBotSettings, setShowBotSettings] = useState(false);

  const isManagerOrOwner = user?.role === 'owner' || user?.role === 'manager';

  return (
    <div className="space-y-1">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          แชท
        </h1>
        <div className="flex items-center gap-2">
          {isManagerOrOwner && (
            <button
              onClick={() => setShowBotSettings(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
              title="ตั้งค่าบอท"
            >
              <Bot className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            สร้างห้อง
          </button>
        </div>
      </div>

      {/* Push notification prompt */}
      <PushPrompt className="mb-3" />

      {rooms.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="ยังไม่มีห้องแชท"
          description="ห้องแชทจะถูกสร้างอัตโนมัติเมื่อมีสาขาในระบบ หรือกดสร้างห้องใหม่"
        />
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm dark:divide-gray-700 dark:bg-gray-800">
          {rooms.map((room) => {
            const unread = unreadCounts[room.id] || 0;
            const lastMsg = room.last_message;
            const preview = getMessagePreview(lastMsg);

            return (
              <button
                key={room.id}
                onClick={() => router.push(`/chat/${room.id}`)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors',
                  'hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-700/50 dark:active:bg-gray-700',
                )}
              >
                {/* Room avatar — larger, LINE-like */}
                <div
                  className={cn(
                    'relative flex h-13 w-13 shrink-0 items-center justify-center overflow-hidden rounded-full',
                    room.type === 'store'
                      ? 'bg-gradient-to-br from-[#5B5FC7] to-[#7C6FD4]'
                      : room.type === 'direct'
                        ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                        : 'bg-gradient-to-br from-violet-400 to-purple-500'
                  )}
                >
                  {room.avatar_url ? (
                    <img src={room.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : room.type === 'direct' ? (
                    <Users className="h-6 w-6 text-white" />
                  ) : (
                    <span className="text-lg font-bold text-white">
                      {room.name.charAt(0)}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'truncate text-[15px]',
                        unread > 0
                          ? 'font-bold text-gray-900 dark:text-white'
                          : 'font-medium text-gray-700 dark:text-gray-200'
                      )}
                    >
                      {room.name}
                    </span>
                    {lastMsg && (
                      <span className={cn(
                        'ml-2 shrink-0 text-xs',
                        unread > 0 ? 'text-[#5B5FC7] font-medium dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'
                      )}>
                        {formatMessageTime(lastMsg.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p
                      className={cn(
                        'mt-0.5 truncate text-[13px]',
                        unread > 0
                          ? 'text-gray-600 dark:text-gray-300'
                          : 'text-gray-400 dark:text-gray-500'
                      )}
                    >
                      {preview}
                    </p>
                    {unread > 0 && (
                      <span className="ml-2 flex h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create room dialog */}
      <CreateRoomDialog isOpen={showCreate} onClose={() => setShowCreate(false)} />

      {/* Bot settings dialog */}
      {isManagerOrOwner && (
        <BotSettingsDialog isOpen={showBotSettings} onClose={() => setShowBotSettings(false)} />
      )}
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
      const actionType = meta?.action_type as string;
      const summary = meta?.summary as Record<string, unknown> | undefined;
      const typeLabel =
        actionType === 'deposit_claim' ? 'ฝากเหล้า'
        : actionType === 'withdrawal_claim' ? 'เบิกเหล้า'
        : actionType === 'stock_explain' ? 'สต๊อก'
        : actionType === 'borrow_approve' ? 'ยืมสินค้า'
        : actionType === 'transfer_receive' ? 'โอนสต๊อก'
        : 'งาน';
      const ref = meta?.reference_id ? `#${String(meta.reference_id).slice(-8)}` : '';
      const customer = summary?.customer ? ` · ${summary.customer}` : '';

      if (status === 'pending') return `${typeLabel} ${ref}${customer} · รอรับ`;
      if (status === 'pending_bar') return `${typeLabel} ${ref}${customer} · รอBarยืนยัน`;
      if (status === 'claimed') return `${typeLabel} ${ref} · ${meta?.claimed_by_name || 'มีคน'} กำลังทำ`;
      if (status === 'completed') {
        if (summary?.rejected) return `${typeLabel} ${ref} · ยกเลิกแล้ว`;
        return `${typeLabel} ${ref}${customer} · เสร็จ`;
      }
      return `${typeLabel} ${ref}${customer}`;
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
