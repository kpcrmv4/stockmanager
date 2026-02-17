import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify the current user is an owner
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

  if (!callerProfile || callerProfile.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can create users' }, { status: 403 });
  }

  const { username, password, role, displayName, storeId } = (await request.json()) as {
    username: string;
    password: string;
    role: string;
    displayName: string | null;
    storeId: string | null;
  };

  if (!username || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const email = `${username.trim().toLowerCase()}@stockmanager.app`;

  // Create auth user
  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, role },
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return NextResponse.json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }, { status: 409 });
    }
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }

  // Update profile
  await serviceClient
    .from('profiles')
    .update({
      username: username.trim().toLowerCase(),
      role,
      display_name: displayName,
      active: true,
      created_by: authUser.id,
    })
    .eq('id', authData.user.id);

  // Assign store
  if (storeId) {
    await serviceClient.from('user_stores').insert({
      user_id: authData.user.id,
      store_id: storeId,
    });
  }

  return NextResponse.json({ userId: authData.user.id });
}
