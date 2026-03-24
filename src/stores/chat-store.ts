import { create } from 'zustand';
import type { ChatRoom, ChatMessage } from '@/types/chat';

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
}

export const useChatStore = create<ChatState>((set) => ({
  rooms: [],
  activeRoomId: null,
  messages: [],
  hasMore: true,
  isLoadingMessages: false,
  unreadCounts: {},
  totalUnread: 0,

  setRooms: (rooms) => set({ rooms }),

  setActiveRoomId: (activeRoomId) =>
    set({ activeRoomId, messages: [], hasMore: true }),

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
}));
