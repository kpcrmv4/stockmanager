'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { broadcastToChannel } from '@/lib/supabase/broadcast';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useChatRealtime } from '@/hooks/use-chat-realtime';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { ChatMessageBubble } from './chat-message-bubble';
import { ChatInput } from './chat-input';
import { PinnedMessagesBanner } from './pinned-messages-banner';
import { ChatRoomSettings } from './chat-room-settings';
import { TransactionBoard } from './transaction-board';
import { MyTasksBoard } from './my-tasks-board';
import { CompactActionCard } from './compact-action-card';
import { ArrowLeft, Loader2, Settings, Volume2, VolumeX, Pin, Reply, MessageSquare, ClipboardList, UserCircle, Users, ChevronLeft, CalendarDays } from 'lucide-react';
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
  const activeTab = useChatStore((s) => s.activeTab);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);
  const setPinnedMessages = useChatStore((s) => s.setPinnedMessages);
  const addPinnedMessage = useChatStore((s) => s.addPinnedMessage);
  const removePinnedMessage = useChatStore((s) => s.removePinnedMessage);
  const { messages, hasMore, isLoadingMessages, loadMore } = useChatMessages(roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isInitialRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const [showNewMessageToast, setShowNewMessageToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Chat date filter with localStorage persistence
  const [chatDateFilter, setChatDateFilter] = useState<'all' | 'today' | 'yesterday'>(() => {
    if (typeof window === 'undefined') return 'all';
    return (localStorage.getItem('chat-date-filter') as 'all' | 'today' | 'yesterday') || 'all';
  });

  useEffect(() => {
    localStorage.setItem('chat-date-filter', chatDateFilter);
  }, [chatDateFilter]);

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

  // Scroll to bottom on new messages (initial + own messages + near bottom)
  useEffect(() => {
    if (isInitialRef.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
      isInitialRef.current = false;
      return;
    }
    const last = messages[messages.length - 1];
    if (!last) return;

    // ถ้าเป็นข้อความตัวเอง หรือ อยู่ใกล้ล่างสุดอยู่แล้ว → เลื่อนลงอัตโนมัติ
    if (last.sender_id === user?.id || isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // เลื่อนขึ้นอยู่ → แสดง toast "มีข้อความใหม่"
      setShowNewMessageToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowNewMessageToast(false), 3000);
    }
  }, [messages, user?.id]);

  // Cleanup toast timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Scroll detection for loading older messages + near-bottom tracking
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    // Track ว่าอยู่ใกล้ล่างสุดหรือไม่ (ภายใน 150px)
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 150;

    // ถ้าเลื่อนลงมาล่างสุดแล้ว → ซ่อน toast
    if (isNearBottomRef.current && showNewMessageToast) {
      setShowNewMessageToast(false);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    }

    // Load older messages
    if (!hasMore || isLoadingMessages) return;
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

  // Scroll to bottom handler (for toast tap)
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowNewMessageToast(false);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

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
      broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_unpinned', {
        type: 'message_unpinned', message_id: messageId, room_id: roomId,
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
      broadcastToChannel(supabase, `chat:room:${roomId}`, 'message_pinned', {
        type: 'message_pinned', pinned_message: pinnedMsg, room_id: roomId,
      } as unknown as Record<string, unknown>);
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

      // Only trigger when clicking on the actual message bubble, not empty space
      const target = e.target as HTMLElement;
      if (!target.closest('[data-chat-bubble]')) return;

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

  // Count pending action cards for badge
  const pendingActionCount = useMemo(() => {
    return messages.filter((m) => {
      if (m.type !== 'action_card' || !m.metadata) return false;
      const meta = m.metadata as import('@/types/chat').ActionCardMetadata;
      return meta.status === 'pending' || meta.status === 'pending_bar';
    }).length;
  }, [messages]);

  // Filter messages by date for chat tab
  const filteredMessages = useMemo(() => {
    if (chatDateFilter === 'all') return messages;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    if (chatDateFilter === 'today') {
      return messages.filter((msg) => new Date(msg.created_at) >= todayStart);
    }
    return messages.filter((msg) => {
      const d = new Date(msg.created_at);
      return d >= yesterdayStart && d < todayStart;
    });
  }, [messages, chatDateFilter]);

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
      {/* Header — Modern frosted design */}
      <div className="relative border-b border-white/10 bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 dark:border-gray-700/60">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_50%)]" />

        <div className="relative flex items-center gap-2.5 px-2 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          {/* Back button */}
          <button
            onClick={() => router.push('/chat')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95 dark:bg-white/5 dark:hover:bg-white/10 sm:h-10 sm:w-10"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>

          {/* Room avatar */}
          <div className="relative shrink-0">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/15 shadow-sm ring-2 ring-white/20 backdrop-blur-sm dark:bg-white/10 dark:ring-white/10 sm:h-11 sm:w-11">
              {room?.avatar_url ? (
                <img src={room.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-base font-bold text-white sm:text-lg">
                  {roomName.charAt(0)}
                </span>
              )}
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-indigo-500 bg-emerald-400 dark:border-gray-800" />
          </div>

          {/* Room info */}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold leading-tight text-white sm:text-base">
              {roomName}
            </h2>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70 backdrop-blur-sm dark:bg-white/5 sm:text-[11px]">
                {room?.type === 'store' ? (
                  <><Users className="h-2.5 w-2.5" /> แชทสาขา</>
                ) : 'แชท'}
              </span>
            </div>
          </div>

          {/* Action buttons group */}
          <div className="flex items-center gap-0.5 rounded-xl bg-white/8 p-0.5 backdrop-blur-sm dark:bg-white/5 sm:gap-1 sm:p-1">
            <ChatNotificationToggle />
            <button
              onClick={handleToggleMute}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-all sm:h-9 sm:w-9',
                isMuted
                  ? 'bg-white/10 text-white/40'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
              title={isMuted ? 'เปิดเสียง' : 'ปิดเสียง'}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-all hover:bg-white/10 hover:text-white sm:h-9 sm:w-9"
              title="ตั้งค่า"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs — Pill / segment style */}
        <div className="relative px-2 pb-2 sm:px-4 sm:pb-3">
          <div className="flex gap-1 rounded-xl bg-white/10 p-1 backdrop-blur-sm dark:bg-white/5">
            {([
              { key: 'chat' as const, icon: MessageSquare, label: 'แชท' },
              { key: 'tasks' as const, icon: ClipboardList, label: 'รายการงาน', badge: pendingActionCount },
              { key: 'my-tasks' as const, icon: UserCircle, label: 'งานของฉัน' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all sm:py-2.5 sm:text-[13px]',
                  activeTab === tab.key
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-700 dark:text-indigo-300'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/80 dark:text-gray-400 dark:hover:text-gray-300'
                )}
              >
                <tab.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden min-[360px]:inline">{tab.label}</span>
                {tab.badge && tab.badge > 0 ? (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Task Board tab */}
      {activeTab === 'tasks' && (
        <TransactionBoard
          roomId={roomId}
          storeId={room?.store_id || null}
          currentUserId={user?.id || ''}
          currentUserName={user?.displayName || user?.username || 'พนักงาน'}
          currentUserRole={user?.role}
        />
      )}

      {/* My Tasks tab */}
      {activeTab === 'my-tasks' && (
        <MyTasksBoard
          roomId={roomId}
          storeId={room?.store_id || null}
          currentUserId={user?.id || ''}
          currentUserName={user?.displayName || user?.username || 'พนักงาน'}
          currentUserRole={user?.role}
        />
      )}

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <>
      {/* Pinned messages banner */}
      <PinnedMessagesBanner onScrollToMessage={handleScrollToMessage} />

      {/* Date filter bar */}
      <div className="flex items-center gap-1.5 border-b border-gray-200/80 bg-white/90 px-3 py-1.5 backdrop-blur-sm dark:border-gray-700/60 dark:bg-gray-800/90">
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
        {(['all', 'today', 'yesterday'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setChatDateFilter(f)}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all',
              chatDateFilter === f
                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-700'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            )}
          >
            {f === 'all' ? 'ทั้งหมด' : f === 'today' ? 'วันนี้' : 'เมื่อวาน'}
          </button>
        ))}
      </div>

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

        {/* Messages list — action cards shown as compact notifications */}
        <div className="space-y-2">
          {filteredMessages.length === 0 && chatDateFilter !== 'all' && !isLoadingMessages && (
            <div className="mt-12 text-center">
              <CalendarDays className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                ไม่มีข้อความ{chatDateFilter === 'today' ? 'วันนี้' : 'เมื่อวาน'}
              </p>
            </div>
          )}
          {filteredMessages.map((msg, i) => {
            const prevMsg = i > 0 ? filteredMessages[i - 1] : null;
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
              >
                {/* Date separator — LINE-like pill */}
                {showDate && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-black/10 px-4 py-1 text-[11px] font-medium text-gray-600 backdrop-blur-sm dark:bg-white/10 dark:text-gray-400">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                  </div>
                )}

                {/* Action cards → compact notification (tap to go to tasks tab) */}
                {msg.type === 'action_card' ? (
                  <CompactActionCard message={msg} />
                ) : (
                  <div
                    onClick={(e) => handleMessageTap(msg, e)}
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
                    <ChatMessageBubble
                      message={msg}
                      isOwn={msg.sender_id === user?.id}
                      showSender={showSender}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div ref={bottomRef} />

        {/* New message toast — LINE-like */}
        {showNewMessageToast && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-3 left-1/2 z-20 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 rounded-full bg-[#5B5FC7] px-4 py-2 text-xs font-medium text-white shadow-lg transition-all active:scale-95 dark:bg-[#7C6FD4]"
          >
            มีข้อความใหม่
          </button>
        )}
      </div>

      {/* Input */}
      <ChatInput roomId={roomId} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
      </>
      )}

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
