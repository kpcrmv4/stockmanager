import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { username, password, displayName, registrationCode } = (await request.json()) as {
    username: string;
    password: string;
    displayName: string | null;
    registrationCode: string;
  };

  if (!username?.trim() || !password || !registrationCode?.trim()) {
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

  const serviceClient = createServiceClient();

  // 1. Verify registration code against store_settings
  const { data: settings, error: settingsError } = await serviceClient
    .from('store_settings')
    .select('store_id, stores:store_id(store_name)')
    .eq('staff_registration_code', registrationCode.trim())
    .single();

  if (settingsError || !settings) {
    return NextResponse.json({ error: 'รหัสลงทะเบียนไม่ถูกต้อง' }, { status: 400 });
  }

  const storeId = settings.store_id;
  // stores is a single object (not array) when using .single() on the parent query
  const storesData = settings.stores as unknown as { store_name: string } | null;
  const storeName = storesData?.store_name || '';

  // 2. Create auth user via admin API (auto-confirms email)
  const email = `${username.trim().toLowerCase()}@stockmanager.app`;
  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username: username.trim().toLowerCase(),
      role: 'staff',
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

  // 3. Update profile (trigger already created it with basic info)
  await serviceClient
    .from('profiles')
    .update({
      username: username.trim().toLowerCase(),
      role: 'staff',
      display_name: displayName?.trim() || username.trim(),
      active: true,
    })
    .eq('id', userId);

  // 4. Assign user to the store
  await serviceClient.from('user_stores').insert({
    user_id: userId,
    store_id: storeId,
  });

  // 5. Audit log
  await serviceClient.from('audit_logs').insert({
    store_id: storeId,
    action_type: 'STAFF_SELF_REGISTERED',
    table_name: 'profiles',
    record_id: userId,
    new_value: { username: username.trim().toLowerCase(), store_name: storeName },
    changed_by: userId,
  });

  return NextResponse.json({
    success: true,
    storeName,
  });
}
