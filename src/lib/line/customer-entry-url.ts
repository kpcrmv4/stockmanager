import { createServiceClient } from '@/lib/supabase/server';
import { generateCustomerUrl } from '@/lib/auth/customer-token';

/**
 * Customer entry URL builder
 *
 * Returns the URL that LINE messages should point to when the customer taps
 * "open deposit system" in a Flex card.
 *
 * Multi-provider note: each store may live under its own LINE Developers
 * Provider (separate Messaging API channel + LINE Login channel + LIFF).
 * LINE userIds are scoped per Provider, so we must hand the customer the LIFF
 * that belongs to *their* store's Provider — otherwise liff.getProfile()
 * returns a userId that doesn't match the deposits table.
 *
 * Preference order (per call):
 *   1. `stores.liff_id` of the deposit's store (per-Provider LIFF)
 *   2. `system_settings.davis_ai.liff_id` (legacy global LIFF — fallback)
 *   3. Tokenized fallback (`/customer?token=…&store=…`) — used when neither
 *      LIFF id is configured.
 */

const LIFF_CACHE_MS = 5 * 60 * 1000;

/** In-memory cache for the central (legacy) LIFF ID. */
let cachedCentralLiff: { value: string; fetchedAt: number } | null = null;

/** In-memory cache for per-store LIFF IDs, keyed by store id. */
const cachedStoreLiff = new Map<string, { value: string; fetchedAt: number }>();

/**
 * Fetch the legacy global `davis_ai.liff_id` from system_settings.
 * Kept as a fallback for stores that haven't set their own LIFF yet.
 */
export async function getCentralLiffId(): Promise<string> {
  const now = Date.now();
  if (cachedCentralLiff && now - cachedCentralLiff.fetchedAt < LIFF_CACHE_MS) {
    return cachedCentralLiff.value;
  }
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'davis_ai.liff_id')
      .maybeSingle();
    const value = (data?.value as string | null) || '';
    cachedCentralLiff = { value, fetchedAt: now };
    return value;
  } catch {
    return '';
  }
}

/**
 * Resolve the LIFF ID to use for a specific store. Falls back to the central
 * LIFF if the store hasn't set its own.
 */
export async function getStoreLiffId(storeId: string | null | undefined): Promise<string> {
  if (!storeId) return getCentralLiffId();

  const now = Date.now();
  const cached = cachedStoreLiff.get(storeId);
  if (cached && now - cached.fetchedAt < LIFF_CACHE_MS) return cached.value;

  let value = '';
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('stores')
      .select('liff_id')
      .eq('id', storeId)
      .maybeSingle();
    value = ((data?.liff_id as string | null) || '').trim();
  } catch {
    /* ignore — fall through to central */
  }

  if (!value) value = await getCentralLiffId();
  cachedStoreLiff.set(storeId, { value, fetchedAt: now });
  return value;
}

/** Invalidate the cached central LIFF ID (call after settings are saved). */
export function invalidateCentralLiffIdCache(): void {
  cachedCentralLiff = null;
}

/** Invalidate the cached LIFF ID for a single store (or all stores if no id). */
export function invalidateStoreLiffIdCache(storeId?: string): void {
  if (storeId) cachedStoreLiff.delete(storeId);
  else cachedStoreLiff.clear();
}

interface BuildCustomerEntryUrlParams {
  /** LINE user id — required only for the tokenized fallback path */
  lineUserId: string | null;
  /** Store id — used to look up the store-specific LIFF id (preferred) */
  storeId?: string | null;
  /** Branch store_code, passed as ?store= so the UI shows the branch name */
  storeCode?: string | null;
  /** Sub-path under /customer (e.g. '', '/history', '/deposit') */
  path?: string;
}

/**
 * Build the URL that a customer should tap to enter the deposit system.
 *
 * Resolution: per-store LIFF (via storeId) → central LIFF → tokenized URL.
 */
export async function buildCustomerEntryUrl(
  params: BuildCustomerEntryUrlParams,
): Promise<string> {
  const { lineUserId, storeId, storeCode, path = '' } = params;
  const liffId = await getStoreLiffId(storeId ?? null);

  // --- Preferred path: LIFF deep link -------------------------------------
  if (liffId) {
    const qs = new URLSearchParams();
    if (storeCode) qs.set('store', storeCode);
    const query = qs.toString();
    const subPath = path ? `/${path.replace(/^\/+/, '')}` : '';
    return `https://liff.line.me/${liffId}${subPath}${query ? `?${query}` : ''}`;
  }

  // --- Fallback: tokenized /customer URL ----------------------------------
  if (!lineUserId) {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${base}/customer${path || ''}`;
  }

  const tokenUrl = generateCustomerUrl(lineUserId, `/customer${path || ''}`);
  if (!storeCode) return tokenUrl;
  // generateCustomerUrl already appends ?token=xxx, so we use & here
  return `${tokenUrl}&store=${encodeURIComponent(storeCode)}`;
}
