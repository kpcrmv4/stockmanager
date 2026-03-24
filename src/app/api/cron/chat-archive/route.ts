/**
 * GET /api/cron/chat-archive
 *
 * Cron job: archive chat messages older than 3 months
 * Sets archived_at = now() instead of deleting (soft archive)
 *
 * Schedule: ทุกวันอาทิตย์ 04:00 UTC (11:00 BKK)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 3 months ago
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  // Archive text/image/system messages older than 3 months
  // Skip action_cards — they may still be referenced
  const { data: archived, error } = await supabase
    .from('chat_messages')
    .update({ archived_at: new Date().toISOString() })
    .is('archived_at', null)
    .lt('created_at', cutoff.toISOString())
    .in('type', ['text', 'image', 'system'])
    .select('id');

  if (error) {
    console.error('[Chat Archive] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    archived_count: archived?.length ?? 0,
    cutoff_date: cutoff.toISOString(),
  });
}
