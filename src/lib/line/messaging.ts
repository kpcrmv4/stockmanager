/**
 * LINE Messaging API Service
 *
 * Token Resolution (priority):
 *   1. Explicit `token` parameter -> use that token (per-branch)
 *   2. No token -> use env LINE_CHANNEL_ACCESS_TOKEN (central token)
 *
 * Push notifications:
 *   - Pass store.line_token if available -> use branch bot
 *   - If store has no line_token -> falls back to central bot automatically
 *   - Webhook reply -> must use the token from the bot that received the webhook
 */

import { createServiceClient } from '@/lib/supabase/server';
import {
  depositConfirmedFlex,
  withdrawalCompletedFlex,
  depositExpiryWarningFlex,
  newDepositNotifyFlex,
  withdrawalRequestNotifyFlex,
  stockComparisonFlex,
  dailyReminderTemplate,
} from '@/lib/line/flex-templates';

const LINE_API_URL = 'https://api.line.me/v2/bot/message';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LineMessage {
  type: string;
  text?: string;
  altText?: string;
  contents?: Record<string, unknown>;
}

interface LineSendOptions {
  /** Per-branch LINE OA token (falls back to central token from env if omitted) */
  token?: string;
}

interface StoreLineConfig {
  line_token: string | null;
  line_channel_id: string | null;
  line_channel_secret: string | null;
  stock_notify_group_id: string | null;
  deposit_notify_group_id: string | null;
  bar_notify_group_id: string | null;
}

interface StoreSettings {
  line_notify_enabled: boolean;
}

// ---------------------------------------------------------------------------
// Core: Push & Reply
// ---------------------------------------------------------------------------

/**
 * Push message to a userId or groupId.
 */
export async function pushMessage(
  to: string,
  messages: LineMessage[],
  options?: LineSendOptions,
) {
  const token = resolveToken(options?.token);
  if (!token) {
    console.warn('[LINE] No token available, skipping push');
    return;
  }

  const response = await fetch(`${LINE_API_URL}/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE push error: ${error}`);
  }
}

/**
 * Reply message using a replyToken (must use the token of the bot that received the webhook).
 */
export async function replyMessage(
  replyToken: string,
  messages: LineMessage[],
  token: string,
) {
  const response = await fetch(`${LINE_API_URL}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE reply error: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Low-level push helpers
// ---------------------------------------------------------------------------

/**
 * Send push message to an individual LINE user.
 */
export async function sendLinePush(
  lineUserId: string,
  messages: LineMessage[],
  channelToken: string,
): Promise<boolean> {
  try {
    await pushMessage(lineUserId, messages, { token: channelToken });
    return true;
  } catch (error) {
    console.error('[LINE] sendLinePush failed:', error);
    return false;
  }
}

/**
 * Send push message to a LINE group.
 */
export async function sendLineGroupPush(
  groupId: string,
  messages: LineMessage[],
  channelToken: string,
): Promise<boolean> {
  try {
    await pushMessage(groupId, messages, { token: channelToken });
    return true;
  } catch (error) {
    console.error('[LINE] sendLineGroupPush failed:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Alias helpers (kept for backward compatibility)
// ---------------------------------------------------------------------------

export async function pushToStaffGroup(
  staffGroupId: string,
  messages: LineMessage[],
  storeToken: string,
) {
  return pushMessage(staffGroupId, messages, { token: storeToken });
}

export async function pushToBarGroup(
  barGroupId: string,
  messages: LineMessage[],
  storeToken: string,
) {
  return pushMessage(barGroupId, messages, { token: storeToken });
}

export async function pushToCustomer(
  lineUserId: string,
  messages: LineMessage[],
  storeToken: string,
) {
  return pushMessage(lineUserId, messages, { token: storeToken });
}

export async function pushViaCentralBot(
  to: string,
  messages: LineMessage[],
  centralToken?: string,
) {
  const token = centralToken || process.env.LINE_CENTRAL_TOKEN;
  return pushMessage(to, messages, { token: token || undefined });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getLineProfile(userId: string, token?: string) {
  const resolved = resolveToken(token);
  if (!resolved) return null;

  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${userId}`,
    { headers: { Authorization: `Bearer ${resolved}` } },
  );

  if (!response.ok) return null;
  return response.json() as Promise<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
    statusMessage?: string;
  }>;
}

