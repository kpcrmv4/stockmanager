import { create } from 'zustand';
import type { ChatRoom, ChatMessage, ChatPinnedMessage, UnreadBadgePayload } from '@/types/chat';

interface ChatState {
  // ห้องแชท
  rooms: ChatRoom[];
  activeRoomId: string | null;

  // ข้อความ (เก็บเฉพาะห้องที่เปิดดู)
  messages: ChatMessage[];
  hasMore: boolean;
  isLoadingMessages: boolean;

  // unread counts (ทุกห้อง)
  unreadCounts: Record<string, number>;
  totalUnread: number;

  // pinned messages (ห้องที่เปิดดู)
  pinnedMessages: ChatPinnedMessage[];

  // mute state (ห้องที่เปิดดู)
  isMuted: boolean;

  // active tab (แชท vs รายการงาน vs งานของฉัน)
  activeTab: 'chat' | 'tasks' | 'my-tasks';

  // Bumped to force the chat view to scroll to the latest message regardless
  // of scroll position. Used by panels (e.g. albums) that post chat activity
  // on behalf of the current user — without this, those messages have
  // sender_id = null and would be treated as "from someone else".
  scrollToBottomNonce: number;

  // actions
  setRooms: (rooms: ChatRoom[]) => void;
  setActiveRoomId: (roomId: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  prependMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (message: ChatMessage) => void;
  setHasMore: (hasMore: boolean) => void;
  setIsLoadingMessages: (loading: boolean) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;
  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;
  /** Patch a room's last_message + re-sort using a synthetic message
   *  built from the badge broadcast payload. Lets the chat list page
   *  (/chat) reflect the latest preview/time/order in real time without
   *  re-fetching from DB. */
  applyBadgeToRoomList: (payload: UnreadBadgePayload) => void;
  setPinnedMessages: (msgs: ChatPinnedMessage[]) => void;
  addPinnedMessage: (msg: ChatPinnedMessage) => void;
  removePinnedMessage: (messageId: string) => void;
  setIsMuted: (muted: boolean) => void;
  setActiveTab: (tab: 'chat' | 'tasks' | 'my-tasks') => void;
  bumpScrollToBottom: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  rooms: [],
  activeRoomId: null,
  messages: [],
  hasMore: true,
  isLoadingMessages: false,
  unreadCounts: {},
  totalUnread: 0,
  pinnedMessages: [],
  isMuted: false,
  activeTab: 'chat',
  scrollToBottomNonce: 0,

  setRooms: (rooms) => set({ rooms }),

  setActiveRoomId: (activeRoomId) =>
    set({ activeRoomId, messages: [], hasMore: true, pinnedMessages: [], activeTab: 'chat' }),

  setMessages: (messages) => set({ messages }),

  prependMessages: (older) =>
    set((s) => ({ messages: [...older, ...s.messages] })),

  addMessage: (message) =>
    set((s) => ({
      messages: [...s.messages, message],
      // อัปเดต last_message ใน rooms
      rooms: s.rooms.map((r) =>
        r.id === message.room_id ? { ...r, last_message: message } : r
      ),
    })),

  updateMessage: (message) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === message.id ? message : m)),
    })),

  setHasMore: (hasMore) => set({ hasMore }),
  setIsLoadingMessages: (isLoadingMessages) => set({ isLoadingMessages }),

  setUnreadCounts: (unreadCounts) =>
    set({
      unreadCounts,
      totalUnread: Object.values(unreadCounts).reduce((a, b) => a + b, 0),
    }),

  incrementUnread: (roomId) =>
    set((s) => {
      const counts = { ...s.unreadCounts, [roomId]: (s.unreadCounts[roomId] || 0) + 1 };
      return { unreadCounts: counts, totalUnread: Object.values(counts).reduce((a, b) => a + b, 0) };
    }),

  clearUnread: (roomId) =>
    set((s) => {
      const counts = { ...s.unreadCounts, [roomId]: 0 };
      return { unreadCounts: counts, totalUnread: Object.values(counts).reduce((a, b) => a + b, 0) };
    }),

  applyBadgeToRoomList: (payload) =>
    set((s) => {
      const idx = s.rooms.findIndex((r) => r.id === payload.room_id);
      if (idx < 0) return s;
      const isBot = !payload.sender_id || payload.sender_id === 'bot';
      const synthetic: ChatMessage = {
        id: `badge-${payload.room_id}-${Date.now()}`,
        room_id: payload.room_id,
        sender_id: isBot ? null : payload.sender_id,
        type: payload.type,
        content: payload.preview,
        metadata: null,
        created_at: new Date().toISOString(),
        archived_at: null,
        sender: isBot
          ? null
          : {
              id: payload.sender_id,
              username: payload.sender_name,
              display_name: payload.sender_name,
              avatar_url: null,
              role: '',
            },
      };
      const next = [...s.rooms];
      next[idx] = { ...next[idx], last_message: synthetic };
      // Match useChatRooms sort: latest activity first.
      next.sort((a, b) => {
        const aTime = a.last_message?.created_at || a.created_at;
        const bTime = b.last_message?.created_at || b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
      return { rooms: next };
    }),

  setPinnedMessages: (pinnedMessages) => set({ pinnedMessages }),

  addPinnedMessage: (msg) =>
    set((s) => ({
      pinnedMessages: [...s.pinnedMessages, msg].sort(
        (a, b) => new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime()
      ),
    })),

  removePinnedMessage: (messageId) =>
    set((s) => ({
      pinnedMessages: s.pinnedMessages.filter((p) => p.message_id !== messageId),
    })),

  setIsMuted: (isMuted) => set({ isMuted }),
  setActiveTab: (activeTab) => set({ activeTab }),
  bumpScrollToBottom: () => set((s) => ({ scrollToBottomNonce: s.scrollToBottomNonce + 1 })),
}));
