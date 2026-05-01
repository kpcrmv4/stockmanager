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

// Each action_type lists the roles that can actually *act* on the
// card (claim → confirm → complete). The chat task tab — and the
// pending-count badge that drives it — should only show cards whose
// actor list contains the current user's role. Owner is implicit on
// every list because owner can do everything.
const ACTION_TYPE_ACTORS: Record<ActionCardType, readonly UserRole[]> = {
  // Bar confirms a deposit into inventory; manager / owner can also.
  // Staff *creates* the card but never acts on it.
  deposit_claim:        ['bar', 'manager', 'owner'],
  withdrawal_claim:     ['bar', 'manager', 'owner'],
  // Stock flow: bar / manager count and explain, owner / accountant approve.
  stock_explain:        ['bar', 'manager', 'owner', 'accountant'],
  stock_supplementary:  ['bar', 'manager', 'owner'],
  stock_approve:        ['owner', 'accountant', 'manager'],
  // Borrow approval: manager / owner only.
  borrow_approve:       ['manager', 'owner'],
  // Lender confirms borrower's return.
  borrow_return_confirm:['bar', 'manager', 'owner'],
  // HQ receives transfers.
  transfer_receive:     ['hq', 'manager', 'owner'],
};

export function isActionTypeVisibleToRole(
  actionType: string | undefined | null,
  role: UserRole | undefined | null,
  status?: string | null,
  barStep?: boolean | null,
): boolean {
  if (!role) return true;
  // Owner sees everything regardless of the actor list.
  if (role === 'owner') return true;

  // Staff special-case for deposit_claim: customer-LIFF deposits stay
  // pending until staff "receives" them (fills product + qty + photo),
  // and that step belongs to staff. The lifecycle is:
  //   pending             → staff claims it
  //   claimed (staff)     → staff is filling the inline form
  //   (submit) → pending_bar           ← bar's task, hide from staff
  //   claimed + _bar_step → bar verifying ← still bar's task, hide
  //   completed           → done
  // The filter-chip call (status undefined) keeps "ฝากเหล้า" visible
  // so staff can narrow the list.
  if (role === 'staff' && actionType === 'deposit_claim') {
    if (status === undefined || status === null) return true;
    if (status === 'pending_bar') return false;
    // bar's claim of the pending_bar step shows up as status='claimed'
    // but with _bar_step=true on the metadata. We hide that branch
    // from staff too — they handed the work off, no longer their job.
    if (status === 'claimed' && barStep === true) return false;
    return true;
  }

  const actors = ACTION_TYPE_ACTORS[actionType as ActionCardType];
  // Unknown / generic types fall through to visible — don't accidentally
  // hide future action types we haven't classified yet.
  if (!actors) return true;
  return actors.includes(role);
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
