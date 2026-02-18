import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/auth/customer-token?token=xxx
 * ตรวจสอบ customer token แล้วคืนข้อมูลลูกค้า (lineUserId, deposits)
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const lineUserId = verifyCustomerToken(token);
  if (!lineUserId) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // ดึงข้อมูล profile (ถ้ามี)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('line_user_id', lineUserId)
    .single();

  // ดึง deposits ของลูกค้า
  const { data: deposits } = await supabase
    .from('deposits')
    .select('id, deposit_code, product_name, category, remaining_qty, remaining_percent, expiry_date, status, created_at, store:stores(store_name)')
    .eq('line_user_id', lineUserId)
    .in('status', ['pending_confirm', 'in_store', 'pending_withdrawal'])
    .order('created_at', { ascending: false });

  return NextResponse.json({
    lineUserId,
    displayName: profile?.display_name || null,
    avatarUrl: profile?.avatar_url || null,
    deposits: deposits || [],
  });
}
