import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { storeName, email, phone, password } = (await request.json()) as {
    storeName: string;
    email: string;
    phone: string;
    password: string;
  };

  // Validate required fields
  if (!storeName?.trim() || !email?.trim() || !phone?.trim() || !password) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 });
  }

  // Validate email
  if (!/^[^\s@]+@gmail\.com$/i.test(email.trim())) {
    return NextResponse.json({ error: 'กรุณาใช้อีเมล Gmail เท่านั้น' }, { status: 400 });
  }

  // Validate phone: must start with 0 (Thai local) or +66
  const cleanPhone = phone.replace(/[\s\-()]/g, '');
  if (!/^(0[689]\d{8}|\+66[689]\d{7})$/.test(cleanPhone)) {
    return NextResponse.json({ error: 'เบอร์โทรไม่ถูกต้อง กรุณากรอกเบอร์ที่ขึ้นต้นด้วย 06, 08, 09 หรือ +66' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // Check duplicate email
  const { data: existing } = await serviceClient
    .from('trial_registrations')
    .select('id, status')
    .eq('email', email.trim().toLowerCase())
    .in('status', ['pending', 'approved'])
    .limit(1);

  if (existing && existing.length > 0) {
    if (existing[0].status === 'approved') {
      return NextResponse.json({ error: 'อีเมลนี้ได้รับการอนุมัติแล้ว กรุณาเข้าสู่ระบบ' }, { status: 409 });
    }
    return NextResponse.json({ error: 'อีเมลนี้อยู่ระหว่างรอการอนุมัติ' }, { status: 409 });
  }

  // Store registration (password stored temporarily, will be used when admin approves to create auth user)
  const { error: insertError } = await serviceClient.from('trial_registrations').insert({
    store_name: storeName.trim(),
    email: email.trim().toLowerCase(),
    phone: cleanPhone,
    password_hash: password, // Will be used to create Supabase auth user on approval
  });

  if (insertError) {
    console.error('[register-trial] Insert error:', insertError);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
