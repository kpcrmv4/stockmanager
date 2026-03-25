'use client';

import { useState } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { Pin, ChevronDown, ChevronUp } from 'lucide-react';

interface PinnedMessagesBannerProps {
  onScrollToMessage?: (messageId: string) => void;
}

export function PinnedMessagesBanner({ onScrollToMessage }: PinnedMessagesBannerProps) {
  const { pinnedMessages } = useChatStore();
  const [expanded, setExpanded] = useState(false);

  if (pinnedMessages.length === 0) return null;

  const latest = pinnedMessages[0];
  const hasMultiple = pinnedMessages.length > 1;

  const handleTap = (messageId: string) => {
    onScrollToMessage?.(messageId);
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-900/20">
      {/* Latest pinned */}
      <div className="flex items-center">
        <button
          onClick={() => latest.message_id && handleTap(latest.message_id)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left active:bg-amber-100/60 dark:active:bg-amber-900/30"
        >
          <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 flex-1 truncate text-xs text-amber-800 dark:text-amber-200">
            <span className="font-medium">
              {latest.message?.sender?.display_name || latest.message?.sender?.username || 'Bot'}:
            </span>{' '}
            {latest.message?.type === 'image'
              ? 'รูปภาพ'
              : latest.message?.content || 'ข้อความ'}
          </p>
        </button>
        {hasMultiple && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex shrink-0 items-center gap-1 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
          >
            {pinnedMessages.length}
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {/* Expanded list */}
      {expanded && (
        <div className="max-h-32 overflow-y-auto border-t border-amber-200/50 dark:border-amber-800/50">
          {pinnedMessages.slice(1).map((pm) => (
            <button
              key={pm.id}
              onClick={() => pm.message_id && handleTap(pm.message_id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left active:bg-amber-100/60 dark:active:bg-amber-900/30"
            >
              <Pin className="h-3 w-3 shrink-0 text-amber-500/60 dark:text-amber-500/40" />
              <p className="min-w-0 flex-1 truncate text-xs text-amber-700 dark:text-amber-300">
                <span className="font-medium">
                  {pm.message?.sender?.display_name || pm.message?.sender?.username || 'Bot'}:
                </span>{' '}
                {pm.message?.type === 'image'
                  ? 'รูปภาพ'
                  : pm.message?.content || 'ข้อความ'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