// ---------------------------------------------------------------------------
// LIFF / Token Verification
// ---------------------------------------------------------------------------

export async function verifyLineAccessToken(accessToken: string) {
  const response = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`,
  );

  if (!response.ok) return null;
  return response.json() as Promise<{
    scope: string;
    client_id: string;
    expires_in: number;
  }>;
}

export async function getLineProfileFromToken(accessToken: string) {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;
  return response.json() as Promise<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Flex Message Builder
// ---------------------------------------------------------------------------

export function createFlexMessage(
  altText: string,
  contents: Record<string, unknown>,
): LineMessage {
  return { type: 'flex', altText, contents };
}

// ---------------------------------------------------------------------------
// Store config helpers (internal)
// ---------------------------------------------------------------------------

async function getStoreLineConfig(storeId: string): Promise<StoreLineConfig | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('stores')
      .select('line_token, line_channel_id, line_channel_secret, stock_notify_group_id, deposit_notify_group_id, bar_notify_group_id')
      .eq('id', storeId)
      .single();

    if (error || !data) {
      console.error('[LINE] Failed to fetch store config:', error?.message);
      return null;
    }

    return data as StoreLineConfig;
  } catch (error) {
    console.error('[LINE] getStoreLineConfig error:', error);
    return null;
  }
}

async function isLineNotifyEnabled(storeId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('store_settings')
      .select('line_notify_enabled')
      .eq('store_id', storeId)
      .single();

    if (error || !data) {
      // Default to false if no settings found
      return false;
    }

    return (data as StoreSettings).line_notify_enabled === true;
  } catch (error) {
    console.error('[LINE] isLineNotifyEnabled error:', error);
    return false;
  }
}

/**
 * Resolve the channel token for a store.
 * Uses the store's own line_token if available, otherwise falls back to the central token.
 */
function resolveStoreToken(storeConfig: StoreLineConfig): string | null {
  if (storeConfig.line_token) return storeConfig.line_token;
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || null;
}

// ---------------------------------------------------------------------------
// High-level: Deposit event notifications
// ---------------------------------------------------------------------------

type DepositEventType =
  | 'confirmed'
  | 'withdrawal_completed'
  | 'expiry_warning'
  | 'new_deposit'
  | 'withdrawal_request';

interface NotifyDepositEventParams {
  type: DepositEventType;
  storeId: string;
  data: Record<string, any>;
}

/**
 * High-level helper to send deposit-related LINE notifications.
 *
 * Handles:
 * - Looking up store LINE config and settings
 * - Checking if LINE notifications are enabled
 * - Building the appropriate Flex message
 * - Sending to the correct target (user or group)
 */
export async function notifyDepositEvent(params: NotifyDepositEventParams): Promise<void> {
  const { type, storeId, data } = params;

  // 1. Check if LINE notifications are enabled for this store
  const enabled = await isLineNotifyEnabled(storeId);
  if (!enabled) {
    console.log(`[LINE] Notifications disabled for store ${storeId}, skipping`);
    return;
  }

  // 2. Get store LINE configuration
  const config = await getStoreLineConfig(storeId);
  if (!config) {
    console.warn(`[LINE] No LINE config for store ${storeId}, skipping`);
    return;
  }

  const token = resolveStoreToken(config);
  if (!token) {
    console.warn(`[LINE] No token available for store ${storeId}, skipping`);
    return;
  }

  // 3. Build message and determine target based on event type
  switch (type) {
    case 'confirmed': {
      // Send to customer's LINE userId
      const lineUserId = data.line_user_id as string | undefined;
      if (!lineUserId) {
        console.warn('[LINE] No line_user_id for deposit confirmed notification');
        return;
      }

      const message = depositConfirmedFlex({
        deposit_code: data.deposit_code,
        product_name: data.product_name,
        quantity: data.quantity,
        store_name: data.store_name,
        expiry_date: data.expiry_date,
      });

      await sendLinePush(lineUserId, [message as unknown as LineMessage], token);
      break;
    }

    case 'withdrawal_completed': {
      // Send to customer's LINE userId
      const lineUserId = data.line_user_id as string | undefined;
      if (!lineUserId) {
        console.warn('[LINE] No line_user_id for withdrawal completed notification');
        return;
      }

      const message = withdrawalCompletedFlex({
        product_name: data.product_name,
        actual_qty: data.actual_qty,
        remaining_qty: data.remaining_qty,
        store_name: data.store_name,
      });

      await sendLinePush(lineUserId, [message as unknown as LineMessage], token);
      break;
    }

    case 'expiry_warning': {
      // Send to customer's LINE userId
      const lineUserId = data.line_user_id as string | undefined;
      if (!lineUserId) {
        console.warn('[LINE] No line_user_id for expiry warning notification');
        return;
      }

      const message = depositExpiryWarningFlex({
        deposit_code: data.deposit_code,
        product_name: data.product_name,
        remaining_qty: data.remaining_qty,
        expiry_date: data.expiry_date,
        days_remaining: data.days_remaining,
      });

      await sendLinePush(lineUserId, [message as unknown as LineMessage], token);
      break;
    }

    case 'new_deposit': {
      // Send to bar notification group
      const groupId = config.bar_notify_group_id;
      if (!groupId) {
        console.warn(`[LINE] No bar_notify_group_id for store ${storeId}`);
        return;
      }

      const message = newDepositNotifyFlex({
        deposit_code: data.deposit_code,
        product_name: data.product_name,
        customer_name: data.customer_name,
        quantity: data.quantity,
        table_number: data.table_number,
        staff_name: data.staff_name,
      });

      await sendLineGroupPush(groupId, [message as unknown as LineMessage], token);
      break;
    }

    case 'withdrawal_request': {
      // Send to bar notification group
      const groupId = config.bar_notify_group_id;
      if (!groupId) {
        console.warn(`[LINE] No bar_notify_group_id for store ${storeId}`);
        return;
      }

      const message = withdrawalRequestNotifyFlex({
        product_name: data.product_name,
        customer_name: data.customer_name,
        requested_qty: data.requested_qty,
        table_number: data.table_number,
      });

      await sendLineGroupPush(groupId, [message as unknown as LineMessage], token);
      break;
    }

    default: {
      console.warn(`[LINE] Unknown deposit event type: ${type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// High-level: Stock event notifications
// ---------------------------------------------------------------------------

type StockEventType = 'comparison_result' | 'daily_reminder';

interface NotifyStockEventParams {
  type: StockEventType;
  storeId: string;
  data: Record<string, any>;
}

/**
 * High-level helper to send stock-related LINE notifications.
 *
 * Handles:
 * - Looking up store LINE config and settings
 * - Checking if LINE notifications are enabled
 * - Building the appropriate Flex message
 * - Sending to the stock notification group
 */
export async function notifyStockEvent(params: NotifyStockEventParams): Promise<void> {
  const { type, storeId, data } = params;

  // 1. Check if LINE notifications are enabled
  const enabled = await isLineNotifyEnabled(storeId);
  if (!enabled) {
    console.log(`[LINE] Notifications disabled for store ${storeId}, skipping`);
    return;
  }

  // 2. Get store LINE configuration
  const config = await getStoreLineConfig(storeId);
  if (!config) {
    console.warn(`[LINE] No LINE config for store ${storeId}, skipping`);
    return;
  }

  const token = resolveStoreToken(config);
  if (!token) {
    console.warn(`[LINE] No token available for store ${storeId}, skipping`);
    return;
  }

  // 3. Determine target group
  const groupId = config.stock_notify_group_id;
  if (!groupId) {
    console.warn(`[LINE] No stock_notify_group_id for store ${storeId}`);
    return;
  }

  // 4. Build message based on event type
  switch (type) {
    case 'comparison_result': {
      const message = stockComparisonFlex({
        store_name: data.store_name,
        date: data.date,
        total_items: data.total_items,
        over_threshold_count: data.over_threshold_count,
        summary: data.summary,
      });

      await sendLineGroupPush(groupId, [message as unknown as LineMessage], token);
      break;
    }

    case 'daily_reminder': {
      const contents = dailyReminderTemplate(data.store_name);
      const message = createFlexMessage(
        `เตือนนับสต๊อก - ${data.store_name}`,
        contents,
      );

      await sendLineGroupPush(groupId, [message], token);
      break;
    }

    default: {
      console.warn(`[LINE] Unknown stock event type: ${type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function resolveToken(explicitToken?: string): string | null {
  if (explicitToken) return explicitToken;
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || null;
}
