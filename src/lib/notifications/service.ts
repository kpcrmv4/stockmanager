/**
 * Central Notification Service
 *
 * Orchestrates notifications across 3 channels:
 *   1. In-app (always — insert into `notifications` table)
 *   2. PWA Web Push (if user opted in)
 *   3. LINE Push (if user opted in and LINE credentials available)
 *
 * Usage:
 *   import { notifyUser, notifyStoreStaff, notifyStoreOwners } from '@/lib/notifications/service';
 */

import { createServiceClient } from '@/lib/supabase/server';
import { sendPushToUser, type PushPayload } from '@/lib/notifications/push';
import { sendLinePush, pushMessage, type LineMessage } from '@/lib/line/messaging';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'deposit_confirmed'       // ฝากเหล้าสำเร็จ (bar ยืนยัน)
  | 'withdrawal_completed'    // เบิกเหล้าสำเร็จ
  | 'deposit_expiry'          // เหล้าใกล้หมดอายุ
  | 'promotion'               // โปรโมชั่น
  | 'stock_alert'             // แจ้งเตือนสต๊อก (comparison result, daily count)
  | 'approval_request'        // มีรายการรออนุมัติ (for owner)
  | 'explanation_submitted'   // staff ส่งคำชี้แจง (for owner)
  | 'approval_result'         // ผลอนุมัติ (for staff)
  | 'new_deposit'             // มีรายการฝากใหม่ (for bar)
  | 'withdrawal_request';     // มีคำขอเบิก (for bar)

export interface NotifyUserParams {
  userId: string;
  storeId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** If provided, also send LINE push to this LINE userId */
  lineUserId?: string;
  /** LINE message (Flex Message). If not provided, sends text message */
  lineMessage?: LineMessage[];
  /** Store's LINE token for sending */
  lineToken?: string;
}

interface NotifyGroupParams {
  storeId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  excludeUserId?: string;
}

interface NotificationPreferences {
  user_id: string;
  pwa_enabled: boolean;
  line_enabled: boolean;
  notify_deposit_confirmed: boolean;
  notify_withdrawal_completed: boolean;
  notify_expiry_warning: boolean;
  notify_promotions: boolean;
  notify_stock_alert: boolean;
  notify_approval_request: boolean;
}

interface StoreNotifSettings {
  customer_notify_expiry_enabled: boolean;
  customer_notify_expiry_days: number;
  customer_notify_withdrawal_enabled: boolean;
  customer_notify_deposit_enabled: boolean;
  customer_notify_promotion_enabled: boolean;
  customer_notify_channels: string[];
  line_notify_enabled: boolean;
}

