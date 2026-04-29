import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/auth/invitation/[token]
 *
 * Public endpoint — staff hits this when opening their invite link.
 * Returns role + store name to render on the register page.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('staff_invitations')
    .select('id, role, active, store:stores(store_name, store_code)')
    .eq('token', token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'invalid' }, { status: 404 });
  if (!data.active) return NextResponse.json({ error: 'inactive' }, { status: 410 });

  const store = data.store as unknown as { store_name: string; store_code: string } | null;

  return NextResponse.json({
    role: data.role,
    storeName: store?.store_name || '',
    storeCode: store?.store_code || '',
  });
}
