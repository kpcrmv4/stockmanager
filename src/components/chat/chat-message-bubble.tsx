'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils/cn';
import { Bot as BotIcon, User as UserIcon, FolderOpen, ImagePlus, ImageMinus } from 'lucide-react';
import type { ChatMessage, ReplyMetadata, ReactionSummary, AlbumCardMetadata } from '@/types/chat';
import { DailySummaryCard } from './daily-summary-card';
import type { DailySummaryData } from './daily-summary-card';
import { useAuthStore } from '@/stores/auth-store';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showSender: boolean;
  onImageClick?: (messageId: string) => void;
  onReplyTap?: (replyToId: string) => void;
  onReactionClick?: (messageId: string, emoji: string) => void;
  onAlbumOpen?: (albumId: string) => void;
}

/* LINE-style reply quote block — tappable, jumps to original */
function ReplyQuote({
  replyMeta,
  variant,
  onTap,
}: {
  replyMeta: ReplyMetadata;
  variant: 'own' | 'other' | 'bot';
  onTap?: () => void;
}) {
  const senderName = replyMeta.reply_sender || 'ข้อความ';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTap?.();
      }}
      className={cn(
        'mb-1 block w-full rounded-md border-l-[3px] px-2.5 py-1.5 text-left transition-opacity active:opacity-70',
        variant === 'own'
          ? 'border-white/70 bg-white/15 hover:bg-white/25'
          : variant === 'bot'
            ? 'border-amber-400 bg-amber-100/40 dark:border-amber-500 dark:bg-amber-900/20'
            : 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-gray-700/50',
      )}
    >
      <p
        className={cn(
          'text-[11px] font-semibold leading-tight',
          variant === 'own'
            ? 'text-white/90'
            : variant === 'bot'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-indigo-700 dark:text-indigo-300',
        )}
      >
        {senderName}
      </p>
      <p
        className={cn(
          'mt-0.5 truncate text-xs leading-snug',
          variant === 'own'
            ? 'text-white/80'
            : variant === 'bot'
              ? 'text-amber-800/70 dark:text-amber-200/70'
              : 'text-gray-600 dark:text-gray-400',
        )}
      >
        {replyMeta.reply_preview}
      </p>
    </button>
  );
}

