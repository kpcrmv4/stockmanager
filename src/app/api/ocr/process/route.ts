import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const storeId = formData.get('storeId') as string;

  if (!file || !storeId) {
    return NextResponse.json({ error: 'Missing file or storeId' }, { status: 400 });
  }

  // Convert file to base64 for Vision API
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');

  try {
    // Call Google Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            },
          ],
        }),
      }
    );

    const visionResult = await visionResponse.json();
    const fullText =
      visionResult.responses?.[0]?.fullTextAnnotation?.text || '';

    if (!fullText) {
      return NextResponse.json({ error: 'No text detected in image' }, { status: 422 });
    }

    // Parse POS receipt text (basic pattern matching)
    const lines = fullText.split('\n').filter((l: string) => l.trim());
    const items: Array<{
      productName: string;
      quantity: number;
      unit: string;
      confidence: number;
    }> = [];

    // Simple parsing: look for lines with product name + quantity
    // This is a basic implementation - customize for actual POS format
    for (const line of lines) {
      const match = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(ขวด|แก้ว|ลัง|แพ็ค)?$/);
      if (match) {
        items.push({
          productName: match[1].trim(),
          quantity: parseFloat(match[2]),
          unit: match[3] || 'ขวด',
          confidence: 0.8,
        });
      }
    }

    // Create OCR log
    const { data: ocrLog, error: logError } = await supabase
      .from('ocr_logs')
      .insert({
        store_id: storeId,
        count_items: items.length,
        processed_items: items.length,
        status: items.length > 0 ? 'completed' : 'no_items',
        upload_method: 'web',
      })
      .select()
      .single();

    if (logError || !ocrLog) {
      return NextResponse.json({ error: 'Failed to create OCR log' }, { status: 500 });
    }

    // Insert OCR items
    if (items.length > 0) {
      await supabase.from('ocr_items').insert(
        items.map((item) => ({
          ocr_log_id: ocrLog.id,
          product_name: item.productName,
          qty_ocr: item.quantity,
          unit: item.unit,
          confidence: item.confidence * 100,
          status: 'pending',
        }))
      );
    }

    return NextResponse.json({
      ocrLogId: ocrLog.id,
      rawText: fullText,
      items,
      itemCount: items.length,
    });
  } catch (error) {
    console.error('OCR processing error:', error);
    return NextResponse.json(
      { error: 'OCR processing failed' },
      { status: 500 }
    );
  }
}
