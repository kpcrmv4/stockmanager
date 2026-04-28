import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyDepositEvent } from '@/lib/line/messaging';

// In-memory dedupe for batch deposits — when bar confirms 3 bottles
// from one drop-off photo, the deposit-detail page calls this endpoint
// once per deposit. We send the first call as a combined batch card and
// suppress the rest so the customer doesn't see 3 nearly-identical
// flex messages. Keyed by `${store_id}:${line_user_id}:${photo_url}`,
// expires after 90 seconds. Per-instance only, which is fine because
// all 3 calls land on the same warm function within ~1 second.
const recentBatchSends = new Map<string, number>();
function batchKey(storeId: string, lineUserId: string, photoUrl: string | null): string {
  return `${storeId}|${lineUserId}|${photoUrl ?? ''}`;
}
function isDuplicateBatch(key: string): boolean {
  const now = Date.now();
  // Sweep stale entries
  for (const [k, t] of recentBatchSends) {
    if (now - t > 90_000) recentBatchSends.delete(k);
  }
  return recentBatchSends.has(key);
}
function rememberBatch(key: string): void {
  recentBatchSends.set(key, Date.now());
}

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
      .select('id, store_id, deposit_code, product_name, quantity, remaining_qty, line_user_id, customer_name, customer_phone, expiry_date, received_photo_url, store:stores(store_name, store_code)');
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
    const storeCode = (storeRow as { store_code?: string } | null)?.store_code || null;

    // Detect whether this confirm is part of a multi-bottle batch:
    // same store_id + same line_user_id + same received_photo_url, all
    // confirmed in the same minute (just-now). When ≥2, build a combined
    // confirm card so the customer sees one Flex per drop-off, not N.
    const batchSiblings: Array<{
      deposit_code: string;
      product_name: string;
      quantity: number;
    }> = [];
    if (body.type === 'confirmed' && deposit.received_photo_url) {
      const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
      const { data: siblings } = await supabase
        .from('deposits')
        .select('deposit_code, product_name, quantity, line_user_id')
        .eq('store_id', deposit.store_id)
        .eq('received_photo_url', deposit.received_photo_url)
        .eq('line_user_id', deposit.line_user_id)
        .eq('status', 'in_store')
        .gte('updated_at', oneMinAgo)
        .order('created_at', { ascending: true });
      for (const s of siblings || []) {
        batchSiblings.push({
          deposit_code: s.deposit_code,
          product_name: s.product_name,
          quantity: Number(s.quantity) || 0,
        });
      }
      // De-dupe — make sure the current deposit is in the list once.
      if (!batchSiblings.find((x) => x.deposit_code === deposit.deposit_code)) {
        batchSiblings.unshift({
          deposit_code: deposit.deposit_code,
          product_name: deposit.product_name,
          quantity: Number(deposit.quantity) || 0,
        });
      }
    }

    // Build the entry URL the "Open Bottle Keeper" button should point at.
    let entryUrl: string | null = null;
    try {
      const { buildCustomerEntryUrl } = await import('@/lib/line/customer-entry-url');
      entryUrl = await buildCustomerEntryUrl({
        lineUserId: deposit.line_user_id,
        storeCode,
      });
    } catch { /* fall through with null */ }

    if (body.type === 'confirmed') {
      const useBatch = batchSiblings.length >= 2;
      // De-dupe sibling notifications inside the same batch.
      if (useBatch) {
        const key = batchKey(deposit.store_id, deposit.line_user_id, deposit.received_photo_url);
        if (isDuplicateBatch(key)) {
          return NextResponse.json({ ok: true, skipped: 'batch_already_sent' });
        }
        rememberBatch(key);
      }
      await notifyDepositEvent({
        type: 'confirmed',
        storeId: deposit.store_id,
        data: {
          line_user_id: deposit.line_user_id,
          deposit_code: deposit.deposit_code,
          deposit_codes: useBatch ? batchSiblings.map((s) => s.deposit_code) : undefined,
          items: useBatch
            ? batchSiblings.map((s) => ({ product_name: s.product_name, quantity: s.quantity }))
            : undefined,
          product_name: deposit.product_name,
          quantity: deposit.quantity,
          expiry_date: deposit.expiry_date,
          store_name: storeName,
          customer_name: deposit.customer_name,
          customer_phone: deposit.customer_phone,
          entry_url: entryUrl,
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
          customer_name: deposit.customer_name,
          customer_phone: deposit.customer_phone,
        },
      });
    } else if (body.type === 'withdrawal_completed') {
      const actualQty = typeof body.actual_qty === 'number' ? body.actual_qty : 0;
      await notifyDepositEvent({
        type: 'withdrawal_completed',
        storeId: deposit.store_id,
        data: {
          line_user_id: deposit.line_user_id,
          deposit_code: deposit.deposit_code,
          product_name: deposit.product_name,
          actual_qty: actualQty,
          remaining_qty: deposit.remaining_qty,
          store_name: storeName,
          customer_name: deposit.customer_name,
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
