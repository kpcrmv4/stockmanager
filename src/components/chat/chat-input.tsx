'use client';

import { useState, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { sendChatMessage } from '@/hooks/use-chat-realtime';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ChatInputProps {
  roomId: string;
}

export function ChatInput({ roomId }: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuthStore();
  const { addMessage } = useChatStore();

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !user || sending) return;

    setSending(true);
    setText('');

    const msg = await sendChatMessage(roomId, user.id, content, {
      username: user.username,
      display_name: user.displayName || null,
      avatar_url: user.avatarUrl || null,
      role: user.role,
    });

    if (msg) {
      addMessage(msg);
    }

    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="พิมพ์ข้อความ..."
          rows={1}
          className={cn(
            'max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border-0 bg-gray-100 px-4 py-2.5 text-sm',
            'placeholder:text-gray-400',
            'focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500',
            'dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:bg-gray-600'
          )}
          style={{
            height: 'auto',
            minHeight: '40px',
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 96)}px`;
          }}
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all',
            text.trim()
              ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:scale-95'
              : 'bg-gray-100 text-gray-300 dark:bg-gray-700 dark:text-gray-600'
          )}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
