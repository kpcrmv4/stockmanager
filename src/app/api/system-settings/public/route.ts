import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/system-settings/public
 * GET /api/system-settings/public?store=BCR
 *
 * Returns the subset of `system_settings` that is safe to expose to
 * unauthenticated clients (e.g. the customer LIFF page needs the LIFF ID).
 *
 * If `?store=<store_code>` is provided, the per-store LIFF ID overrides the
 * central one when set. This is required for multi-Provider LIFF: each store
 * may live under its own LINE Developers Provider, and LINE userIds are
 * scoped per Provider — handing the customer the wrong LIFF would return a
 * userId that doesn't match their existing deposits.
 *
 * Only returns keys under the `davis_ai.*` namespace, plus per-store
 * branding/LIFF info — no sensitive fields are exposed.
 */
const PUBLIC_KEYS = ['davis_ai.bot_name', 'davis_ai.liff_id'] as const;

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const storeCode = request.nextUrl.searchParams.get('store')?.trim() || null;

  const [globalRes, storeRes] = await Promise.all([
    supabase
      .from('system_settings')
      .select('key, value')
      .in('key', PUBLIC_KEYS as unknown as string[]),
    storeCode
      ? supabase
          .from('stores')
          .select('liff_id, store_name')
          .eq('store_code', storeCode)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (globalRes.error) {
    return NextResponse.json({ error: globalRes.error.message }, { status: 500 });
  }

  const globalMap: Record<string, string> = {};
  for (const row of globalRes.data || []) {
    globalMap[row.key] = row.value || '';
  }

  const centralLiff = globalMap['davis_ai.liff_id'] || '';
  const storeLiff = ((storeRes.data?.liff_id as string | null) || '').trim();

  return NextResponse.json(
    {
      bot_name: globalMap['davis_ai.bot_name'] || 'DAVIS Ai',
      liff_id: storeLiff || centralLiff,
      // Echo back so client can tell whether it landed on the store-specific
      // LIFF (preferred for multi-Provider setups) or the central fallback
      liff_source: storeLiff ? 'store' : (centralLiff ? 'central' : 'none'),
      store_name: (storeRes.data?.store_name as string | undefined) || null,
    },
    {
      headers: {
        // Cache for 5 min at edge — settings change rarely
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
