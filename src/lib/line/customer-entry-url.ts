import { createServiceClient } from '@/lib/supabase/server';
import { generateCustomerUrl } from '@/lib/auth/customer-token';

/**
 * Customer entry URL builder
 *
 * Returns the URL that LINE messages should point to when the customer taps
 * "open deposit system" in a Flex card.
 *
 * Preference order:
 *   1. Central LIFF URL (`https://liff.line.me/{liffId}?store={storeCode}`)
 *      — scoped to the branch via ?store= so the customer page can show the
 *        correct store name and filter data.
 *      — the LIFF flow handles LINE login + access token natively.
 *   2. Tokenized fallback URL (`/customer?token=xxx&store={storeCode}`)
 *      — used when the central LIFF ID is not configured yet.
 *      — relies on an HMAC-signed customer token.
 *
 * Both modes end up at `/customer`, and the CustomerProvider picks the right
 * auth path based on the `?token=` vs `?store=` presence.
 */

/** In-memory cache for the central LIFF ID (refreshed every 5 minutes). */
let cachedLiffId: { value: string; fetchedAt: number } | null = null;
const LIFF_CACHE_MS = 5 * 60 * 1000;

/**
 * Fetch the central `davis_ai.liff_id` from system_settings, with a short
 * in-memory cache to avoid hammering the DB from the webhook hot path.
 */
export async function getCentralLiffId(): Promise<string> {
  const now = Date.now();
  if (cachedLiffId && now - cachedLiffId.fetchedAt < LIFF_CACHE_MS) {
    return cachedLiffId.value;
  }

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'davis_ai.liff_id')
      .maybeSingle();

    const value = (data?.value as string | null) || '';
    cachedLiffId = { value, fetchedAt: now };
    return value;
  } catch {
    return '';
  }
}

/** Invalidate the cached LIFF ID (call after settings are saved). */
export function invalidateCentralLiffIdCache(): void {
  cachedLiffId = null;
}

interface BuildCustomerEntryUrlParams {
  /** LINE user id — required only for the tokenized fallback path */
  lineUserId: string | null;
  /** Branch store_code, passed as ?store= so the UI shows the branch name */
  storeCode?: string | null;
  /** Sub-path under /customer (e.g. '', '/history', '/deposit') */
  path?: string;
}

/**
 * Build the URL that a customer should tap to enter the deposit system.
 *
 * If the central LIFF ID is configured, this returns a LIFF deep link with
 * `?store=` appended. Otherwise it falls back to the token URL (which requires
 * a valid lineUserId) and appends `&store=` too so the branch context still
 * flows through.
 */
export async function buildCustomerEntryUrl(
  params: BuildCustomerEntryUrlParams,
): Promise<string> {
  const { lineUserId, storeCode, path = '' } = params;
  const liffId = await getCentralLiffId();

  // --- Preferred path: LIFF deep link -------------------------------------
  if (liffId) {
    const qs = new URLSearchParams();
    if (storeCode) qs.set('store', storeCode);
    const query = qs.toString();
    // LIFF supports arbitrary query strings — the customer page will read
    // ?store= via useSearchParams(). The LIFF app itself ignores it.
    const subPath = path ? `/${path.replace(/^\/+/, '')}` : '';
    return `https://liff.line.me/${liffId}${subPath}${query ? `?${query}` : ''}`;
  }

  // --- Fallback: tokenized /customer URL ----------------------------------
  if (!lineUserId) {
    // No LIFF and no user id — just return the app root so the page can
    // render the "openFromLine" error state.
    const base =
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${base}/customer${path || ''}`;
  }

  const tokenUrl = generateCustomerUrl(lineUserId, `/customer${path || ''}`);
  if (!storeCode) return tokenUrl;
  // generateCustomerUrl already appends ?token=xxx, so we use & here
  return `${tokenUrl}&store=${encodeURIComponent(storeCode)}`;
}
