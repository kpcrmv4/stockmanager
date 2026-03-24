/**
 * POST /api/chat/sync-photo
 *
 * เมื่อพนักงานถ่ายรูปยืนยันจากแชท → sync กลับไปที่ deposit/withdrawal record
 * Fire-and-forget จาก client (ไม่ block UI)
 */

import { NextResponse } from 'next/server';
import { createServiceClient, createClient as createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  // Auth: user session only
  const userClient = await createServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { reference_table, reference_id, photo_url } = body as {
      reference_table: string;
      reference_id: string;
      photo_url: string;
    };

    if (!reference_table || !reference_id || !photo_url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServiceClient();

    if (reference_table === 'deposits') {
      // Sync photo to deposit's confirm_photo_url
      await supabase
        .from('deposits')
        .update({ confirm_photo_url: photo_url })
        .eq('deposit_code', reference_id);
    } else if (reference_table === 'withdrawals') {
      // Sync photo to withdrawal's photo_url
      // reference_id for withdrawals is the deposit_code, find the latest pending withdrawal
      const { data: deposit } = await supabase
        .from('deposits')
        .select('id')
        .eq('deposit_code', reference_id)
        .single();

      if (deposit) {
        await supabase
          .from('withdrawals')
          .update({ photo_url })
          .eq('deposit_id', deposit.id)
          .in('status', ['pending', 'approved', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Sync Photo] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
