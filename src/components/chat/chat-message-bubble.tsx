'use client';

import { cn } from '@/lib/utils/cn';
import type { ChatMessage } from '@/types/chat';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showSender: boolean;
}

export function ChatMessageBubble({ message, isOwn, showSender }: ChatMessageBubbleProps) {
  const isBot = !message.sender_id;
  const senderName = message.sender?.display_name || message.sender?.username || 'Bot';
  const time = new Date(message.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[80%]', isOwn ? 'items-end' : 'items-start')}>
        {/* Sender name */}
        {showSender && !isOwn && (
          <p className="mb-0.5 ml-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
            {isBot ? 'Bot' : senderName}
          </p>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm leading-relaxed',
            isOwn
              ? 'rounded-br-md bg-indigo-600 text-white'
              : isBot
                ? 'rounded-bl-md bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-800'
                : 'rounded-bl-md bg-white text-gray-800 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700'
          )}
        >
          {message.type === 'image' ? (
            <img
              src={message.content || ''}
              alt="ส่งรูปภาพ"
              className="max-h-60 rounded-lg object-cover"
              loading="lazy"
            />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}

          {/* Time */}
          <p
            className={cn(
              'mt-1 text-right text-[9px]',
              isOwn
                ? 'text-indigo-200'
                : 'text-gray-400 dark:text-gray-500'
            )}
          >
            {time}
          </p>
        </div>
      </div>
    </div>
  );
}
