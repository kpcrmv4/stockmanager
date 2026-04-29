import type { UserRole } from '@/types/roles';

// Decides which "งาน" (action card / notification) a given role should
// see. Owner, manager, accountant, and HQ keep their existing wide
// visibility. Operational roles (staff, bar) are scoped down to the
// task types they actually act on — deposit and withdrawal — so the
// chat task tab + notification center stop drowning them in stock,
// borrow, and transfer items they have no role in.

// All known action_card metadata.action_type values.
type ActionCardType =
  | 'deposit_claim'
  | 'withdrawal_claim'
  | 'stock_explain'
  | 'stock_supplementary'
  | 'stock_approve'
  | 'borrow_approve'
  | 'borrow_return_confirm'
  | 'transfer_receive';

const DEPOSIT_OPS: ActionCardType[] = ['deposit_claim', 'withdrawal_claim'];

const ROLE_ACTION_TYPES: Partial<Record<UserRole, readonly ActionCardType[]>> = {
  staff: DEPOSIT_OPS,
  bar: DEPOSIT_OPS,
  // owner / manager / accountant / hq fall through to "see all"
  customer: [],
};

export function isActionTypeVisibleToRole(
  actionType: string | undefined | null,
  role: UserRole | undefined | null,
): boolean {
  if (!role) return true;
  const allow = ROLE_ACTION_TYPES[role];
  if (!allow) return true; // role not scoped → see all
  return allow.includes(actionType as ActionCardType);
}

// Notifications use a wider set of `type` strings than chat action
// cards (stock_alert, deposit_expiry, daily_summary, etc.). Group
// them by the user-facing capability they belong to so the role
// filter stays in sync with the chat-task one.
const DEPOSIT_NOTI_TYPES = [
  'new_deposit',
  'deposit_request',
  'deposit_received',
  'deposit_confirmed',
  'deposit_expired',
  'deposit_expiry',
];
const WITHDRAWAL_NOTI_TYPES = [
  'withdrawal_request',
  'withdrawal_completed',
  'withdrawal_rejected',
];
const STOCK_NOTI_TYPES = [
  'stock_alert',
  'approval_request',
  'approval_result',
  'explanation_submitted',
];
// Types that aren't operational and should reach everyone.
const COMMON_NOTI_TYPES = [
  'chat_message',
  'new_message',
  'broadcast',
  'daily_summary',
  'message_pinned',
  'message_updated',
  'system',
  'info',
  'warning',
  'success',
  'error',
];

const ROLE_NOTIFICATION_TYPES: Partial<Record<UserRole, readonly string[]>> = {
  staff: [...COMMON_NOTI_TYPES, ...DEPOSIT_NOTI_TYPES, ...WITHDRAWAL_NOTI_TYPES],
  bar:   [...COMMON_NOTI_TYPES, ...DEPOSIT_NOTI_TYPES, ...WITHDRAWAL_NOTI_TYPES],
  accountant: [...COMMON_NOTI_TYPES, ...STOCK_NOTI_TYPES],
  customer: [...COMMON_NOTI_TYPES, 'promotion'],
  // owner / manager / hq → see all
};

export function isNotificationTypeVisibleToRole(
  type: string | null | undefined,
  role: UserRole | undefined | null,
): boolean {
  if (!role) return true;
  const allow = ROLE_NOTIFICATION_TYPES[role];
  if (!allow) return true;
  if (!type) return true; // unknown / null type: keep visible (don't hide)
  return allow.includes(type);
}
