'use client';

import { cn } from '@/lib/utils/cn';
import { Bot as BotIcon, User as UserIcon } from 'lucide-react';
import type { ChatMessage, ReplyMetadata } from '@/types/chat';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showSender: boolean;
}

export function ChatMessageBubble({ message, isOwn, showSender }: ChatMessageBubbleProps) {
  const isBot = !message.sender_id;
  const senderName = message.sender?.display_name || message.sender?.username || 'Bot';
  const avatarUrl = (message.sender as { avatar_url?: string | null })?.avatar_url;
  const time = new Date(message.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isImage = message.type === 'image';

  // Check for reply metadata
  const meta = message.metadata as unknown as Record<string, unknown> | null;
  const replyMeta = meta && 'reply_to' in meta
    ? (meta as unknown as ReplyMetadata)
    : null;

  // --- Own message (right side) ---
  if (isOwn) {
    return (
      <div className="flex justify-end gap-1.5">
        {/* Time — left of bubble */}
        <div className="flex shrink-0 flex-col justify-end pb-0.5">
          <span className="text-[11px] leading-none text-gray-400 dark:text-gray-500">
            {time}
          </span>
        </div>

        {/* Bubble */}
        <div className="max-w-[75%]">
          {/* Reply preview */}
          {replyMeta && (
            <div className="mb-1 flex justify-end">
              <div className="rounded-lg border-l-2 border-indigo-300 bg-indigo-50/80 px-2.5 py-1.5 text-xs text-gray-500 dark:border-indigo-600 dark:bg-indigo-900/20 dark:text-gray-400">
                <p className="truncate">{replyMeta.reply_preview}</p>
              </div>
            </div>
          )}
          {isImage ? (
            <div className="overflow-hidden rounded-2xl rounded-br-sm">
              <img
                src={message.content || ''}
                alt="ส่งรูปภาพ"
                className="max-h-52 max-w-[240px] object-cover sm:max-h-64"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="rounded-2xl rounded-br-sm bg-[#5B5FC7] px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-sm">
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Other's message (left side, with avatar) ---
  return (
    <div className="flex gap-2">
      {/* Avatar */}
      <div className="shrink-0 self-start pt-0.5">
        {showSender ? (
          <div className="h-9 w-9 overflow-hidden rounded-full">
            {isBot ? (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500">
                <BotIcon className="h-5 w-5 text-white" />
              </div>
            ) : avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-200 dark:bg-gray-700">
                <UserIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </div>
            )}
          </div>
        ) : (
          // Spacer to align with avatar above
          <div className="h-9 w-9" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 max-w-[75%]">
        {/* Sender name */}
        {showSender && (
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            {isBot ? 'Bot' : senderName}
          </p>
        )}

        {/* Reply preview */}
        {replyMeta && (
          <div className="mb-1 rounded-lg border-l-2 border-gray-300 bg-gray-100/80 px-2.5 py-1.5 text-xs text-gray-500 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
            <p className="truncate">{replyMeta.reply_preview}</p>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          {/* Bubble */}
          {isImage ? (
            <div className="overflow-hidden rounded-2xl rounded-bl-sm">
              <img
                src={message.content || ''}
                alt="ส่งรูปภาพ"
                className="max-h-52 max-w-[240px] object-cover sm:max-h-64"
                loading="lazy"
              />
            </div>
          ) : (
            <div
              className={cn(
                'rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                isBot
                  ? 'bg-gradient-to-br from-amber-50 to-orange-50 text-amber-900 dark:from-amber-900/30 dark:to-orange-900/20 dark:text-amber-200'
                  : 'bg-white text-gray-800 dark:bg-gray-750 dark:text-gray-200'
              )}
            >
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          )}

          {/* Time — right of bubble */}
          <div className="shrink-0 pb-0.5">
            <span className="text-[11px] leading-none text-gray-400 dark:text-gray-500">
              {time}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

