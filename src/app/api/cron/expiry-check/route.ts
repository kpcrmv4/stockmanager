import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { pushMessage } from '@/lib/line/messaging';
import { expiryWarningTemplate } from '@/lib/line/flex-templates';
import { daysFromNowISO, effectiveExpiryISO } from '@/lib/utils/date';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get store settings for expiry notification days
  const { data: storeSettings } = await supabase
    .from('store_settings')
    .select('store_id, customer_notify_expiry_enabled, customer_notify_expiry_days')
    .eq('customer_notify_expiry_enabled', true);

  if (!storeSettings || storeSettings.length === 0) {
    return NextResponse.json({ status: 'no stores with expiry notifications enabled' });
  }

  const results: Array<{ deposit_code: string; notified: boolean; error?: string }> = [];

  for (const setting of storeSettings) {
    const warningDays = setting.customer_notify_expiry_days || 7;
    const warningDateISO = daysFromNowISO(warningDays);

    // Find deposits expiring within the warning period (exclude VIP)
    const { data: expiringDeposits } = await supabase
      .from('deposits')
      .select('*, store:stores(store_name)')
      .eq('store_id', setting.store_id)
      .eq('status', 'in_store')
      .eq('is_vip', false)
      .lte('expiry_date', warningDateISO)
      .gt('expiry_date', new Date().toISOString());

    if (!expiringDeposits) continue;

    // Batch fetch notification preferences for all customers (avoid N+1)
    const customerIds = [...new Set(expiringDeposits.map((d) => d.customer_id).filter(Boolean))] as string[];
    const prefsMap = new Map<string, { notify_expiry_warning: boolean; line_enabled: boolean }>();
    if (customerIds.length > 0) {
      const { data: allPrefs } = await supabase
        .from('notification_preferences')
        .select('user_id, notify_expiry_warning, line_enabled')
        .in('user_id', customerIds);
      if (allPrefs) {
        for (const p of allPrefs) {
          prefsMap.set(p.user_id, p);
        }
      }
    }

    for (const deposit of expiringDeposits) {
      // Check customer notification preferences (from batch)
      if (deposit.customer_id) {
        const prefs = prefsMap.get(deposit.customer_id);
        if (prefs && !prefs.notify_expiry_warning) {
          results.push({ deposit_code: deposit.deposit_code, notified: false, error: 'Customer opted out' });
          continue;
        }
      }

      // Send LINE notification if customer has line_user_id
      const lineUserId = deposit.line_user_id;
      if (lineUserId) {
        try {
          const daysLeft = Math.ceil(
            (new Date(deposit.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          const flex = expiryWarningTemplate(
            deposit.customer_name,
            deposit.product_name,
            deposit.deposit_code,
            daysLeft,
            deposit.store?.store_name || ''
          );
          await pushMessage(lineUserId, [{ type: 'flex', altText: 'เหล้าใกล้หมดอายุ', contents: flex }]);
          results.push({ deposit_code: deposit.deposit_code, notified: true });
        } catch (error) {
          results.push({
            deposit_code: deposit.deposit_code,
            notified: false,
            error: error instanceof Error ? error.message : 'LINE send failed',
          });
        }
      }

      // Create in-app notification
      if (deposit.customer_id) {
        const daysLeft = Math.ceil(
          (new Date(deposit.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        await supabase.from('notifications').insert({
          user_id: deposit.customer_id,
          store_id: deposit.store_id,
          title: 'เหล้าใกล้หมดอายุ',
          body: `${deposit.product_name} (${deposit.deposit_code}) จะหมดอายุในอีก ${daysLeft} วัน`,
          type: 'deposit_expiry',
          data: { deposit_id: deposit.id, deposit_code: deposit.deposit_code },
        });

        // Also send PWA push if applicable
        try {
          const { sendPushToUser } = await import('@/lib/notifications/push');
          await sendPushToUser(deposit.customer_id, {
            title: 'เหล้าใกล้หมดอายุ',
            body: `${deposit.product_name} (${deposit.deposit_code}) จะหมดอายุในอีก ${daysLeft} วัน`,
            url: '/customer',
            data: { deposit_id: deposit.id, type: 'deposit_expiry' },
          });
        } catch (pushErr) {
          console.error('[CRON] PWA push failed:', pushErr);
        }
      }
    }
  }

  // Mark expired deposits (exclude VIP — VIP never expires)
  // Fetch all store settings for blocked days + working hours (for grace period)
  const { data: allStoreSettings } = await supabase
    .from('store_settings')
    .select('store_id, withdrawal_blocked_days, print_server_working_hours');

  const storeSettingsMap = new Map<string, { blockedDays: string[]; endHour: number }>();
  if (allStoreSettings) {
    for (const s of allStoreSettings) {
      const wh = s.print_server_working_hours as { endHour?: number } | null;
      storeSettingsMap.set(s.store_id, {
        blockedDays: (s.withdrawal_blocked_days as string[] | null) ?? ['Fri', 'Sat'],
        endHour: wh?.endHour ?? 6,
      });
    }
  }

  // Fetch candidates for expiry (past their nominal expiry date)
  const { data: expiryCandidates } = await supabase
    .from('deposits')
    .select('id, deposit_code, store_id, expiry_date')
    .eq('status', 'in_store')
    .eq('is_vip', false)
    .lte('expiry_date', new Date().toISOString());

  const expired: Array<{ id: string; deposit_code: string; store_id: string }> = [];

  if (expiryCandidates) {
    const now = new Date().toISOString();

    for (const deposit of expiryCandidates) {
      // Check effective expiry (extended past blocked days + store closing grace)
      const settings = storeSettingsMap.get(deposit.store_id);
      const blockedDays = settings?.blockedDays ?? ['Fri', 'Sat'];
      const storeEndHour = settings?.endHour ?? 6;
      const effExpiry = effectiveExpiryISO(deposit.expiry_date, blockedDays, storeEndHour);

      if (effExpiry <= now) {
        // Truly expired — mark it
        await supabase
          .from('deposits')
          .update({ status: 'expired' })
          .eq('id', deposit.id);

        expired.push(deposit);

        await supabase.from('audit_logs').insert({
          store_id: deposit.store_id,
          action_type: 'CRON_DEPOSIT_EXPIRED',
          table_name: 'deposits',
          record_id: deposit.id,
          old_value: { status: 'in_store' },
          new_value: { status: 'expired', deposit_code: deposit.deposit_code },
          changed_by: null,
        });
      }
      // else: effective expiry hasn't passed yet (grace period for blocked days / store hours)
    }
  }

  return NextResponse.json({
    status: 'ok',
    results,
    expired_count: expired?.length || 0,
  });
}
