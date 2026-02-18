import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { notifyStoreOwners } from '@/lib/notifications/service';

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();

  const body = await request.json();
  const { store_id, comp_date } = body;

  if (!store_id || !comp_date) {
    return NextResponse.json(
      { error: 'store_id and comp_date are required' },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch manual counts for the store + date
    const { data: manualCounts, error: manualError } = await supabase
      .from('manual_counts')
      .select('product_code, count_quantity')
      .eq('store_id', store_id)
      .eq('count_date', comp_date);

    if (manualError) {
      console.error('Error fetching manual counts:', manualError);
      return NextResponse.json(
        { error: 'Failed to fetch manual counts' },
        { status: 500 }
      );
    }

    // 2. Fetch POS data: get the latest ocr_log for this store + date
    const { data: ocrLogs, error: ocrLogError } = await supabase
      .from('ocr_logs')
      .select('id')
      .eq('store_id', store_id)
      .gte('upload_date', `${comp_date}T00:00:00`)
      .lt('upload_date', `${comp_date}T23:59:59.999`)
      .order('upload_date', { ascending: false })
      .limit(1);

    if (ocrLogError) {
      console.error('Error fetching OCR logs:', ocrLogError);
      return NextResponse.json(
        { error: 'Failed to fetch OCR logs' },
        { status: 500 }
      );
    }

    const latestOcrLogId = ocrLogs?.[0]?.id ?? null;

    let ocrItems: Array<{ product_code: string; qty_ocr: number }> = [];
    if (latestOcrLogId) {
      const { data: ocrData, error: ocrItemsError } = await supabase
        .from('ocr_items')
        .select('product_code, qty_ocr')
        .eq('ocr_log_id', latestOcrLogId);

      if (ocrItemsError) {
        console.error('Error fetching OCR items:', ocrItemsError);
        return NextResponse.json(
          { error: 'Failed to fetch OCR items' },
          { status: 500 }
        );
      }

      ocrItems = ocrData || [];
    }

    // 3. Fetch store settings for diff_tolerance
    const { data: storeSettings } = await supabase
      .from('store_settings')
      .select('diff_tolerance')
      .eq('store_id', store_id)
      .single();

    const diffTolerance = storeSettings?.diff_tolerance ?? 5;

    // 4. Build product set: union of all product_codes from both datasets
    const manualMap = new Map<string, number>();
    for (const mc of manualCounts || []) {
      if (mc.product_code) {
        manualMap.set(mc.product_code, mc.count_quantity);
      }
    }

    const posMap = new Map<string, number>();
    for (const oi of ocrItems) {
      if (oi.product_code) {
        posMap.set(oi.product_code, oi.qty_ocr);
      }
    }

    const allProductCodes = new Set<string>([
      ...manualMap.keys(),
      ...posMap.keys(),
    ]);

    // Fetch product names for all product codes
    const productNameMap = new Map<string, string>();
    if (allProductCodes.size > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('product_code, product_name')
        .eq('store_id', store_id)
        .in('product_code', Array.from(allProductCodes));

      if (products) {
        for (const p of products) {
          productNameMap.set(p.product_code, p.product_name);
        }
      }
    }

    // 5. Build comparison rows
    const comparisonRows: Array<{
      store_id: string;
      comp_date: string;
      product_code: string;
      product_name: string | null;
      manual_quantity: number | null;
      pos_quantity: number | null;
      difference: number | null;
      diff_percent: number | null;
      status: string;
    }> = [];

    let matchCount = 0;
    let withinToleranceCount = 0;
    let overToleranceCount = 0;
    let manualOnlyCount = 0;
    let posOnlyCount = 0;

    for (const productCode of allProductCodes) {
      const manualQty = manualMap.has(productCode)
        ? manualMap.get(productCode)!
        : null;
      const posQty = posMap.has(productCode)
        ? posMap.get(productCode)!
        : null;

      const productName = productNameMap.get(productCode) || null;

      // Track manual-only and pos-only
      const isManualOnly = manualQty !== null && posQty === null;
      const isPosOnly = manualQty === null && posQty !== null;

      if (isManualOnly) manualOnlyCount++;
      if (isPosOnly) posOnlyCount++;

      // Calculate difference and diff_percent
      let difference: number | null = null;
      let diffPercent: number | null = null;

      if (manualQty !== null && posQty !== null) {
        difference = manualQty - posQty;

        if (posQty !== 0) {
          diffPercent = (difference / posQty) * 100;
        }
      }

      // Determine status
      let status: string;
      if (difference === null) {
        // One side is missing -- auto-approve (null difference)
        status = 'approved';
      } else if (difference === 0) {
        // Exact match
        status = 'approved';
        matchCount++;
      } else if (
        diffPercent !== null &&
        Math.abs(diffPercent) <= diffTolerance
      ) {
        // Within tolerance
        status = 'approved';
        withinToleranceCount++;
      } else {
        // Over tolerance -- needs explanation
        status = 'pending';
        overToleranceCount++;
      }

      comparisonRows.push({
        store_id,
        comp_date,
        product_code: productCode,
        product_name: productName,
        manual_quantity: manualQty,
        pos_quantity: posQty,
        difference,
        diff_percent: diffPercent !== null ? Math.round(diffPercent * 100) / 100 : null,
        status,
      });
    }

    // 6. Delete existing comparisons for this store + date (re-compare scenario)
    const { error: deleteError } = await supabase
      .from('comparisons')
      .delete()
      .eq('store_id', store_id)
      .eq('comp_date', comp_date);

    if (deleteError) {
      console.error('Error deleting existing comparisons:', deleteError);
      return NextResponse.json(
        { error: 'Failed to clear existing comparisons' },
        { status: 500 }
      );
    }

    // 7. Insert all comparison rows
    if (comparisonRows.length > 0) {
      const { error: insertError } = await supabase
        .from('comparisons')
        .insert(comparisonRows);

      if (insertError) {
        console.error('Error inserting comparisons:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert comparison data' },
          { status: 500 }
        );
      }
    }

    // 8. Audit log for comparison generation
    const summary = {
      total: comparisonRows.length,
      match: matchCount,
      within_tolerance: withinToleranceCount,
      over_tolerance: overToleranceCount,
      manual_only: manualOnlyCount,
      pos_only: posOnlyCount,
    };

    await supabase.from('audit_logs').insert({
      store_id: store_id,
      action_type: 'STOCK_COMPARISON_GENERATED',
      table_name: 'comparisons',
      new_value: { comp_date, ...summary },
      changed_by: null, // system action
    });

    // 9. Notify owners if there are items over tolerance
    if (overToleranceCount > 0) {
      try {
        await notifyStoreOwners({
          storeId: store_id,
          type: 'stock_alert',
          title: 'ผลเปรียบเทียบสต๊อก',
          body: `พบส่วนต่าง ${overToleranceCount} รายการ เกินเกณฑ์ที่กำหนด`,
          data: {
            date: comp_date,
            total_diffs: overToleranceCount,
            url: '/stock/comparison',
          },
        });
      } catch (notifyErr) {
        console.error('[Compare] Failed to notify owners:', notifyErr);
      }
    }

    // 10. Return response with summary
    return NextResponse.json({
      success: true,
      comp_date,
      summary,
    });
  } catch (error) {
    console.error('Compare error:', error);
    return NextResponse.json(
      { error: 'Failed to generate comparison' },
      { status: 500 }
    );
  }
}
