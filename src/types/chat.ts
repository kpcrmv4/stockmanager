// ==========================================
// Chat System Types
// ==========================================

import type { TransferCardMetadata } from './transfer-chat';

export type ChatRoomType = 'store' | 'direct' | 'cross_store';
export type ChatMessageType = 'text' | 'image' | 'action_card' | 'system';
export type ChatMemberRole = 'member' | 'admin';
export type ActionCardStatus = 'pending' | 'pending_bar' | 'claimed' | 'completed' | 'expired';
export type ActionCardPriority = 'urgent' | 'normal' | 'low';

export interface ChatRoom {
  id: string;
  store_id: string | null;
  name: string;
  type: ChatRoomType;
  is_active: boolean;
  pinned_summary: PinnedSummary | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  unread_count?: number;
  last_message?: ChatMessage | null;
  members?: ChatMember[];
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string | null;
  type: ChatMessageType;
  content: string | null;
  metadata: ActionCardMetadata | TransferCardMetadata | ReplyMetadata | MentionMetadata | null;
  created_at: string;
  archived_at: string | null;
  // joined
  sender?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
}

export interface ChatMember {
  id: string;
  room_id: string;
  user_id: string;
  role: ChatMemberRole;
  muted: boolean;
  last_read_at: string;
  joined_at: string;
  // joined
  profile?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
  };
}

export interface ChatPinnedMessage {
  id: string;
  room_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
  // joined
  message?: ChatMessage;
}

export interface ActionCardMetadata {
  action_type: 'deposit_claim' | 'withdrawal_claim' | 'stock_explain' | 'borrow_approve' | 'transfer_receive' | 'generic';
  reference_id: string;
  reference_table: string;
  status: ActionCardStatus;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  released_by?: string | null;
  released_at?: string | null;
  completion_notes?: string | null;
  confirmation_photo_url?: string | null;
  timeout_minutes: number;
  priority: ActionCardPriority;
  // Borrow-specific fields
  borrow_status?: 'pending_approval' | 'approved' | 'rejected' | 'cancelled';
  borrow_approved_by?: string | null;
  borrow_rejected_reason?: string | null;
  summary: {
    customer?: string;
    items?: string;
    note?: string;
    [key: string]: unknown;
  };
}

export interface ReplyMetadata {
  reply_to: string;
  reply_preview: string;
  reply_sender?: string;
}

export interface MentionMetadata {
  mentions: Array<{
    user_id: string;
    username: string;
    display_name: string | null;
  }>;
}

export interface PinnedSummary {
  pending_count: number;
  in_progress_count: number;
  completed_today: number;
  updated_at: string;
}

// Broadcast event payloads
export interface ChatBroadcastPayload {
  type: 'new_message' | 'message_updated' | 'typing' | 'read' | 'message_pinned' | 'message_unpinned';
  message?: ChatMessage;
  user_id?: string;
  user_name?: string;
  room_id?: string;
  pinned_message?: ChatPinnedMessage;
  message_id?: string;
}

export interface UnreadBadgePayload {
  room_id: string;
  sender_id: string;
  sender_name: string;
  preview: string;
  type: ChatMessageType;
}
