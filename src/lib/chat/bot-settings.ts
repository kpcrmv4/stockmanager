/**
 * Chat Bot Settings Helper
 *
 * ดึงค่า settings ของบอทแชทจาก store_settings
 * ใช้ server-side (service client) เท่านั้น
 */

import { createServiceClient } from '@/lib/supabase/server';

export interface ChatBotSettings {
  chat_bot_deposit_enabled: boolean;
  chat_bot_withdrawal_enabled: boolean;
  chat_bot_stock_enabled: boolean;
  chat_bot_borrow_enabled: boolean;
  chat_bot_transfer_enabled: boolean;
  chat_bot_timeout_deposit: number;
  chat_bot_timeout_withdrawal: number;
  chat_bot_timeout_stock: number;
  chat_bot_timeout_borrow: number;
  chat_bot_timeout_transfer: number;
  chat_bot_priority_deposit: 'urgent' | 'normal' | 'low';
  chat_bot_priority_withdrawal: 'urgent' | 'normal' | 'low';
  chat_bot_priority_stock: 'urgent' | 'normal' | 'low';
  chat_bot_priority_borrow: 'urgent' | 'normal' | 'low';
  chat_bot_priority_transfer: 'urgent' | 'normal' | 'low';
  chat_bot_daily_summary_enabled: boolean;
}

const DEFAULTS: ChatBotSettings = {
  chat_bot_deposit_enabled: true,
  chat_bot_withdrawal_enabled: true,
  chat_bot_stock_enabled: true,
  chat_bot_borrow_enabled: true,
  chat_bot_transfer_enabled: true,
  chat_bot_timeout_deposit: 15,
  chat_bot_timeout_withdrawal: 15,
  chat_bot_timeout_stock: 60,
  chat_bot_timeout_borrow: 30,
  chat_bot_timeout_transfer: 120,
  chat_bot_priority_deposit: 'normal',
  chat_bot_priority_withdrawal: 'normal',
  chat_bot_priority_stock: 'normal',
  chat_bot_priority_borrow: 'normal',
  chat_bot_priority_transfer: 'normal',
  chat_bot_daily_summary_enabled: true,
};

const SETTINGS_COLUMNS = Object.keys(DEFAULTS).join(', ');

/**
 * ดึง bot settings ของสาขา (server-side)
 */
export async function getChatBotSettings(storeId: string): Promise<ChatBotSettings> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('store_settings')
    .select(SETTINGS_COLUMNS)
    .eq('store_id', storeId)
    .single();

  if (!data) return DEFAULTS;

  return {
    ...DEFAULTS,
    ...(data as Partial<ChatBotSettings>),
  };
}

/** action_type → enabled column */
const ENABLED_MAP: Record<string, keyof ChatBotSettings> = {
  deposit_claim: 'chat_bot_deposit_enabled',
  withdrawal_claim: 'chat_bot_withdrawal_enabled',
  stock_explain: 'chat_bot_stock_enabled',
  borrow_approve: 'chat_bot_borrow_enabled',
  transfer_receive: 'chat_bot_transfer_enabled',
};

/** action_type → timeout column */
const TIMEOUT_MAP: Record<string, keyof ChatBotSettings> = {
  deposit_claim: 'chat_bot_timeout_deposit',
  withdrawal_claim: 'chat_bot_timeout_withdrawal',
  stock_explain: 'chat_bot_timeout_stock',
  borrow_approve: 'chat_bot_timeout_borrow',
  transfer_receive: 'chat_bot_timeout_transfer',
};

/** action_type → priority column */
const PRIORITY_MAP: Record<string, keyof ChatBotSettings> = {
  deposit_claim: 'chat_bot_priority_deposit',
  withdrawal_claim: 'chat_bot_priority_withdrawal',
  stock_explain: 'chat_bot_priority_stock',
  borrow_approve: 'chat_bot_priority_borrow',
  transfer_receive: 'chat_bot_priority_transfer',
};

export function isBotTypeEnabled(settings: ChatBotSettings, actionType: string): boolean {
  const key = ENABLED_MAP[actionType];
  if (!key) return true; // unknown type → allow
  return settings[key] as boolean;
}

export function getTimeoutForType(settings: ChatBotSettings, actionType: string): number {
  const key = TIMEOUT_MAP[actionType];
  if (!key) return 15;
  return settings[key] as number;
}

export function getPriorityForType(settings: ChatBotSettings, actionType: string): 'urgent' | 'normal' | 'low' {
  const key = PRIORITY_MAP[actionType];
  if (!key) return 'normal';
  return settings[key] as 'urgent' | 'normal' | 'low';
}
