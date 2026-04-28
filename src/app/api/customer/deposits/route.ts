import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/customer/deposits?token=xxx
 * POST /api/customer/deposits  body: { accessToken }
 *
 * Returns the customer's active deposit lifecycle:
 *   pending_staff → pending_confirm → in_store → pending_withdrawal
 *
 * `pending_staff` rows are LIFF-submitted requests where the customer hasn't
 * yet handed the bottle to staff. The customer LIFF surfaces these in a
 * "Pending Requests" section so they can see the request was received.
 */

const DEPOSIT_SELECT =
  'id, deposit_code, product_name, category, quantity, remaining_qty, remaining_percent, expiry_date, status, table_number, notes, customer_photo_url, created_at, store_id, store:stores(store_name)';

const ACTIVE_STATUSES = [
  'pending_staff',
  'pending_confirm',
  'in_store',
  'pending_withdrawal',
] as const;

interface GetDepositsOptions {
  storeId?: string | null;
  storeCode?: string | null;
}

async function resolveStoreId(opts: GetDepositsOptions): Promise<string | null | undefined> {
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

async function getDeposits(lineUserId: string, opts: GetDepositsOptions = {}) {
  const resolved = await resolveStoreId(opts);
  // Fail-closed: storeCode provided but didn't resolve → no data.
  if (resolved === undefined) return [];

  const supabase = createServiceClient();
  let query = supabase
    .from('deposits')
    .select(DEPOSIT_SELECT)
    .eq('line_user_id', lineUserId)
    .in('status', ACTIVE_STATUSES as unknown as string[])
    .order('created_at', { ascending: false });

  if (resolved) {
    query = query.eq('store_id', resolved);
  }

  const { data } = await query;
  return data || [];
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

  const deposits = await getDeposits(lineUserId, { storeId, storeCode });
  return NextResponse.json({ deposits });
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
  const deposits = await getDeposits(profile.userId, { storeId, storeCode });
  return NextResponse.json({ deposits });
}
