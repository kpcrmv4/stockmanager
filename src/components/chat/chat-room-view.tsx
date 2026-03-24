'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useChatRealtime } from '@/hooks/use-chat-realtime';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { ChatMessageBubble } from './chat-message-bubble';
import { ChatInput } from './chat-input';
import { ActionCardMessage } from './action-card-message';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ChatRoomViewProps {
  roomId: string;
}

export function ChatRoomView({ roomId }: ChatRoomViewProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { rooms, setActiveRoomId } = useChatStore();
  const { messages, hasMore, isLoadingMessages, loadMore } = useChatMessages(roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isInitialRef = useRef(true);

  // Set active room for badge
  useEffect(() => {
    setActiveRoomId(roomId);
    return () => setActiveRoomId(null);
  }, [roomId, setActiveRoomId]);

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
        // Restore scroll position after prepending
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  };

  const room = rooms.find((r) => r.id === roomId);
  const roomName = room?.name || 'แชท';

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => router.push('/chat')}
          className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">
            {roomName}
          </h2>
          {room?.pinned_summary && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              รอรับ {room.pinned_summary.pending_count} | กำลังทำ{' '}
              {room.pinned_summary.in_progress_count} | เสร็จวันนี้{' '}
              {room.pinned_summary.completed_today}
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-gray-50 px-3 py-4 dark:bg-gray-900"
      >
        {/* Loading indicator */}
        {isLoadingMessages && (
          <div className="mb-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {/* Messages list */}
        <div className="space-y-1">
          {messages.map((msg, i) => {
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showDate = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);
            const showSender =
              !prevMsg ||
              prevMsg.sender_id !== msg.sender_id ||
              showDate;

            return (
              <div key={msg.id}>
                {/* Date separator */}
                {showDate && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                  </div>
                )}

                {/* Message */}
                {msg.type === 'action_card' ? (
                  <ActionCardMessage message={msg} currentUserId={user?.id || ''} roomId={roomId} />
                ) : msg.type === 'system' ? (
                  <div className="my-2 flex justify-center">
                    <span className="max-w-[80%] rounded-lg bg-gray-100 px-3 py-1.5 text-center text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {msg.content}
                    </span>
                  </div>
                ) : (
                  <ChatMessageBubble
                    message={msg}
                    isOwn={msg.sender_id === user?.id}
                    showSender={showSender}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput roomId={roomId} />
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
