import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyLineAccessToken, getLineProfileFromToken } from '@/lib/line/messaging';

export async function POST(request: NextRequest) {
  const { accessToken } = (await request.json()) as { accessToken: string };

  if (!accessToken) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
  }

  // 1. Verify LINE access token
  const isValid = await verifyLineAccessToken(accessToken);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid LINE access token' }, { status: 401 });
  }

  // 2. Get LINE profile
  const profile = await getLineProfileFromToken(accessToken);
  if (!profile) {
    return NextResponse.json({ error: 'Failed to get LINE profile' }, { status: 500 });
  }

  const supabase = createServiceClient();

  // 3. Check if user exists with this line_user_id
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('line_user_id', profile.userId)
    .single();

  let userId: string;

  if (existingProfile) {
    // User exists - sign in
    userId = existingProfile.id;
  } else {
    // Create new customer account
    const email = `line_${profile.userId}@stockmanager.app`;
    const password = `line_${profile.userId}_${Date.now()}`;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        line_user_id: profile.userId,
        display_name: profile.displayName,
        avatar_url: profile.pictureUrl,
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      );
    }

    userId = authData.user.id;

    // Update profile (trigger should have created it)
    await supabase
      .from('profiles')
      .update({
        role: 'customer',
        line_user_id: profile.userId,
        display_name: profile.displayName,
        avatar_url: profile.pictureUrl,
      })
      .eq('id', userId);
  }

  // 4. Generate a session token for the user
  // Use admin API to create a magic link or generate token
  const { data: sessionData, error: sessionError } =
    await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: existingProfile
        ? `line_${profile.userId}@stockmanager.app`
        : `line_${profile.userId}@stockmanager.app`,
    });

  if (sessionError) {
    return NextResponse.json(
      { error: 'Failed to generate session' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    userId,
    verifyUrl: sessionData.properties?.hashed_token,
    displayName: profile.displayName,
  });
}
