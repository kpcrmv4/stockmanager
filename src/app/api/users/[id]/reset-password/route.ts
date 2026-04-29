import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * POST /api/users/[id]/reset-password
 *
 * Owner/manager-driven password reset. Generates a fresh random password,
 * applies it via the admin API, and returns it ONCE in the response so the
 * caller can hand it to the user. Audit logged.
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single();

  if (!callerProfile || !['owner', 'accountant', 'hq', 'manager'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();

  // Verify target user exists in profiles
  const { data: target } = await service
    .from('profiles')
    .select('id, username, role')
    .eq('id', id)
    .single();

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Manager cannot reset owner/accountant/hq passwords
  if (callerProfile.role === 'manager' && !['staff', 'bar'].includes(target.role)) {
    return NextResponse.json({ error: 'Manager can only reset staff/bar passwords' }, { status: 403 });
  }

  // Generate URL-safe 12-char password
  const newPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12);

  const { error: updErr } = await service.auth.admin.updateUserById(id, { password: newPassword });
  if (updErr) {
    return NextResponse.json({ error: 'Failed to reset password: ' + updErr.message }, { status: 500 });
  }

  // Audit log (no store_id since this is account-level)
  await service.from('audit_logs').insert({
    action_type: 'PASSWORD_RESET_BY_ADMIN',
    table_name: 'auth.users',
    record_id: id,
    new_value: { username: target.username, reset_by: caller.id },
    changed_by: caller.id,
  });

  return NextResponse.json({
    success: true,
    password: newPassword,
    username: target.username,
  });
}
