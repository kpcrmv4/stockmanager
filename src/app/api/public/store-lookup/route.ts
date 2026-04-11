import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/public/store-lookup?code=XX
 *
 * Resolves a store_code (passed via the shared LIFF URL query param) into
 * the minimum public info needed to render the customer-facing UI:
 *   { id, name, code }
 *
 * This endpoint is intentionally unauthenticated because it runs before
 * LIFF auth completes on the customer page. It ONLY exposes non-sensitive
 * fields (no LINE tokens, no manager info).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { error: 'Missing ?code parameter' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('stores')
    .select('id, store_code, store_name, active')
    .eq('store_code', code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || !data.active) {
    return NextResponse.json(
      { error: 'Store not found' },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      id: data.id,
      code: data.store_code,
      name: data.store_name,
    },
    {
      headers: {
        // Cache for 5 min at edge — store names change rarely
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
