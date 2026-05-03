'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { broadcastToChannel } from '@/lib/supabase/broadcast';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import type { ChatMessageReaction, ReactionSummary } from '@/types/chat';

/**
 * Quick-react palette — kept short on purpose.
 */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'] as const;

function summarize(rows: Pick<ChatMessageReaction, 'emoji' | 'user_id'>[]): ReactionSummary[] {
  const map = new Map<string, ReactionSummary>();
  for (const row of rows) {
    const existing = map.get(row.emoji);
    if (existing) {
      existing.count += 1;
      existing.users.push(row.user_id);
    } else {
      map.set(row.emoji, { emoji: row.emoji, count: 1, users: [row.user_id] });
    }
  }
  return Array.from(map.values());
}

/**
 * Loads reactions for the visible message list and keeps them attached to
 * each ChatMessage via store.updateMessage(). One bulk fetch per room load,
 * then realtime updates flow through the existing room broadcast channel
 * (event 'reaction_changed').
 */
export function useChatReactions(roomId: string | null) {
  const messages = useChatStore((s) => s.messages);
  const updateMessage = useChatStore((s) => s.updateMessage);

  useEffect(() => {
    if (!roomId || messages.length === 0) return;
    // Skip if we already have reaction data on every text/image message
    const ids = messages
      .filter((m) => (m.type === 'text' || m.type === 'image') && m.reactions === undefined)
      .map((m) => m.id);
    if (ids.length === 0) return;

    const supabase = createClient();
    let cancelled = false;

    supabase
      .from('chat_message_reactions')
      .select('message_id, emoji, user_id')
      .in('message_id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const grouped = new Map<string, { emoji: string; user_id: string }[]>();
        for (const row of data) {
          const arr = grouped.get(row.message_id) || [];
          arr.push({ emoji: row.emoji, user_id: row.user_id });
          grouped.set(row.message_id, arr);
        }
        for (const id of ids) {
          const msg = messages.find((m) => m.id === id);
          if (!msg) continue;
          const reactions = summarize(grouped.get(id) || []);
          updateMessage({ ...msg, reactions });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, messages, updateMessage]);
}

/**
 * Toggle a reaction on a single message — adds if missing, removes if mine.
 * Optimistically updates the store, then broadcasts a `reaction_changed`
 * event so other clients can refresh that one message.
 */
export function useToggleReaction() {
  const { user } = useAuthStore();
  const messages = useChatStore((s) => s.messages);
  const updateMessage = useChatStore((s) => s.updateMessage);

  return useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return;

      const supabase = createClient();
      const existing = msg.reactions?.find((r) => r.emoji === emoji);
      const mineAlready = existing?.users.includes(user.id);

      // Optimistic update
      const nextReactions: ReactionSummary[] = (() => {
        const list = msg.reactions ? msg.reactions.map((r) => ({ ...r, users: [...r.users] })) : [];
        const idx = list.findIndex((r) => r.emoji === emoji);
        if (mineAlready && idx >= 0) {
          list[idx].users = list[idx].users.filter((u) => u !== user.id);
          list[idx].count = list[idx].users.length;
          if (list[idx].count === 0) list.splice(idx, 1);
        } else if (idx >= 0) {
          list[idx].users.push(user.id);
          list[idx].count = list[idx].users.length;
        } else {
          list.push({ emoji, count: 1, users: [user.id] });
        }
        return list;
      })();
      updateMessage({ ...msg, reactions: nextReactions });

      // Persist
      if (mineAlready) {
        await supabase
          .from('chat_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('emoji', emoji);
      } else {
        await supabase
          .from('chat_message_reactions')
          .insert({ message_id: messageId, user_id: user.id, emoji });
      }

      // Broadcast so other room members can refetch
      broadcastToChannel(supabase, `chat:room:${msg.room_id}`, 'reaction_changed', {
        type: 'reaction_changed',
        message_id: messageId,
        reactions: nextReactions,
      } as unknown as Record<string, unknown>).catch(() => {});
    },
    [user, messages, updateMessage],
  );
}
