import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { username, password, displayName, token } = (await request.json()) as {
    username: string;
    password: string;
    displayName: string;
    token: string;
  };

  if (!username?.trim() || !password || !token?.trim() || !displayName?.trim()) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 });
  }

  if (username.trim().length < 3) {
    return NextResponse.json({ error: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร' }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    return NextResponse.json({ error: 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่างเท่านั้น' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }

  const service = createServiceClient();

  // 1. Verify invitation token
  const { data: invitation, error: inviteError } = await service
    .from('staff_invitations')
    .select('id, store_id, role, active, used_count, store:stores(store_name)')
    .eq('token', token.trim())
    .maybeSingle();

  if (inviteError || !invitation) {
    return NextResponse.json({ error: 'ลิงก์เชิญไม่ถูกต้อง' }, { status: 400 });
  }
  if (!invitation.active) {
    return NextResponse.json({ error: 'ลิงก์เชิญถูกปิดใช้งาน' }, { status: 410 });
  }

  const storeId = invitation.store_id;
  const role = invitation.role;
  const storesData = invitation.store as unknown as { store_name: string } | null;
  const storeName = storesData?.store_name || '';

  // 2. Create auth user
  const email = `${username.trim().toLowerCase()}@stockmanager.app`;
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username: username.trim().toLowerCase(),
      role,
    },
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return NextResponse.json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }, { status: 409 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการสร้างบัญชี' }, { status: 500 });
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'ไม่สามารถสร้างบัญชีได้' }, { status: 500 });
  }

  const userId = authData.user.id;

  // 3. Update profile (trigger created the row with default role='staff')
  await service
    .from('profiles')
    .update({
      username: username.trim().toLowerCase(),
      role,
      display_name: displayName.trim(),
      active: true,
    })
    .eq('id', userId);

  // 4. Assign user to the store
  await service.from('user_stores').insert({ user_id: userId, store_id: storeId });

  // 5. Increment invitation use count
  await service
    .from('staff_invitations')
    .update({ used_count: invitation.used_count + 1 })
    .eq('id', invitation.id);

  // 6. Audit log
  await service.from('audit_logs').insert({
    store_id: storeId,
    action_type: 'STAFF_INVITED_REGISTERED',
    table_name: 'profiles',
    record_id: userId,
    new_value: {
      username: username.trim().toLowerCase(),
      role,
      store_name: storeName,
      invitation_id: invitation.id,
    },
    changed_by: userId,
  });

  return NextResponse.json({ success: true, storeName, role });
}
