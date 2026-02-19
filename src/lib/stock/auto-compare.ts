import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoCompareResult {
  compared: boolean;
  reason: 'compared' | 'no_data' | 'no_manual' | 'no_pos';
  summary?: {
    total: number;
    match: number;
    within_tolerance: number;
    over_tolerance: number;
    manual_only: number;
    pos_only: number;
  };
  /** POS items that are active + count_status='active' but not in manual count */
  missingItems?: Array<{
    product_code: string;
    product_name: string;
  }>;
}

// ---------------------------------------------------------------------------
// runAutoCompare — bi-directional auto-compare
// ---------------------------------------------------------------------------

/**
 * Check if both POS and manual data exist for a given date.
 * If both exist, call the compare API and detect supplementary items.
 *
 * Called after:
 *   - Staff saves manual counts (daily-check)
 *   - Owner/accountant uploads POS TXT (txt-upload)
 */
export async function runAutoCompare(
  storeId: string,
  date: string,
): Promise<AutoCompareResult> {
  const supabase = createClient();

  // 1. Check manual counts
  const { count: manualCount } = await supabase
    .from('manual_counts')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('count_date', date);

  // 2. Check POS data (ocr_logs)
  const { data: ocrLogs } = await supabase
    .from('ocr_logs')
    .select('id')
    .eq('store_id', storeId)
    .eq('upload_date', date)
    .order('created_at', { ascending: false })
    .limit(1);

  const hasManual = (manualCount || 0) > 0;
  const hasPOS = (ocrLogs?.length || 0) > 0;

  if (!hasManual && !hasPOS) {
    return { compared: false, reason: 'no_data' };
  }
  if (!hasManual) {
    return { compared: false, reason: 'no_manual' };
  }
  if (!hasPOS) {
    return { compared: false, reason: 'no_pos' };
  }

  // 3. Both exist → call compare API
  const response = await fetch('/api/stock/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: storeId, comp_date: date }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to generate comparison');
  }

  // 4. Detect POS items not counted in manual (supplementary count)
  const latestLogId = ocrLogs![0].id;

  const { data: ocrItems } = await supabase
    .from('ocr_items')
    .select('product_code, product_name')
    .eq('ocr_log_id', latestLogId);

  const { data: manualItems } = await supabase
    .from('manual_counts')
    .select('product_code')
    .eq('store_id', storeId)
    .eq('count_date', date);

  const manualCodes = new Set((manualItems || []).map((m) => m.product_code));

  // Fetch active + counting products
  const { data: activeProducts } = await supabase
    .from('products')
    .select('product_code, product_name')
    .eq('store_id', storeId)
    .eq('active', true)
    .eq('count_status', 'active');

  const activeMap = new Map(
    (activeProducts || []).map((p) => [p.product_code, p.product_name]),
  );

  // POS items that SHOULD be counted but WEREN'T
  const seen = new Set<string>();
  const missingItems: Array<{ product_code: string; product_name: string }> = [];

  for (const oi of ocrItems || []) {
    if (
      oi.product_code &&
      activeMap.has(oi.product_code) &&
      !manualCodes.has(oi.product_code) &&
      !seen.has(oi.product_code)
    ) {
      seen.add(oi.product_code);
      missingItems.push({
        product_code: oi.product_code,
        product_name: activeMap.get(oi.product_code) || oi.product_name || oi.product_code,
      });
    }
  }

  return {
    compared: true,
    reason: 'compared',
    summary: result.summary,
    missingItems: missingItems.length > 0 ? missingItems : undefined,
  };
}

// ---------------------------------------------------------------------------
// checkExistingPOSUpload — prevent duplicate uploads
// ---------------------------------------------------------------------------

/**
 * Check if POS data already exists for a given date/store.
 * Used to prevent duplicate uploads per business date.
 */
export async function checkExistingPOSUpload(
  storeId: string,
  date: string,
): Promise<{ exists: boolean; logId?: string }> {
  const supabase = createClient();

  const { data: ocrLogs } = await supabase
    .from('ocr_logs')
    .select('id')
    .eq('store_id', storeId)
    .eq('upload_date', date)
    .limit(1);

  if (ocrLogs && ocrLogs.length > 0) {
    return { exists: true, logId: ocrLogs[0].id };
  }

  return { exists: false };
}
