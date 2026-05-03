'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ChatMessage } from '@/types/chat';

interface ChatSearchPanelProps {
  roomId: string;
  onClose: () => void;
  onPick: (messageId: string) => void;
}

export function ChatSearchPanel({ roomId, onClose, onPick }: ChatSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch results when debounced query changes
  useEffect(() => {
    if (!debounced) return;
    const supabase = createClient();
    let cancelled = false;
    setLoading(true);

    supabase
      .from('chat_messages')
      .select(
        'id, room_id, sender_id, type, content, metadata, created_at, archived_at, profiles:sender_id(id, username, display_name, avatar_url, role)',
      )
      .eq('room_id', roomId)
      .is('archived_at', null)
      .in('type', ['text', 'system'])
      .ilike('content', `%${debounced}%`)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setResults(
            data.map((row) => ({
              id: row.id,
              room_id: row.room_id,
              sender_id: row.sender_id,
              type: row.type,
              content: row.content,
              metadata: row.metadata,
              created_at: row.created_at,
              archived_at: row.archived_at,
              sender: row.profiles as unknown as ChatMessage['sender'],
            })) as ChatMessage[],
          );
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced, roomId]);

  const showResults = debounced.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="safe-area-inset-top flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาข้อความในห้องนี้..."
            className="h-10 w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-4 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!showResults && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              พิมพ์เพื่อค้นหาในห้องแชท
            </p>
          </div>
        )}

        {showResults && loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {showResults && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              ไม่พบข้อความที่ตรงกับ &quot;{debounced}&quot;
            </p>
          </div>
        )}

        {showResults &&
          results.map((m) => (
            <ResultItem key={m.id} message={m} query={debounced} onPick={onPick} />
          ))}
      </div>
    </div>
  );
}

function ResultItem({
  message,
  query,
  onPick,
}: {
  message: ChatMessage;
  query: string;
  onPick: (messageId: string) => void;
}) {
  const sender = message.sender?.display_name || message.sender?.username || 'ระบบ';
  const time = new Date(message.created_at).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const content = message.content || '';
  const lower = content.toLowerCase();
  const idx = query ? lower.indexOf(query.toLowerCase()) : -1;
  const start = idx === -1 ? 0 : Math.max(0, idx - 20);
  const end = idx === -1 ? content.length : Math.min(content.length, idx + query.length + 40);
  const snippet = content.slice(start, end);

  return (
    <button
      type="button"
      onClick={() => onPick(message.id)}
      className={cn(
        'flex w-full flex-col gap-0.5 border-b border-gray-100 px-4 py-3 text-left transition-colors',
        'hover:bg-gray-50 active:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-800/60 dark:active:bg-gray-800',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-indigo-700 dark:text-indigo-300">
          {sender}
        </span>
        <span className="shrink-0 text-[11px] text-gray-400">{time}</span>
      </div>
      <p className="line-clamp-2 text-sm text-gray-700 dark:text-gray-300">
        {start > 0 && '...'}
        {highlightMatch(snippet, query)}
        {end < content.length && '...'}
      </p>
    </button>
  );
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-yellow-200 px-0.5 text-gray-900 dark:bg-yellow-700/60 dark:text-yellow-100">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
