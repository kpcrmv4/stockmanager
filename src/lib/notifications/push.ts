/**
 * Web Push Notification Service
 * Uses the web-push library to send PWA push notifications.
 * VAPID keys are stored in env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (email)
 */

import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: Record<string, unknown>;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  subscription: PushSubscriptionJSON;
  device_name: string | null;
  active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// VAPID configuration
// ---------------------------------------------------------------------------

function configureVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn(
      '[WebPush] VAPID keys not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT env vars.',
    );
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

// ---------------------------------------------------------------------------
// sendWebPush — Send a single Web Push notification
// ---------------------------------------------------------------------------

/**
 * Send a single Web Push notification to a specific subscription.
 *
 * @param subscription - The PushSubscription JSON object (endpoint, keys, etc.)
 * @param payload - The notification payload (title, body, icon, etc.)
 * @returns true on success, false on failure
 */
export async function sendWebPush(
  subscription: PushSubscriptionJSON,
  payload: PushPayload,
): Promise<boolean> {
  try {
    if (!configureVapid()) {
      return false;
    }

    if (!subscription.endpoint) {
      console.warn('[WebPush] Subscription has no endpoint, skipping');
      return false;
    }

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/badge-72x72.png',
      url: payload.url,
      data: payload.data,
    });

    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      pushPayload,
    );

    return true;
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode;

    // 410 Gone — subscription has expired or been unsubscribed
    if (statusCode === 410 || statusCode === 404) {
      console.log(
        '[WebPush] Subscription expired (410/404), removing from database',
      );
      await removeExpiredSubscription(subscription.endpoint!);
      return false;
    }

    console.error('[WebPush] Failed to send push notification:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// sendPushToUser — Send push to all active subscriptions for a user
// ---------------------------------------------------------------------------

/**
 * Send a push notification to all active subscriptions for a given user.
 *
 * @param userId - The user's ID
 * @param payload - The notification payload
 * @returns The count of successful sends
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<number> {
  try {
    const supabase = createServiceClient();

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true);

    if (error) {
      console.error('[WebPush] Failed to fetch subscriptions:', error.message);
      return 0;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return 0;
    }

    let successCount = 0;

    const results = await Promise.allSettled(
      (subscriptions as PushSubscriptionRow[]).map(async (sub) => {
        const success = await sendWebPush(sub.subscription, payload);
        if (success) successCount++;
        return success;
      }),
    );

    // Log failures for debugging
    const failures = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value),
    );
    if (failures.length > 0) {
      console.log(
        `[WebPush] ${failures.length}/${subscriptions.length} push(es) failed for user ${userId}`,
      );
    }

    return successCount;
  } catch (error) {
    console.error('[WebPush] sendPushToUser error:', error);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Remove an expired or unsubscribed push subscription from the database.
 */
async function removeExpiredSubscription(endpoint: string): Promise<void> {
  try {
    const supabase = createServiceClient();

    // Deactivate rather than delete, to keep audit trail
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ active: false })
      .filter('subscription->>endpoint', 'eq', endpoint);

    if (error) {
      console.error(
        '[WebPush] Failed to deactivate expired subscription:',
        error.message,
      );
    }
  } catch (error) {
    console.error('[WebPush] removeExpiredSubscription error:', error);
  }
}
