import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient as createServerClient } from '@/lib/supabase/server';
import { sendSms } from '@/lib/sms';

export async function POST(request: NextRequest) {
  const serverClient = await createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is owner
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    return NextResponse.json({ error: 'เฉพาะ Owner เท่านั้น' }, { status: 403 });
  }

  const { registrationId, action, rejectionReason } = (await request.json()) as {
    registrationId: string;
    action: 'approve' | 'reject';
    rejectionReason?: string;
  };

  if (!registrationId || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Get the registration
  const { data: registration, error: regError } = await serviceClient
    .from('trial_registrations')
    .select('*')
    .eq('id', registrationId)
    .eq('status', 'pending')
    .single();

  if (regError || !registration) {
    return NextResponse.json({ error: 'ไม่พบรายการลงทะเบียนนี้' }, { status: 404 });
  }

  if (action === 'reject') {
    await serviceClient
      .from('trial_registrations')
      .update({
        status: 'rejected',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejection_reason: rejectionReason || null,
      })
      .eq('id', registrationId);

    return NextResponse.json({ success: true, action: 'rejected' });
  }

  // --- Approve flow ---

  // 1. Create store
  const storeCode = `TRIAL-${Date.now().toString(36).toUpperCase()}`;
  const { data: store, error: storeError } = await serviceClient
    .from('stores')
    .insert({
      store_code: storeCode,
      store_name: registration.store_name,
      active: true,
    })
    .select('id')
    .single();

  if (storeError || !store) {
    console.error('[approve-trial] Store creation error:', storeError);
    return NextResponse.json({ error: 'ไม่สามารถสร้างร้านค้าได้' }, { status: 500 });
  }

  // 2. Create auth user
  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email: registration.email,
    password: registration.password_hash,
    email_confirm: true,
    user_metadata: {
      username: registration.email.split('@')[0],
      role: 'owner',
    },
  });

  if (authError || !authData.user) {
    console.error('[approve-trial] Auth creation error:', authError);
    // Rollback store
    await serviceClient.from('stores').delete().eq('id', store.id);
    return NextResponse.json({ error: 'ไม่สามารถสร้างบัญชีได้: ' + (authError?.message || '') }, { status: 500 });
  }

  const newUserId = authData.user.id;

  // 3. Update profile
  await serviceClient
    .from('profiles')
    .update({
      username: registration.email.split('@')[0],
      role: 'owner',
      display_name: registration.store_name,
      active: true,
    })
    .eq('id', newUserId);

  // 4. Assign user to store
  await serviceClient.from('user_stores').insert({
    user_id: newUserId,
    store_id: store.id,
  });

  // 5. Create default store settings
  await serviceClient.from('store_settings').insert({
    store_id: store.id,
    staff_registration_code: Math.random().toString(36).slice(2, 8).toUpperCase(),
  });

  // 6. Update registration status
  await serviceClient
    .from('trial_registrations')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', registrationId);

  // 7. Send SMS notification
  const smsResult = await sendSms({
    to: registration.phone,
    message: `บัญชีของท่านสามารถทดลองใช้ได้แล้ว\nhttps://app.kpcrm.net/th/login`,
  });

  // 8. Audit log
  await serviceClient.from('audit_logs').insert({
    store_id: store.id,
    action_type: 'TRIAL_APPROVED',
    table_name: 'trial_registrations',
    record_id: registrationId,
    new_value: {
      store_name: registration.store_name,
      email: registration.email,
      phone: registration.phone,
      sms_sent: smsResult.success,
    },
    changed_by: user.id,
  });

  return NextResponse.json({
    success: true,
    action: 'approved',
    smsSent: smsResult.success,
    smsError: smsResult.error,
  });
}
