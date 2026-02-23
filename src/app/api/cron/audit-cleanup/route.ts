import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all stores with retention settings
  const { data: stores } = await supabase
    .from('stores')
    .select('id, store_name, settings:store_settings(audit_log_retention_days)')
    .eq('active', true);

  if (!stores) {
    return NextResponse.json({ status: 'no stores' });
  }

  const results: Array<{ store: string; deleted: number; error?: string }> = [];

  for (const store of stores) {
    const settings = Array.isArray(store.settings) ? store.settings[0] : store.settings;
    const retentionDays = settings?.audit_log_retention_days;

    // Skip if no retention configured (keep forever)
    if (!retentionDays || typeof retentionDays !== 'number') {
      results.push({ store: store.store_name, deleted: 0, error: 'No retention configured' });
      continue;
    }

    // Calculate cutoff date
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffISO = cutoff.toISOString();

    try {
      // Delete old audit logs for this store
      const { count, error } = await supabase
        .from('audit_logs')
        .delete({ count: 'exact' })
        .eq('store_id', store.id)
        .lt('created_at', cutoffISO);

      if (error) {
        results.push({ store: store.store_name, deleted: 0, error: error.message });
        continue;
      }

      const deletedCount = count ?? 0;

      // Log the cleanup action (this log itself won't be deleted immediately since it's new)
      if (deletedCount > 0) {
        await supabase.from('audit_logs').insert({
          store_id: store.id,
          action_type: 'AUDIT_LOG_CLEANUP',
          table_name: 'audit_logs',
          record_id: store.id,
          new_value: {
            deleted_count: deletedCount,
            retention_days: retentionDays,
            cutoff_date: cutoffISO,
          },
          changed_by: null,
        });
      }

      results.push({ store: store.store_name, deleted: deletedCount });
    } catch (error) {
      results.push({
        store: store.store_name,
        deleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({ status: 'ok', results });
}
