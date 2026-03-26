'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils/cn';
import { Bot as BotIcon, User as UserIcon } from 'lucide-react';
import type { ChatMessage, ReplyMetadata } from '@/types/chat';
import { DailySummaryCard } from './daily-summary-card';
import type { DailySummaryData } from './daily-summary-card';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showSender: boolean;
}

/* LINE-style reply quote block */
function ReplyQuote({ replyMeta, variant }: { replyMeta: ReplyMetadata; variant: 'own' | 'other' | 'bot' }) {
  const senderName = replyMeta.reply_sender || 'ข้อความ';

  return (
    <div
      className={cn(
        'mb-1 rounded-md border-l-[3px] px-2.5 py-1.5',
        variant === 'own'
          ? 'border-indigo-300 bg-white/20'
          : variant === 'bot'
            ? 'border-amber-400 bg-amber-100/40 dark:border-amber-500 dark:bg-amber-900/20'
            : 'border-gray-400 bg-gray-100 dark:border-gray-500 dark:bg-gray-700/50',
      )}
    >
      <p
        className={cn(
          'text-[11px] font-semibold leading-tight',
          variant === 'own'
            ? 'text-indigo-100'
            : variant === 'bot'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-gray-600 dark:text-gray-300',
        )}
      >
        {senderName}
      </p>
      <p
        className={cn(
          'mt-0.5 truncate text-xs leading-snug',
          variant === 'own'
            ? 'text-indigo-100/80'
            : variant === 'bot'
              ? 'text-amber-800/70 dark:text-amber-200/70'
              : 'text-gray-500 dark:text-gray-400',
        )}
      >
        {replyMeta.reply_preview}
      </p>
    </div>
  );
}

export const ChatMessageBubble = memo(function ChatMessageBubble({ message, isOwn, showSender }: ChatMessageBubbleProps) {
  const isBot = !message.sender_id;
  const isSystem = message.type === 'system';
  const senderName = isSystem
    ? 'ข้อความจากระบบ'
    : message.sender?.display_name || message.sender?.username || 'Bot';
  const avatarUrl = (message.sender as { avatar_url?: string | null })?.avatar_url;
  const time = new Date(message.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isImage = message.type === 'image';

  // Check for daily summary card
  const dailySummary = isSystem && message.metadata
    ? (message.metadata as unknown as Record<string, unknown>)
    : null;
  if (dailySummary?.type === 'daily_summary') {
    return (
      <DailySummaryCard data={dailySummary as unknown as DailySummaryData} time={time} />
    );
  }

  // Check for reply metadata
  const meta = message.metadata as unknown as Record<string, unknown> | null;
  const replyMeta = meta && 'reply_to' in meta
    ? (meta as unknown as ReplyMetadata)
    : null;

  // --- System message (compact centered style) ---
  if (isSystem) {
    return (
      <div className="flex justify-center" data-chat-bubble>
        <div className="max-w-[85%] rounded-lg bg-black/[0.04] px-3 py-1.5 dark:bg-white/[0.06]">
          <p className="text-center text-xs leading-snug text-gray-600 dark:text-gray-400">
            {message.content}
          </p>
          <p className="mt-0.5 text-center text-[10px] leading-none text-gray-400 dark:text-gray-500">
            {time}
          </p>
        </div>
      </div>
    );
  }

  // --- Own message (right side) ---
  if (isOwn) {
    return (
      <div className="flex justify-end gap-1.5" data-chat-bubble>
        {/* Time — left of bubble */}
        <div className="flex shrink-0 flex-col justify-end pb-0.5">
          <span className="text-[11px] leading-none text-gray-400 dark:text-gray-500">
            {time}
          </span>
        </div>

        {/* Bubble */}
        <div className="max-w-[75%]">
          {isImage ? (
            <div className="overflow-hidden rounded-2xl rounded-br-sm">
              {replyMeta && (
                <div className="bg-[#5B5FC7] px-3 pt-2.5">
                  <ReplyQuote replyMeta={replyMeta} variant="own" />
                </div>
              )}
              <img
                src={message.content || ''}
                alt="ส่งรูปภาพ"
                className="max-h-52 max-w-[240px] object-cover sm:max-h-64"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="rounded-2xl rounded-br-sm bg-[#5B5FC7] px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-sm">
              {replyMeta && <ReplyQuote replyMeta={replyMeta} variant="own" />}
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Other's message (left side, with avatar) ---
  return (
    <div className="flex gap-2" data-chat-bubble>
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
            {senderName}
          </p>
        )}

        <div className="flex items-end gap-1.5">
          {/* Bubble */}
          {isImage ? (
            <div className="overflow-hidden rounded-2xl rounded-bl-sm">
              {replyMeta && (
                <div className={cn(
                  'px-3 pt-2.5',
                  isBot
                    ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20'
                    : 'bg-white dark:bg-gray-700',
                )}>
                  <ReplyQuote replyMeta={replyMeta} variant={isBot ? 'bot' : 'other'} />
                </div>
              )}
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
                  : 'bg-white text-gray-800 dark:bg-gray-700 dark:text-gray-200'
              )}
            >
              {replyMeta && <ReplyQuote replyMeta={replyMeta} variant={isBot ? 'bot' : 'other'} />}
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
});
