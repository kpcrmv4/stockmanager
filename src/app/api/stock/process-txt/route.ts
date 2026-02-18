import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

interface TxtItem {
  product_code: string;
  product_name: string;
  quantity: number;
  unit: string;
  category: string;
}

interface ProcessTxtRequest {
  store_id: string;
  items: TxtItem[];
  upload_date: string;
  include_zero_qty: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();

  try {
    const body: ProcessTxtRequest = await request.json();
    const { store_id, items, upload_date, include_zero_qty } = body;

    // Validate required fields
    if (!store_id || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: store_id and items array' },
        { status: 400 }
      );
    }

    if (!upload_date) {
      return NextResponse.json(
        { error: 'Missing required field: upload_date' },
        { status: 400 }
      );
    }

    // ── Step 1: Fetch existing products for the store ──
    const { data: existingProducts, error: fetchError } = await supabase
      .from('products')
      .select('id, product_code, product_name, active, unit, category')
      .eq('store_id', store_id);

    if (fetchError) {
      console.error('Error fetching products:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch existing products' },
        { status: 500 }
      );
    }

    // Build lookup map by product_code
    const productMap = new Map<
      string,
      {
        id: string;
        product_code: string;
        product_name: string;
        active: boolean;
        unit: string | null;
        category: string | null;
      }
    >();
    (existingProducts || []).forEach((p) => {
      productMap.set(p.product_code, p);
    });

    // ── Step 2: Classify each item ──
    const matched: TxtItem[] = [];
    const newItems: TxtItem[] = [];
    const zeroQty: TxtItem[] = [];

    for (const item of items) {
      const existing = productMap.get(item.product_code);

      if (item.quantity === 0) {
        zeroQty.push(item);
      }

      if (existing) {
        matched.push(item);
      } else if (
        item.product_code &&
        item.product_name &&
        item.unit &&
        item.category
      ) {
        newItems.push(item);
      }
      // Items without required fields and not existing are silently skipped
    }

    // ── Step 3: Auto-add new products ──
    let newAddedCount = 0;
    const auditLogs: Array<{
      store_id: string;
      action_type: string;
      table_name: string;
      record_id: string | null;
      old_value: Record<string, unknown> | null;
      new_value: Record<string, unknown>;
      changed_by: string | null;
    }> = [];

    if (newItems.length > 0) {
      const newProductRows = newItems.map((item) => ({
        store_id,
        product_code: item.product_code,
        product_name: item.product_name,
        unit: item.unit,
        category: item.category,
        active: item.quantity > 0,
      }));

      const { data: insertedProducts, error: insertError } = await supabase
        .from('products')
        .insert(newProductRows)
        .select('id, product_code, product_name, active');

      if (insertError) {
        console.error('Error inserting new products:', insertError);
        return NextResponse.json(
          { error: 'Failed to auto-add new products' },
          { status: 500 }
        );
      }

      newAddedCount = insertedProducts?.length || 0;

      // Add to product map and create audit logs
      (insertedProducts || []).forEach((p) => {
        productMap.set(p.product_code, {
          ...p,
          unit: null,
          category: null,
        });

        auditLogs.push({
          store_id,
          action_type: 'AUTO_ADD_PRODUCT',
          table_name: 'products',
          record_id: p.id,
          old_value: null,
          new_value: {
            product_code: p.product_code,
            product_name: p.product_name,
            active: p.active,
            source: 'txt_upload',
          },
          changed_by: null,
        });
      });
    }

    // ── Step 4: Auto-deactivate (existing active products with qty=0) ──
    let deactivatedCount = 0;
    const toDeactivate = zeroQty.filter((item) => {
      const existing = productMap.get(item.product_code);
      return existing && existing.active === true;
    });

    if (toDeactivate.length > 0) {
      const deactivateCodes = toDeactivate.map((item) => item.product_code);

      const { error: deactivateError } = await supabase
        .from('products')
        .update({ active: false })
        .eq('store_id', store_id)
        .in('product_code', deactivateCodes);

      if (deactivateError) {
        console.error('Error deactivating products:', deactivateError);
      } else {
        deactivatedCount = toDeactivate.length;

        toDeactivate.forEach((item) => {
          const existing = productMap.get(item.product_code);
          auditLogs.push({
            store_id,
            action_type: 'AUTO_DEACTIVATE',
            table_name: 'products',
            record_id: existing?.id || null,
            old_value: { active: true },
            new_value: {
              active: false,
              reason: 'qty_zero_from_txt',
              product_code: item.product_code,
            },
            changed_by: null,
          });
        });
      }
    }

    // ── Step 5: Auto-reactivate (existing inactive products with qty>0) ──
    let reactivatedCount = 0;
    const toReactivate = matched.filter((item) => {
      const existing = productMap.get(item.product_code);
      return existing && existing.active === false && item.quantity > 0;
    });

    if (toReactivate.length > 0) {
      const reactivateCodes = toReactivate.map((item) => item.product_code);

      const { error: reactivateError } = await supabase
        .from('products')
        .update({ active: true })
        .eq('store_id', store_id)
        .in('product_code', reactivateCodes);

      if (reactivateError) {
        console.error('Error reactivating products:', reactivateError);
      } else {
        reactivatedCount = toReactivate.length;

        toReactivate.forEach((item) => {
          const existing = productMap.get(item.product_code);
          auditLogs.push({
            store_id,
            action_type: 'AUTO_REACTIVATE',
            table_name: 'products',
            record_id: existing?.id || null,
            old_value: { active: false },
            new_value: {
              active: true,
              reason: 'qty_positive_from_txt',
              product_code: item.product_code,
            },
            changed_by: null,
          });
        });
      }
    }

    // ── Insert audit logs ──
    if (auditLogs.length > 0) {
      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert(auditLogs);

      if (auditError) {
        console.error('Error inserting audit logs:', auditError);
        // Non-fatal: continue processing
      }
    }

    // ── Step 6: Save to ocr_logs + ocr_items ──
    // Determine which items to save
    const itemsToSave = items.filter(
      (item) => item.quantity > 0 || include_zero_qty
    );

    // Create ocr_logs entry
    const { data: ocrLog, error: ocrLogError } = await supabase
      .from('ocr_logs')
      .insert({
        store_id,
        upload_date,
        count_items: items.length,
        processed_items: itemsToSave.length,
        status: itemsToSave.length > 0 ? 'completed' : 'no_items',
        upload_method: 'txt',
      })
      .select()
      .single();

    if (ocrLogError || !ocrLog) {
      console.error('Error creating OCR log:', ocrLogError);
      return NextResponse.json(
        { error: 'Failed to create upload log entry' },
        { status: 500 }
      );
    }

    // Insert ocr_items
    if (itemsToSave.length > 0) {
      const ocrItemRows = itemsToSave.map((item) => ({
        ocr_log_id: ocrLog.id,
        product_code: item.product_code || null,
        product_name: item.product_name || null,
        qty_ocr: item.quantity,
        unit: item.unit || null,
        confidence: 100, // TXT data is exact, 100% confidence
        status: 'confirmed',
      }));

      const { error: ocrItemsError } = await supabase
        .from('ocr_items')
        .insert(ocrItemRows);

      if (ocrItemsError) {
        console.error('Error inserting OCR items:', ocrItemsError);
        return NextResponse.json(
          { error: 'Failed to save item data' },
          { status: 500 }
        );
      }
    }

    // ── Step 7: Return response ──
    return NextResponse.json({
      success: true,
      ocr_log_id: ocrLog.id,
      summary: {
        total_items: items.length,
        matched: matched.length,
        new_added: newAddedCount,
        zero_qty: zeroQty.length,
        deactivated: deactivatedCount,
        reactivated: reactivatedCount,
      },
    });
  } catch (error) {
    console.error('TXT processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error during TXT processing' },
      { status: 500 }
    );
  }
}