interface UserStoreRow {
  user_id: string;
  profiles: {
    id: string;
    role: string;
    line_user_id?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Type-to-preference column mapping
// ---------------------------------------------------------------------------

const TYPE_TO_PREF: Record<NotificationType, keyof NotificationPreferences> = {
  deposit_confirmed: 'notify_deposit_confirmed',
  withdrawal_completed: 'notify_withdrawal_completed',
  deposit_expiry: 'notify_expiry_warning',
  promotion: 'notify_promotions',
  stock_alert: 'notify_stock_alert',
  approval_request: 'notify_approval_request',
  explanation_submitted: 'notify_approval_request',   // same pref for owner
  approval_result: 'notify_stock_alert',              // staff sees this under stock alerts
  new_deposit: 'notify_approval_request',             // bar approving
  withdrawal_request: 'notify_approval_request',      // bar approving
};

// Customer-facing notification types that respect store_settings toggles
const CUSTOMER_TYPE_TO_STORE_SETTING: Partial<
  Record<NotificationType, keyof StoreNotifSettings>
> = {
  deposit_confirmed: 'customer_notify_deposit_enabled',
  withdrawal_completed: 'customer_notify_withdrawal_enabled',
  deposit_expiry: 'customer_notify_expiry_enabled',
  promotion: 'customer_notify_promotion_enabled',
};

// ---------------------------------------------------------------------------
// notifyUser — Main function
// ---------------------------------------------------------------------------

/**
 * Send a notification to a single user across all enabled channels.
 *
 * 1. Always inserts into `notifications` table (in-app notification)
 * 2. Checks user's `notification_preferences` for opt-in
 * 3. If pwa_enabled, sends Web Push
 * 4. If line_enabled and lineUserId provided, sends LINE push
 */
export async function notifyUser(params: NotifyUserParams): Promise<void> {
  const {
    userId,
    storeId,
    type,
    title,
    body,
    data,
    lineUserId,
    lineMessage,
    lineToken,
  } = params;

  try {
    const supabase = createServiceClient();

    // ----- 1. Always insert in-app notification -----
    const { error: insertError } = await supabase.from('notifications').insert({
      user_id: userId,
      store_id: storeId,
      title,
      body,
      type,
      read: false,
      data: data || null,
    });

    if (insertError) {
      console.error(
        '[Notify] Failed to insert notification:',
        insertError.message,
      );
      // Continue — still try push channels
    }

    // ----- 2. Check user notification preferences -----
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    // If no preferences row exists, default to all enabled
    const prefColumn = TYPE_TO_PREF[type];
    const typeEnabled = prefs ? (prefs as NotificationPreferences)[prefColumn] !== false : true;

    if (!typeEnabled) {
      // User opted out of this notification type — skip push channels
      return;
    }

    const pwaEnabled = prefs ? (prefs as NotificationPreferences).pwa_enabled !== false : true;
    const lineEnabled = prefs ? (prefs as NotificationPreferences).line_enabled !== false : true;

    // ----- 3. PWA Web Push -----
    if (pwaEnabled) {
      try {
        const pushPayload: PushPayload = {
          title,
          body,
          url: data?.url as string | undefined,
          data,
        };
        await sendPushToUser(userId, pushPayload);
      } catch (error) {
        console.error('[Notify] PWA push failed:', error);
      }
    }

    // ----- 4. LINE Push -----
    if (lineEnabled && lineUserId) {
      try {
        const token = lineToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (token) {
          if (lineMessage && lineMessage.length > 0) {
            // Send structured Flex Message
            await pushMessage(lineUserId, lineMessage, { token });
          } else {
            // Send plain text message
            await sendLinePush(
              lineUserId,
              [{ type: 'text', text: `${title}\n\n${body}` }],
              token,
            );
          }
        }
      } catch (error) {
        console.error('[Notify] LINE push failed:', error);
      }
    }
  } catch (error) {
    console.error('[Notify] notifyUser error:', error);
  }
}

// ---------------------------------------------------------------------------
// notifyStoreStaff — Notify all staff/bar in a store
// ---------------------------------------------------------------------------

/**
 * Send a notification to all staff and bar members of a store.
 *
 * @param params.excludeUserId - Skip this user (e.g. the person who triggered the action)
 */
export async function notifyStoreStaff(params: NotifyGroupParams): Promise<void> {
  const { storeId, type, title, body, data, excludeUserId } = params;

  try {
    const supabase = createServiceClient();

    // Find all users in this store with staff or bar roles
    const { data: userStores, error } = await supabase
      .from('user_stores')
      .select('user_id, profiles!inner(id, role, line_user_id)')
      .eq('store_id', storeId)
      .in('profiles.role', ['staff', 'bar']);

    if (error) {
      console.error('[Notify] Failed to fetch store staff:', error.message);
      return;
    }

    if (!userStores || userStores.length === 0) {
      return;
    }

    const notifyPromises = (userStores as unknown as UserStoreRow[])
      .filter((us) => us.user_id !== excludeUserId)
      .map((us) =>
        notifyUser({
          userId: us.user_id,
          storeId,
          type,
          title,
          body,
          data,
          lineUserId: us.profiles.line_user_id || undefined,
        }),
      );

    await Promise.allSettled(notifyPromises);
  } catch (error) {
    console.error('[Notify] notifyStoreStaff error:', error);
  }
}

// ---------------------------------------------------------------------------
// notifyStoreOwners — Notify all owners of a store
// ---------------------------------------------------------------------------

/**
 * Send a notification to all owners of a store.
 */
export async function notifyStoreOwners(
  params: Omit<NotifyGroupParams, 'excludeUserId'>,
): Promise<void> {
  const { storeId, type, title, body, data } = params;

  try {
    const supabase = createServiceClient();

    // Find all users in this store with owner role
    const { data: userStores, error } = await supabase
      .from('user_stores')
      .select('user_id, profiles!inner(id, role, line_user_id)')
      .eq('store_id', storeId)
      .eq('profiles.role', 'owner');

    if (error) {
      console.error('[Notify] Failed to fetch store owners:', error.message);
      return;
    }

    if (!userStores || userStores.length === 0) {
      return;
    }

    const notifyPromises = (userStores as unknown as UserStoreRow[]).map((us) =>
      notifyUser({
        userId: us.user_id,
        storeId,
        type,
        title,
        body,
        data,
        lineUserId: us.profiles.line_user_id || undefined,
      }),
    );

    await Promise.allSettled(notifyPromises);
  } catch (error) {
    console.error('[Notify] notifyStoreOwners error:', error);
  }
}

// ---------------------------------------------------------------------------
// checkStoreNotifEnabled — Check store-level notification settings
// ---------------------------------------------------------------------------

/**
 * Check whether a notification type is enabled at the store level.
 *
 * - For customer-facing types (deposit_confirmed, withdrawal_completed, etc.),
 *   checks the `store_settings` table.
 * - For staff/internal types (stock_alert, approval_request, etc.),
 *   always returns enabled.
 *
 * @returns { enabled, channels } where channels is an array of 'pwa' | 'line'
 */
export async function checkStoreNotifEnabled(
  storeId: string,
  type: NotificationType,
): Promise<{ enabled: boolean; channels: string[] }> {
  try {
    // Staff/internal notification types are always enabled
    const storeSettingKey = CUSTOMER_TYPE_TO_STORE_SETTING[type];
    if (!storeSettingKey) {
      return { enabled: true, channels: ['pwa', 'line'] };
    }

    const supabase = createServiceClient();

    const { data: settings, error } = await supabase
      .from('store_settings')
      .select(
        'customer_notify_expiry_enabled, customer_notify_expiry_days, customer_notify_withdrawal_enabled, customer_notify_deposit_enabled, customer_notify_promotion_enabled, customer_notify_channels, line_notify_enabled',
      )
      .eq('store_id', storeId)
      .single();

    if (error || !settings) {
      // No settings found — default to disabled for safety
      console.warn(
        `[Notify] No store_settings for store ${storeId}, defaulting to disabled`,
      );
      return { enabled: false, channels: [] };
    }

    const storeSettings = settings as StoreNotifSettings;
    const enabled = storeSettings[storeSettingKey] === true;
    const channels = storeSettings.customer_notify_channels || ['pwa'];

    return { enabled, channels };
  } catch (error) {
    console.error('[Notify] checkStoreNotifEnabled error:', error);
    return { enabled: false, channels: [] };
  }
}
