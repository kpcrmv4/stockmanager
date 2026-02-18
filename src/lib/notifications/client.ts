/**
 * Client-side notification helpers.
 *
 * These functions are fire-and-forget — they POST to /api/notifications/send
 * and do not block the UI. Errors are logged but never thrown.
 */

import type { NotificationType } from './service';

// Re-export the type so client pages don't need to import from service.ts (server-only)
export type { NotificationType };

interface NotifyUserClientParams {
  userId: string;
  storeId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  lineUserId?: string;
}

interface NotifyGroupClientParams {
  storeId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  excludeUserId?: string;
}

/**
 * Fire-and-forget: send a notification to a single user via all enabled channels.
 */
export function sendNotification(params: NotifyUserClientParams): void {
  fetch('/api/notifications/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'notifyUser', params }),
  }).catch((err) => console.error('[Notify Client] sendNotification failed:', err));
}

/**
 * Fire-and-forget: send a notification to all staff/bar in a store.
 */
export function notifyStaff(params: NotifyGroupClientParams): void {
  fetch('/api/notifications/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'notifyStoreStaff', params }),
  }).catch((err) => console.error('[Notify Client] notifyStaff failed:', err));
}

/**
 * Fire-and-forget: send a notification to all owners.
 */
export function notifyOwners(params: Omit<NotifyGroupClientParams, 'excludeUserId'>): void {
  fetch('/api/notifications/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'notifyStoreOwners', params }),
  }).catch((err) => console.error('[Notify Client] notifyOwners failed:', err));
}
