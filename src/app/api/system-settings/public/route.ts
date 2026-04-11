import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/system-settings/public
 *
 * Returns the subset of `system_settings` that is safe to expose to
 * unauthenticated clients (e.g. the customer LIFF page needs the LIFF ID).
 *
 * Only returns keys under the `davis_ai.*` namespace, and only the fields
 * that are explicitly whitelisted below.
 */
const PUBLIC_KEYS = ['davis_ai.bot_name', 'davis_ai.liff_id'] as const;

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', PUBLIC_KEYS as unknown as string[]);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  const result: Record<string, string> = {};
  for (const row of data || []) {
    result[row.key] = row.value || '';
  }

  return NextResponse.json(
    {
      bot_name: result['davis_ai.bot_name'] || 'DAVIS Ai',
      liff_id: result['davis_ai.liff_id'] || '',
    },
    {
      headers: {
        // Cache for 5 min at edge — settings change rarely
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