/* Reaction pills row */
function ReactionRow({
  reactions,
  isOwn,
  onClick,
}: {
  reactions: ReactionSummary[];
  isOwn: boolean;
  onClick?: (emoji: string) => void;
}) {
  const { user } = useAuthStore();
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className={cn('mt-1 flex flex-wrap gap-1', isOwn ? 'justify-end' : 'justify-start')}>
      {reactions.map((r) => {
        const mine = user ? r.users.includes(user.id) : false;
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick?.(r.emoji);
            }}
            className={cn(
              'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-all active:scale-95',
              mine
                ? 'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/40 dark:text-indigo-200'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            <span className="text-[13px] leading-none">{r.emoji}</span>
            <span className="font-semibold">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Album-activity card (system message with metadata.kind = album_*) */
function AlbumCard({
  meta,
  time,
  onOpen,
}: {
  meta: AlbumCardMetadata;
  time: string;
  onOpen?: () => void;
}) {
  const actor = meta.actor_name || meta.uploaded_by_name || 'มีคน';
  const count = meta.photo_count ?? 1;
  const Icon =
    meta.kind === 'album_upload'
      ? ImagePlus
      : meta.kind === 'album_remove'
        ? ImageMinus
        : FolderOpen;
  const title =
    meta.kind === 'album_upload'
      ? `${actor} เพิ่ม ${count} รูปในอัลบั้ม`
      : meta.kind === 'album_remove'
        ? `${actor} ลบ ${count} รูปจากอัลบั้ม`
        : `อัลบั้มใหม่ — ${meta.album_name}`;

  return (
    <div className="flex justify-center" data-chat-bubble>
      <button
        type="button"
        onClick={onOpen}
        className="flex max-w-[85%] items-center gap-3 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 px-3 py-2 text-left shadow-sm transition-all active:scale-[0.98] dark:border-indigo-800/60 dark:from-indigo-900/30 dark:to-violet-900/20"
      >
        {meta.cover_url ? (
          <img
            src={meta.cover_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-indigo-200 dark:ring-indigo-700"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-200/60 dark:bg-indigo-900/40">
            <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            {title}
          </p>
          <p className="truncate text-[11px] text-indigo-600/70 dark:text-indigo-400/70">
            {meta.album_name} · แตะเพื่อเปิดอัลบั้ม
          </p>
          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{time}</p>
        </div>
      </button>
    </div>
  );
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  isOwn,
  showSender,
  onImageClick,
  onReplyTap,
  onReactionClick,
  onAlbumOpen,
}: ChatMessageBubbleProps) {
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

  // Daily summary card
  const meta = message.metadata as unknown as Record<string, unknown> | null;
  if (isSystem && meta?.type === 'daily_summary') {
    return <DailySummaryCard data={meta as unknown as DailySummaryData} time={time} />;
  }

  // Album-activity card
  if (
    isSystem &&
    meta &&
    typeof meta.kind === 'string' &&
    (meta.kind === 'album_upload' ||
      meta.kind === 'album_created' ||
      meta.kind === 'album_remove')
  ) {
    const albumMeta = meta as unknown as AlbumCardMetadata;
    return (
      <AlbumCard
        meta={albumMeta}
        time={time}
        onOpen={() => onAlbumOpen?.(albumMeta.album_id)}
      />
    );
  }

  // Reply metadata
  const replyMeta =
    meta && 'reply_to' in meta ? (meta as unknown as ReplyMetadata) : null;

  const reactions = message.reactions || [];

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
      <div className="flex flex-col items-end gap-0.5" data-chat-bubble>
        <div className="flex w-full justify-end gap-1.5">
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
                    <ReplyQuote
                      replyMeta={replyMeta}
                      variant="own"
                      onTap={() => onReplyTap?.(replyMeta.reply_to)}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageClick?.(message.id);
                  }}
                  className="block"
                >
                  <img
                    src={message.content || ''}
                    alt="ส่งรูปภาพ"
                    className="max-h-52 max-w-[240px] cursor-zoom-in object-cover sm:max-h-64"
                    loading="lazy"
                  />
                </button>
              </div>
            ) : (
              <div className="rounded-2xl rounded-br-sm bg-[#5B5FC7] px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-sm ring-1 ring-[#4A4EB5]/20">
                {replyMeta && (
                  <ReplyQuote
                    replyMeta={replyMeta}
                    variant="own"
                    onTap={() => onReplyTap?.(replyMeta.reply_to)}
                  />
                )}
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            )}
          </div>
        </div>
        <ReactionRow
          reactions={reactions}
          isOwn
          onClick={(emoji) => onReactionClick?.(message.id, emoji)}
        />
      </div>
    );
  }

  // --- Other's message (left side, with avatar) ---
  return (
    <div className="flex gap-2" data-chat-bubble>
      {/* Avatar */}
      <div className="shrink-0 self-start pt-0.5">
        {showSender ? (
          <div className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-gray-200 dark:ring-gray-700">
            {isBot ? (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500">
                <BotIcon className="h-5 w-5 text-white" />
              </div>
            ) : avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-500">
                <UserIcon className="h-5 w-5 text-white" />
              </div>
            )}
          </div>
        ) : (
          <div className="h-9 w-9" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 max-w-[75%]">
        {showSender && (
          <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {senderName}
          </p>
        )}

        <div className="flex items-end gap-1.5">
          {/* Bubble */}
          {isImage ? (
            <div className="overflow-hidden rounded-2xl rounded-bl-sm ring-1 ring-gray-200 dark:ring-gray-700">
              {replyMeta && (
                <div
                  className={cn(
                    'px-3 pt-2.5',
                    isBot
                      ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20'
                      : 'bg-white dark:bg-gray-800',
                  )}
                >
                  <ReplyQuote
                    replyMeta={replyMeta}
                    variant={isBot ? 'bot' : 'other'}
                    onTap={() => onReplyTap?.(replyMeta.reply_to)}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onImageClick?.(message.id);
                }}
                className="block"
              >
                <img
                  src={message.content || ''}
                  alt="ส่งรูปภาพ"
                  className="max-h-52 max-w-[240px] cursor-zoom-in object-cover sm:max-h-64"
                  loading="lazy"
                />
              </button>
            </div>
          ) : (
            <div
              className={cn(
                'rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                isBot
                  ? 'bg-gradient-to-br from-amber-50 to-orange-50 text-amber-900 ring-1 ring-amber-200 dark:from-amber-900/30 dark:to-orange-900/20 dark:text-amber-200 dark:ring-amber-800/50'
                  : 'bg-white text-gray-800 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700',
              )}
            >
              {replyMeta && (
                <ReplyQuote
                  replyMeta={replyMeta}
                  variant={isBot ? 'bot' : 'other'}
                  onTap={() => onReplyTap?.(replyMeta.reply_to)}
                />
              )}
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

        <ReactionRow
          reactions={reactions}
          isOwn={false}
          onClick={(emoji) => onReactionClick?.(message.id, emoji)}
        />
      </div>
    </div>
  );
});
