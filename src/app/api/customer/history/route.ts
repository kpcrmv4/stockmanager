import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET  /api/customer/history?token=xxx
 * POST /api/customer/history       body: { accessToken }
 *
 * Returns the customer's full transaction history — both deposits
 * (all statuses) and withdrawals (all statuses) — keyed by their
 * LINE userId. Powers the History tab in the LIFF customer view, which
 * previously only saw deposits and missed bar-approved withdrawals.
 *
 * Optional `storeId` / `storeCode` query params scope the response to
 * a single branch (same fail-closed behaviour as /api/customer/deposits).
 */

const DEPOSIT_SELECT =
  'id, deposit_code, product_name, quantity, remaining_qty, status, created_at, store_id, store:stores(store_name)';

// Pull deposit_code + the parent deposit's total quantity (for "2/3"
// labels) and the targeted bottle_no when the withdrawal was bottle-
// specific. Multi-bottle requests create one row per bottle, so this
// gives the customer a clear "which bottle was withdrawn".
const WITHDRAWAL_SELECT =
  'id, deposit_id, bottle_id, product_name, requested_qty, actual_qty, status, created_at, store_id, deposit:deposits(deposit_code, quantity), bottle:deposit_bottles(bottle_no)';

interface ScopeOpts {
  storeId?: string | null;
  storeCode?: string | null;
}

async function resolveStoreId(opts: ScopeOpts): Promise<string | null | undefined> {
  if (opts.storeId) return opts.storeId;
  if (!opts.storeCode) return null;

  const supabase = createServiceClient();
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('store_code', opts.storeCode)
    .eq('active', true)
    .maybeSingle();
  return store?.id ?? undefined;
}

async function loadHistory(lineUserId: string, opts: ScopeOpts = {}) {
  const resolved = await resolveStoreId(opts);
  // Fail-closed: storeCode supplied but invalid → return empty.
  if (resolved === undefined) {
    return { deposits: [], withdrawals: [] };
  }

  const supabase = createServiceClient();
  let depositsQ = supabase
    .from('deposits')
    .select(DEPOSIT_SELECT)
    .eq('line_user_id', lineUserId)
    .order('created_at', { ascending: false })
    .limit(100);
  let withdrawalsQ = supabase
    .from('withdrawals')
    .select(WITHDRAWAL_SELECT)
    .eq('line_user_id', lineUserId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (resolved) {
    depositsQ = depositsQ.eq('store_id', resolved);
    withdrawalsQ = withdrawalsQ.eq('store_id', resolved);
  }

  const [depRes, wdRes] = await Promise.all([depositsQ, withdrawalsQ]);
  return {
    deposits: depRes.data || [],
    withdrawals: wdRes.data || [],
  };
}

// Token mode (signed customer-token from a Flex card link)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const storeId = request.nextUrl.searchParams.get('storeId');
  const storeCode = request.nextUrl.searchParams.get('storeCode');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const lineUserId = verifyCustomerToken(token);
  if (!lineUserId) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const data = await loadHistory(lineUserId, { storeId, storeCode });
  return NextResponse.json(data);
}

// LIFF mode (customer is in the LINE app — verify via LIFF accessToken)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { accessToken, storeId, storeCode } = body as {
    accessToken?: string;
    storeId?: string | null;
    storeCode?: string | null;
  };

  if (!accessToken) {
    return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 });
  }

  const verifyRes = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!verifyRes.ok) {
    return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
  }

  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) {
    return NextResponse.json({ error: 'Failed to get profile' }, { status: 401 });
  }

  const profile = (await profileRes.json()) as { userId: string };
  const data = await loadHistory(profile.userId, { storeId, storeCode });
  return NextResponse.json(data);
}
