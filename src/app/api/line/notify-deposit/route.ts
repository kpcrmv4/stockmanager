import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyDepositEvent } from '@/lib/line/messaging';

/**
 * POST /api/line/notify-deposit
 *
 * Server endpoint that the client (deposit detail page, chat action card)
 * calls after a successful bar confirm / reject / withdrawal completion to
 * push a Flex message to the customer's LINE OA. Centralised here because
 * `notifyDepositEvent` uses a service-role Supabase client to read the
 * store's `line_token` — the browser must not see that secret.
 *
 * Body:
 *   {
 *     type: 'confirmed' | 'rejected' | 'withdrawal_completed',
 *     deposit_id: string,        // for type=confirmed | rejected
 *     deposit_code?: string,     // optional, may speed up lookups
 *     reason?: string,           // for type=rejected
 *     actual_qty?: number,       // for type=withdrawal_completed
 *   }
 *
 * The endpoint loads the deposit + store from the DB, fills in the rest of
 * the payload (line_user_id, store_name, product_name, etc.) so the caller
 * doesn't need to repeat itself, then dispatches via notifyDepositEvent —
 * which itself respects the master + per-event opt-in toggles set in
 * /settings/notifications. Auth: requires a logged-in user (any role except
 * customer) — this is a staff-triggered side-effect.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      type: 'confirmed' | 'rejected' | 'withdrawal_completed';
      deposit_id?: string;
      deposit_code?: string;
      reason?: string;
      actual_qty?: number;
    };

    if (!body.type) {
      return NextResponse.json({ error: 'Missing type' }, { status: 400 });
    }
    if (!body.deposit_id && !body.deposit_code) {
      return NextResponse.json({ error: 'Missing deposit_id or deposit_code' }, { status: 400 });
    }

    // Load the deposit with the store name baked in. We use the regular
    // (RLS-respecting) client here — staff who can't see the deposit
    // also can't trigger a notification for it.
    let depositQuery = supabase
      .from('deposits')
      .select('id, store_id, deposit_code, product_name, quantity, remaining_qty, line_user_id, expiry_date, store:stores(store_name)');
    if (body.deposit_id) depositQuery = depositQuery.eq('id', body.deposit_id);
    else if (body.deposit_code) depositQuery = depositQuery.eq('deposit_code', body.deposit_code);
    const { data: deposit, error } = await depositQuery.single();

    if (error || !deposit) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }
    if (!deposit.line_user_id) {
      // No linked LINE account — nothing to do but not an error.
      return NextResponse.json({ ok: true, skipped: 'no_line_user_id' });
    }

    const storeRow = Array.isArray(deposit.store) ? deposit.store[0] : deposit.store;
    const storeName = (storeRow as { store_name?: string } | null)?.store_name || '';

    if (body.type === 'confirmed') {
      await notifyDepositEvent({
        type: 'confirmed',
        storeId: deposit.store_id,
        data: {
          line_user_id: deposit.line_user_id,
          deposit_code: deposit.deposit_code,
          product_name: deposit.product_name,
          quantity: deposit.quantity,
          expiry_date: deposit.expiry_date,
          store_name: storeName,
        },
      });
    } else if (body.type === 'rejected') {
      await notifyDepositEvent({
        type: 'rejected',
        storeId: deposit.store_id,
        data: {
          line_user_id: deposit.line_user_id,
          product_name: deposit.product_name,
          store_name: storeName,
          reason: body.reason || '',
        },
      });
    } else if (body.type === 'withdrawal_completed') {
      const actualQty = typeof body.actual_qty === 'number' ? body.actual_qty : 0;
      await notifyDepositEvent({
        type: 'withdrawal_completed',
        storeId: deposit.store_id,
        data: {
          line_user_id: deposit.line_user_id,
          product_name: deposit.product_name,
          actual_qty: actualQty,
          remaining_qty: deposit.remaining_qty,
          store_name: storeName,
        },
      });
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notify-deposit] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
