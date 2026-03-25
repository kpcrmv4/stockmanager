'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useChatRealtime } from '@/hooks/use-chat-realtime';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { ChatMessageBubble } from './chat-message-bubble';
import { ChatInput } from './chat-input';
import { ActionCardMessage } from './action-card-message';
import { PinnedMessagesBanner } from './pinned-messages-banner';
import { ChatRoomSettings } from './chat-room-settings';
import { ArrowLeft, Loader2, Settings, Volume2, VolumeX, Pin, Reply } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ChatNotificationToggle } from './chat-notification-toggle';
import type { ChatPinnedMessage, ChatMessage, ChatRoom } from '@/types/chat';

interface ChatRoomViewProps {
  roomId: string;
}

export function ChatRoomView({ roomId }: ChatRoomViewProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);
  const setActiveRoomId = useChatStore((s) => s.setActiveRoomId);
  const isMuted = useChatStore((s) => s.isMuted);
  const setIsMuted = useChatStore((s) => s.setIsMuted);
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);
  const setPinnedMessages = useChatStore((s) => s.setPinnedMessages);
  const addPinnedMessage = useChatStore((s) => s.addPinnedMessage);
  const removePinnedMessage = useChatStore((s) => s.removePinnedMessage);
  const { messages, hasMore, isLoadingMessages, loadMore } = useChatMessages(roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isInitialRef = useRef(true);
  const [showSettings, setShowSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Set active room for badge
  useEffect(() => {
    setActiveRoomId(roomId);
    return () => setActiveRoomId(null);
  }, [roomId, setActiveRoomId]);

  // Load muted state
  useEffect(() => {
    if (!user || !roomId) return;
    const supabase = createClient();
    supabase
      .from('chat_members')
      .select('muted')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setIsMuted(data?.muted ?? false);
      });
  }, [roomId, user, setIsMuted]);

  // Load pinned messages
  useEffect(() => {
    if (!roomId) return;
    const supabase = createClient();
    supabase
      .from('chat_pinned_messages')
      .select(`
        id, room_id, message_id, pinned_by, pinned_at,
        chat_messages!message_id (
          id, room_id, sender_id, type, content, metadata, created_at, archived_at,
          profiles:sender_id(id, username, display_name, avatar_url, role)
        )
      `)
      .eq('room_id', roomId)
      .order('pinned_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const pinned: ChatPinnedMessage[] = data.map((row) => {
            const msgData = row.chat_messages as unknown as Record<string, unknown>;
            return {
              id: row.id,
              room_id: row.room_id,
              message_id: row.message_id,
              pinned_by: row.pinned_by,
              pinned_at: row.pinned_at,
              message: msgData
                ? {
                    id: msgData.id as string,
                    room_id: msgData.room_id as string,
                    sender_id: msgData.sender_id as string | null,
                    type: msgData.type as ChatMessage['type'],
                    content: msgData.content as string | null,
                    metadata: msgData.metadata as ChatMessage['metadata'],
                    created_at: msgData.created_at as string,
                    archived_at: msgData.archived_at as string | null,
                    sender: msgData.profiles as ChatMessage['sender'],
                  }
                : undefined,
            };
          });
          setPinnedMessages(pinned);
        }
      });
  }, [roomId, setPinnedMessages]);

  // Realtime
  useChatRealtime(roomId);

  // Scroll to bottom on new messages (initial + own messages)
  useEffect(() => {
    if (isInitialRef.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
      isInitialRef.current = false;
      return;
    }
    // Scroll to bottom if latest message is from self
    const last = messages[messages.length - 1];
    if (last && last.sender_id === user?.id) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, user?.id]);

  // Scroll detection for loading older messages
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !hasMore || isLoadingMessages) return;
    if (el.scrollTop < 100) {
      const prevHeight = el.scrollHeight;
      loadMore().then(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  };

  // Mute toggle
  const handleToggleMute = async () => {
    if (!user) return;
    const newVal = !isMuted;
    setIsMuted(newVal);
    const supabase = createClient();
    await supabase
      .from('chat_members')
      .update({ muted: newVal })
      .eq('room_id', roomId)
      .eq('user_id', user.id);
  };

  // Check if current user is admin
  const isAdmin =
    user?.role === 'owner' ||
    user?.role === 'manager';

  // Pin/unpin message
  const handlePinMessage = async (messageId: string) => {
    if (!user) return;
    const supabase = createClient();

    const isPinned = pinnedMessages.some((p) => p.message_id === messageId);

    if (isPinned) {
      // Unpin
      const { error } = await supabase
        .from('chat_pinned_messages')
        .delete()
        .eq('room_id', roomId)
        .eq('message_id', messageId);

      if (error) {
        console.error('[Pin] unpin failed:', error);
        setContextMenu(null);
        return;
      }

      removePinnedMessage(messageId);

      // Broadcast unpin
      supabase.channel(`chat:room:${roomId}`).send({
        type: 'broadcast',
        event: 'message_unpinned',
        payload: { type: 'message_unpinned', message_id: messageId, room_id: roomId },
      });
    } else {
      // Pin
      const msg = messages.find((m) => m.id === messageId);
      const { data, error } = await supabase
        .from('chat_pinned_messages')
        .insert({ room_id: roomId, message_id: messageId, pinned_by: user.id })
        .select('id, room_id, message_id, pinned_by, pinned_at')
        .single();

      if (error || !data) {
        console.error('[Pin] pin failed:', error);
        setContextMenu(null);
        return;
      }

      const pinnedMsg: ChatPinnedMessage = {
        ...data,
        message: msg,
      };
      addPinnedMessage(pinnedMsg);

      // Broadcast pin
      supabase.channel(`chat:room:${roomId}`).send({
        type: 'broadcast',
        event: 'message_pinned',
        payload: { type: 'message_pinned', pinned_message: pinnedMsg, room_id: roomId },
      });
    }

    setContextMenu(null);
  };

  // Handle reply to message
  const handleReplyTo = useCallback((message: ChatMessage) => {
    setReplyTo(message);
    setContextMenu(null);
  }, []);

  // Tap handler for messages — show context menu with quote/pin options
  const handleMessageTap = useCallback(
    (msg: ChatMessage, e: React.MouseEvent | React.TouchEvent) => {
      // Only show for other people's messages (non-own), or admin for any message
      const isOwnMessage = msg.sender_id === user?.id;
      if (isOwnMessage && !isAdmin) return;
      // Don't show for action_card messages
      if (msg.type === 'action_card') return;

      const clientX = 'clientX' in e ? e.clientX : e.changedTouches?.[0]?.clientX ?? 0;
      const clientY = 'clientY' in e ? e.clientY : e.changedTouches?.[0]?.clientY ?? 0;
      setContextMenu({ messageId: msg.id, x: clientX, y: clientY });
    },
    [user?.id, isAdmin]
  );

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: PointerEvent | MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    // Use pointerdown so it works on both desktop and mobile
    // without interfering with click handlers inside the menu
    document.addEventListener('pointerdown', handler);
    return () => {
      document.removeEventListener('pointerdown', handler);
    };
  }, [contextMenu]);

  const room = rooms.find((r) => r.id === roomId);
  const roomName = room?.name || 'แชท';

  // Fetch room data if not in store (e.g. app resumed from background)
  useEffect(() => {
    if (room || !roomId) return;
    const supabase = createClient();
    supabase
      .from('chat_rooms')
      .select('id, store_id, name, type, is_active, pinned_summary, avatar_url, created_by, created_at, updated_at')
      .eq('id', roomId)
      .single()
      .then(({ data }) => {
        if (data) {
          setRooms([...rooms, data as unknown as ChatRoom]);
        }
      });
  }, [roomId, !!room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if a message is pinned
  const isPinnedMessage = (messageId: string) =>
    pinnedMessages.some((p) => p.message_id === messageId);

  // Scroll to a specific message (used by pinned banner)
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(messageId);
      setTimeout(() => setHighlightId(null), 1500);
    }
  }, []);

  return (
    <div className="safe-area-inset-bottom flex h-full flex-col">
      {/* Header — LINE-like gradient */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#5B5FC7] to-[#7C6FD4] px-2 py-2 shadow-md dark:from-[#3B3F8C] dark:to-[#5B4FA6]">
        <button
          onClick={() => router.push('/chat')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 active:bg-white/20"
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>

        {/* Room avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20">
          {room?.avatar_url ? (
            <img src={room.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-white">
              {roomName.charAt(0)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-white">
            {roomName}
          </h2>
          {room?.pinned_summary ? (
            <p className="text-[11px] text-white/70">
              รอรับ {room.pinned_summary.pending_count} | กำลังทำ{' '}
              {room.pinned_summary.in_progress_count} | เสร็จวันนี้{' '}
              {room.pinned_summary.completed_today}
            </p>
          ) : (
            <p className="text-[11px] text-white/60">แชทห้องนี้</p>
          )}
        </div>

        {/* Push notification toggle */}
        <ChatNotificationToggle />

        {/* Mute toggle */}
        <button
          onClick={handleToggleMute}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            isMuted
              ? 'bg-white/10 text-white/50'
              : 'text-white/80 hover:bg-white/10'
          )}
          title={isMuted ? 'เปิดเสียง' : 'ปิดเสียง'}
        >
          {isMuted ? (
            <VolumeX className="h-4.5 w-4.5" />
          ) : (
            <Volume2 className="h-4.5 w-4.5" />
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10"
        >
          <Settings className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Pinned messages banner */}
      <PinnedMessagesBanner onScrollToMessage={handleScrollToMessage} />

      {/* Messages — LINE-like soft blue-gray background */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-[#F0EFF5] px-3 py-3 dark:bg-gray-900"
      >
        {/* Loading indicator */}
        {isLoadingMessages && (
          <div className="mb-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {/* Messages list */}
        <div className="space-y-2">
          {messages.map((msg, i) => {
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showDate = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);
            const showSender =
              !prevMsg ||
              prevMsg.sender_id !== msg.sender_id ||
              showDate;

            const pinned = isPinnedMessage(msg.id);

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                onClick={(e) => handleMessageTap(msg, e)}
              >
                {/* Date separator — LINE-like pill */}
                {showDate && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-black/10 px-4 py-1 text-[11px] font-medium text-gray-600 backdrop-blur-sm dark:bg-white/10 dark:text-gray-400">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                  </div>
                )}

                {/* Message */}
                <div
                  className={cn(
                    'relative rounded-lg transition-colors duration-700',
                    pinned && 'bg-amber-50/60 ring-1 ring-amber-200/50 dark:bg-amber-900/10 dark:ring-amber-800/30',
                    highlightId === msg.id && 'animate-pulse bg-indigo-100/80 ring-2 ring-indigo-300 dark:bg-indigo-900/30 dark:ring-indigo-600'
                  )}
                >
                  {pinned && (
                    <div className="absolute -top-1 right-2 z-10">
                      <Pin className="h-3 w-3 text-amber-500" />
                    </div>
                  )}
                  {msg.type === 'action_card' ? (
                    <ActionCardMessage
                      message={msg}
                      currentUserId={user?.id || ''}
                      currentUserName={user?.displayName || user?.username || 'พนักงาน'}
                      roomId={roomId}
                      storeId={room?.store_id || null}
                    />
                  ) : (
                    <ChatMessageBubble
                      message={msg}
                      isOwn={msg.sender_id === user?.id}
                      showSender={showSender}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput roomId={roomId} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />

      {/* Context menu for quote/pin */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 animate-in fade-in zoom-in-95 rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 100),
          }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Quote/Reply — for everyone */}
          <button
            onTouchEnd={(e) => {
              e.preventDefault();
              const msg = messages.find((m) => m.id === contextMenu.messageId);
              if (msg) handleReplyTo(msg);
            }}
            onClick={() => {
              const msg = messages.find((m) => m.id === contextMenu.messageId);
              if (msg) handleReplyTo(msg);
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Reply className="h-4 w-4 text-indigo-500" />
            <span className="text-gray-700 dark:text-gray-300">
              อ้างถึงข้อความ
            </span>
          </button>

          {/* Pin — for admin only */}
          {isAdmin && (
            <button
              onTouchEnd={(e) => {
                e.preventDefault();
                handlePinMessage(contextMenu.messageId);
              }}
              onClick={() => handlePinMessage(contextMenu.messageId)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Pin className="h-4 w-4 text-amber-500" />
              <span className="text-gray-700 dark:text-gray-300">
                {isPinnedMessage(contextMenu.messageId)
                  ? 'ยกเลิกปักหมุด'
                  : 'ปักหมุดข้อความ'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Room settings */}
      <ChatRoomSettings
        roomId={roomId}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

// ==========================================
// Helpers
// ==========================================

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return 'วันนี้';
  if (days === 1) return 'เมื่อวาน';

  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
