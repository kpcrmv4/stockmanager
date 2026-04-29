import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/me/change-password
 *
 * Self-serve password change for the logged-in user. Verifies the current
 * password by attempting a sign-in with it (no admin endpoint exposes a
 * "verify password" call), then applies the new password and clears the
 * `must_change_password` flag.
 */
export async function POST(request: NextRequest) {
  const { currentPassword, newPassword } = (await request.json()) as {
    currentPassword: string;
    newPassword: string;
  };

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสใหม่' }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'รหัสใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: 'รหัสใหม่ต้องไม่ตรงกับรหัสเดิม' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify current password by attempting sign-in (read-only check). We
  // discard the resulting session — the original cookie session keeps the
  // user logged in.
  const verifier = createServiceClient();
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 400 });
  }

  // Apply the new password through the user-bound client so the existing
  // session is updated atomically.
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return NextResponse.json({ error: 'อัปเดตรหัสไม่สำเร็จ: ' + updateError.message }, { status: 500 });
  }

  // Clear the "must change" flag
  const service = createServiceClient();
  await service.from('profiles').update({ must_change_password: false }).eq('id', user.id);

  return NextResponse.json({ success: true });
}
