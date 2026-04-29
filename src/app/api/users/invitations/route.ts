import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

type Role = 'owner' | 'accountant' | 'manager' | 'bar' | 'staff' | 'hq';

const ALLOWED_ROLES: Role[] = ['accountant', 'manager', 'bar', 'staff', 'hq'];

async function requireAdminOrManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['owner', 'accountant', 'hq', 'manager'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { supabase, user, role: profile.role as Role };
}

export async function GET() {
  const ctx = await requireAdminOrManager();
  if ('error' in ctx) return ctx.error;

  const { data, error } = await ctx.supabase
    .from('staff_invitations')
    .select('*, store:stores(store_name, store_code), creator:profiles!staff_invitations_created_by_fkey(display_name, username)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invitations: data });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminOrManager();
  if ('error' in ctx) return ctx.error;

  const { storeId, role, notes } = (await request.json()) as {
    storeId: string;
    role: Role;
    notes?: string;
  };

  if (!storeId || !role) {
    return NextResponse.json({ error: 'Missing storeId or role' }, { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }
  // Manager can only invite staff/bar
  if (ctx.role === 'manager' && !['staff', 'bar'].includes(role)) {
    return NextResponse.json({ error: 'Manager can only invite staff or bar' }, { status: 403 });
  }

  const token = crypto.randomBytes(12).toString('base64url');

  const { data, error } = await ctx.supabase
    .from('staff_invitations')
    .insert({
      token,
      store_id: storeId,
      role,
      notes: notes?.trim() || null,
      created_by: ctx.user.id,
    })
    .select('*, store:stores(store_name, store_code)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invitation: data });
}
