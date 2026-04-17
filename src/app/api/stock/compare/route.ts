import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { notifyBorrowWatchers, notifyStoreStaff } from '@/lib/notifications/service';
import { sendBotMessage, buildStockExplainActionCard } from '@/lib/chat/bot';

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
    // 1-3. Fetch manual counts, OCR logs, and store settings in parallel
    const [manualResult, ocrLogResult, settingsResult] = await Promise.all([
      supabase
        .from('manual_counts')
        .select('product_code, count_quantity')
        .eq('store_id', store_id)
        .eq('count_date', comp_date),
      supabase
        .from('ocr_logs')
        .select('id')
        .eq('store_id', store_id)
        .gte('upload_date', `${comp_date}T00:00:00`)
        .lt('upload_date', `${comp_date}T23:59:59.999`)
        .order('upload_date', { ascending: false })
        .limit(1),
      supabase
        .from('store_settings')
        .select('diff_tolerance')
        .eq('store_id', store_id)
        .single(),
    ]);

    if (manualResult.error) {
      console.error('Error fetching manual counts:', manualResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch manual counts' },
        { status: 500 }
      );
    }
    if (ocrLogResult.error) {
      console.error('Error fetching OCR logs:', ocrLogResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch OCR logs' },
        { status: 500 }
      );
    }

    const manualCounts = manualResult.data;
    const latestOcrLogId = ocrLogResult.data?.[0]?.id ?? null;
    const diffTolerance = settingsResult.data?.diff_tolerance ?? 5;

    // Fetch OCR items (depends on ocrLogResult)
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
      } else if (isPosOnly && posQty !== null) {
        // POS has qty but manual count is missing → treat as shortage
        difference = 0 - posQty;
        diffPercent = -100;
      }

      // Determine status
      let status: string;
      if (isPosOnly) {
        // POS มีแต่ยังไม่ได้นับมือ → ค้างเป็น pending ให้ไปนับเพิ่ม
        status = 'pending';
        overToleranceCount++;
      } else if (isManualOnly) {
        // นับมือมีแต่ POS ไม่มี → auto-approve (อาจเป็นสินค้าที่ POS ยังไม่ลง)
        status = 'approved';
      } else if (difference === null) {
        // Both sides missing (shouldn't happen) → auto-approve
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
      // 3. แจ้งเตือน In-App + PWA ไปยัง Owner/Manager ตามที่ตั้งค่าไว้
      try {
        await notifyBorrowWatchers({
          storeId: store_id,
          type: 'stock_alert',
          title: '⚠️ พบสต๊อกผลต่างสูง รออนุมัติ',
          body: `พบ ${overToleranceCount} รายการ เกินเกณฑ์ที่กำหนด`,
          data: { url: '/stock/comparison' },
        });
      } catch (err) {
        console.error('[StockCompare] Failed to notify watchers:', err);
      }

      // ส่ง Action Card เข้าแชทสาขา
      try {
        const overItems = comparisonRows
          .filter((r) => r.status === 'pending')
          .slice(0, 3)
          .map((r) => r.product_name)
          .join(', ');
        const preview = overItems + (overToleranceCount > 3 ? ` +${overToleranceCount - 3} อื่นๆ` : '');

        const actionCard = buildStockExplainActionCard({
          comp_date,
          store_id,
          discrepancy_count: overToleranceCount,
          items_preview: preview,
        });

        await sendBotMessage({ storeId: store_id, ...actionCard });
      } catch (chatErr) {
        console.error('[Compare] Failed to send chat action card:', chatErr);
      }
    }

    // 10. Notify staff to count supplementary items (POS มีแต่ยังไม่ได้นับมือ)
    if (posOnlyCount > 0) {
      const posOnlyItems = comparisonRows
        .filter((r) => r.manual_quantity === null && r.pos_quantity !== null);
      const posOnlyNames = posOnlyItems
        .slice(0, 5)
        .map((r) => r.product_name || r.product_code)
        .join(', ');
      const preview = posOnlyNames + (posOnlyCount > 5 ? ` +${posOnlyCount - 5} อื่นๆ` : '');

      // Push notification แจ้งพนักงาน
      try {
        await notifyStoreStaff({
          storeId: store_id,
          type: 'stock_alert',
          title: 'มีรายการที่ต้องนับเพิ่ม',
          body: `พบ ${posOnlyCount} รายการจาก POS ที่ยังไม่ได้นับมือ: ${preview}`,
          data: {
            date: comp_date,
            pos_only_count: posOnlyCount,
            url: '/stock/daily-check',
          },
        });
      } catch (notifyErr) {
        console.error('[Compare] Failed to notify staff for supplementary count:', notifyErr);
      }

      // Bot message แจ้งในแชทสาขา
      try {
        await sendBotMessage({
          storeId: store_id,
          type: 'system',
          content: `⚠️ พบ ${posOnlyCount} รายการจาก POS ที่ยังไม่ได้นับมือ (${comp_date})\n${preview}\n\nกรุณาเข้าหน้านับสต๊อกเพื่อนับรายการเพิ่มเติม`,
        });
      } catch (chatErr) {
        console.error('[Compare] Failed to send supplementary count bot message:', chatErr);
      }
    }

    // 11. Return response with summary
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
