import { NextResponse } from 'next/server';
import { createServiceClient, createClient as createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    // Verify authenticated user
    const userClient = await createServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { store_id, action_type, table_name, record_id, old_value, new_value, changed_by } = body;

    if (!action_type) {
      return NextResponse.json({ error: 'action_type is required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    await supabase.from('audit_logs').insert({
      store_id: store_id || null,
      action_type,
      table_name: table_name || null,
      record_id: record_id || null,
      old_value: old_value || null,
      new_value: new_value || null,
      changed_by: changed_by || user.id,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
