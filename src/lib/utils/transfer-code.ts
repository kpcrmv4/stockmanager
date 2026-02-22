import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generate a unique transfer code in format TRF-YYMMDD-NNNN
 * Sequential per day, timezone: Asia/Bangkok
 */
export async function generateTransferCode(supabase: SupabaseClient): Promise<string> {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' })
    .format(now)
    .replace(/-/g, '')
    .slice(2); // YYMMDD

  const prefix = `TRF-${dateStr}-`;

  const { count } = await supabase
    .from('transfers')
    .select('*', { count: 'exact', head: true })
    .like('transfer_code', `${prefix}%`);

  const seq = String((count || 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}
