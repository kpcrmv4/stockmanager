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
  metadata: ActionCardMetadata | TransferCardMetadata | ReplyMetadata | MentionMetadata | AlbumCardMetadata | null;
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
  reactions?: ReactionSummary[];
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  users: string[]; // user_ids
}

export interface ChatMessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
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
  action_type:
    | 'deposit_claim'
    | 'withdrawal_claim'
    | 'stock_explain'
    | 'stock_supplementary'  // POS items not yet manual-counted (after auto-activation)
    | 'stock_approve'        // owner reviews staff explanations
    | 'borrow_approve'
    | 'borrow_return_confirm' // lender confirms borrower's return (with receipt photo)
    | 'transfer_receive'
    | 'generic';
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
  // Deep-link target for "ดูรายละเอียด" button (relative app URL, e.g. /stock/explanation?date=2026-04-19)
  detail_url?: string | null;
  // Borrow-specific fields
  borrow_status?: 'pending_approval' | 'approved' | 'rejected' | 'cancelled';
  borrow_approved_by?: string | null;
  borrow_rejected_reason?: string | null;
  // Stock-approve-specific outcome
  approval_result?: 'approved' | 'rejected' | null;
  approval_reason?: string | null;
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

// system message that announces album activity in the chat feed
export interface AlbumCardMetadata {
  kind: 'album_created' | 'album_upload' | 'album_remove';
  album_id: string;
  album_name: string;
  cover_url?: string | null;
  // person who triggered this activity (uploader / remover / creator)
  actor_name?: string;
  /** @deprecated kept for backward compat with already-stored messages */
  uploaded_by_name?: string;
  photo_count?: number;
}

// ==========================================
// Albums (shared photo folders per chat room)
// ==========================================
export interface ChatAlbum {
  id: string;
  room_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
  // joined
  photo_count?: number;
  creator?: {
    id: string;
    display_name: string | null;
    username: string;
  } | null;
}

export interface ChatAlbumPhoto {
  id: string;
  album_id: string;
  url: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
  // joined
  uploader?: {
    id: string;
    display_name: string | null;
    username: string;
  } | null;
}

export interface PinnedSummary {
  pending_count: number;
  in_progress_count: number;
  completed_today: number;
  updated_at: string;
}

// Broadcast event payloads
export interface ChatBroadcastPayload {
  type:
    | 'new_message'
    | 'message_updated'
    | 'typing'
    | 'read'
    | 'message_pinned'
    | 'message_unpinned'
    | 'reaction_changed';
  message?: ChatMessage;
  user_id?: string;
  user_name?: string;
  room_id?: string;
  pinned_message?: ChatPinnedMessage;
  message_id?: string;
  reactions?: ReactionSummary[];
}

export interface UnreadBadgePayload {
  room_id: string;
  sender_id: string;
  sender_name: string;
  preview: string;
  type: ChatMessageType;
}
