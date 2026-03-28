import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * POST /api/print-server/setup
 *
 * สร้าง service account สำหรับ print-server ของสาขา
 * แล้ว generate config.json ให้ดาวน์โหลด
 *
 * Body: { storeId: string, printerName?: string }
 * Returns: { config: PrintServerConfig }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify caller is owner/manager
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .single();

  if (!callerProfile || !['owner', 'manager'].includes(callerProfile.role)) {
    return NextResponse.json(
      { error: 'Only owners and managers can setup print servers' },
      { status: 403 }
    );
  }

  const { storeId, printerName = 'POS80' } = (await request.json()) as {
    storeId: string;
    printerName?: string;
  };

  if (!storeId) {
    return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
  }

  // Get store info
  const { data: store } = await supabase
    .from('stores')
    .select('store_code, store_name')
    .eq('id', storeId)
    .single();

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const serviceClient = createServiceClient();

  // Check if service account already exists for this store
  const { data: existingSettings } = await serviceClient
    .from('store_settings')
    .select('print_server_account_id, print_server_working_hours, receipt_settings')
    .eq('store_id', storeId)
    .single();

  const password = generatePassword();
  const username = `printer-${store.store_code.toLowerCase()}`;
  const email = `${username}@stockmanager.app`;

  let accountId: string;

  if (existingSettings?.print_server_account_id) {
    // Reset password for existing account
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(
      existingSettings.print_server_account_id,
      { password }
    );

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to reset print server password: ' + updateError.message },
        { status: 500 }
      );
    }

    accountId = existingSettings.print_server_account_id;
  } else {
    // Create new service account
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, role: 'staff' },
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        // Account exists but not linked — find and link it
        const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u) => u.email === email);

        if (existingUser) {
          // Reset password and link
          await serviceClient.auth.admin.updateUserById(existingUser.id, { password });
          accountId = existingUser.id;
        } else {
          return NextResponse.json({ error: authError.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }
    } else {
      accountId = authData.user!.id;
    }

    // Update profile
    await serviceClient
      .from('profiles')
      .update({
        username,
        role: 'staff',
        display_name: `Print Server (${store.store_name})`,
        active: true,
        created_by: authUser.id,
      })
      .eq('id', accountId!);

    // Assign to store
    await serviceClient.from('user_stores').upsert(
      { user_id: accountId!, store_id: storeId },
      { onConflict: 'user_id,store_id' }
    );

    // Save account reference
    await serviceClient
      .from('store_settings')
      .update({ print_server_account_id: accountId! })
      .eq('store_id', storeId);
  }

  // Get working hours config
  const workingHours = existingSettings?.print_server_working_hours || {
    enabled: true,
    startHour: 12,
    startMinute: 0,
    endHour: 6,
    endMinute: 0,
  };

  // Get receipt settings for paper width
  const receiptSettings = existingSettings?.receipt_settings as Record<string, unknown> | null;
  const paperWidth = (receiptSettings?.paper_width as number) || 80;

  // Build config.json
  const config = {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    STORE_ID: storeId,
    STORE_NAME: store.store_name,
    STORE_CODE: store.store_code,
    PRINT_ACCOUNT_EMAIL: email,
    PRINT_ACCOUNT_PASSWORD: password,
    PRINTER_NAME: printerName,
    PAPER_WIDTH: paperWidth,
    WORKING_HOURS: workingHours,
    POLL_INTERVAL: 10000,
    HEARTBEAT_INTERVAL: 60000,
  };

  return NextResponse.json({ config, accountId: accountId! });
}

/**
 * GET /api/print-server/setup?storeId=xxx
 *
 * ดึงสถานะ print server ของสาขา
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const storeId = request.nextUrl.searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
  }

  const { data: status } = await supabase
    .from('print_server_status')
    .select('*')
    .eq('store_id', storeId)
    .single();

  const { data: settings } = await supabase
    .from('store_settings')
    .select('print_server_account_id, print_server_working_hours')
    .eq('store_id', storeId)
    .single();

  return NextResponse.json({
    status: status || null,
    hasAccount: !!settings?.print_server_account_id,
    workingHours: settings?.print_server_working_hours || null,
  });
}

function generatePassword(): string {
  return crypto.randomBytes(16).toString('base64url');
}
