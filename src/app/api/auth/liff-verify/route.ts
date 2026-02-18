import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/liff-verify
 * รับ LIFF access token → verify กับ LINE API → คืนข้อมูลลูกค้า + deposits
 *
 * Body: { accessToken: string }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { accessToken } = body as { accessToken?: string };

  if (!accessToken) {
    return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 });
  }

  // -----------------------------------------------------------------------
  // 1. Verify access token กับ LINE API
  // -----------------------------------------------------------------------
  const verifyRes = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,
  );

  if (!verifyRes.ok) {
    return NextResponse.json(
      { error: 'Invalid or expired LIFF access token' },
      { status: 401 },
    );
  }

  // -----------------------------------------------------------------------
  // 2. ดึง LINE profile ด้วย access token
  // -----------------------------------------------------------------------
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    return NextResponse.json(
      { error: 'Failed to get LINE profile' },
      { status: 401 },
    );
  }

  const profile = (await profileRes.json()) as {
    userId: string;
    displayName: string;
    pictureUrl?: string;
  };

  const lineUserId = profile.userId;

  // -----------------------------------------------------------------------
  // 3. ดึงข้อมูลจาก Supabase (ใช้ service client — bypass RLS)
  // -----------------------------------------------------------------------
  const supabase = createServiceClient();

  // ดึง/สร้าง profile ในระบบ
  const { data: dbProfile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('line_user_id', lineUserId)
    .single();

  // ดึง deposits ของลูกค้า (ทุกสาขา)
  const { data: deposits } = await supabase
    .from('deposits')
    .select(
      'id, deposit_code, product_name, category, remaining_qty, remaining_percent, expiry_date, status, created_at, store:stores(store_name)',
    )
    .eq('line_user_id', lineUserId)
    .in('status', ['pending_confirm', 'in_store', 'pending_withdrawal'])
    .order('created_at', { ascending: false });

  return NextResponse.json({
    lineUserId,
    displayName: dbProfile?.display_name || profile.displayName || null,
    avatarUrl: dbProfile?.avatar_url || profile.pictureUrl || null,
    deposits: deposits || [],
  });
}
