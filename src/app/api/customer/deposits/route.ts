import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/customer/deposits?token=xxx
 * ดึง deposits ของลูกค้า (ใช้ customer token verify)
 *
 * POST /api/customer/deposits
 * Body: { accessToken: string }
 * ดึง deposits ของลูกค้า (ใช้ LIFF access token verify)
 */

const DEPOSIT_SELECT =
  'id, deposit_code, product_name, category, remaining_qty, remaining_percent, expiry_date, status, created_at, store_id, store:stores(store_name)';

interface GetDepositsOptions {
  /** When set, only deposits belonging to this store are returned. */
  storeId?: string | null;
  /** When set, resolve store_id from store_code first. */
  storeCode?: string | null;
}

async function getDeposits(lineUserId: string, opts: GetDepositsOptions = {}) {
  const supabase = createServiceClient();

  // Resolve storeId from storeCode if only the code was passed.
  let resolvedStoreId = opts.storeId ?? null;
  if (!resolvedStoreId && opts.storeCode) {
    const { data: store } = await supabase
      .from('stores')
      .select('id')
      .eq('store_code', opts.storeCode)
      .eq('active', true)
      .maybeSingle();
    resolvedStoreId = store?.id ?? null;

    // Store code provided but didn't resolve → return empty (fail closed,
    // never leak deposits from other branches).
    if (!resolvedStoreId) return [];
  }

  let query = supabase
    .from('deposits')
    .select(DEPOSIT_SELECT)
    .eq('line_user_id', lineUserId)
    .in('status', ['pending_confirm', 'in_store', 'pending_withdrawal'])
    .order('created_at', { ascending: false });

  if (resolvedStoreId) {
    query = query.eq('store_id', resolvedStoreId);
  }

  const { data } = await query;
  return data || [];
}

// Token mode
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

// LIFF mode
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

  // Verify with LINE API
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
