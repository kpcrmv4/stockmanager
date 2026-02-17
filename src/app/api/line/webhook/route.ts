import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { pushMessage, replyMessage } from '@/lib/line/messaging';

interface LineEvent {
  type: string;
  replyToken?: string;
  source: { type: string; userId?: string; groupId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string };
}

function verifySignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('SHA256', process.env.LINE_CHANNEL_SECRET!)
    .update(body)
    .digest('base64');
  return hash === signature;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-line-signature') || '';

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const { events } = JSON.parse(body) as { events: LineEvent[] };
  const supabase = createServiceClient();

  for (const event of events) {
    try {
      if (event.type === 'message' && event.message?.type === 'text') {
        await handleTextMessage(supabase, event);
      } else if (event.type === 'postback') {
        await handlePostback(supabase, event);
      }
    } catch (error) {
      console.error('Error handling LINE event:', error);
    }
  }

  return NextResponse.json({ status: 'ok' });
}

async function handleTextMessage(supabase: ReturnType<typeof createServiceClient>, event: LineEvent) {
  const text = event.message?.text?.trim() || '';
  const userId = event.source.userId;

  if (!userId || !event.replyToken) return;

  // Check deposit code inquiry (DEP-XXXXX pattern)
  if (/^DEP-/i.test(text)) {
    const { data: deposit } = await supabase
      .from('deposits')
      .select('*')
      .ilike('deposit_code', text)
      .single();

    if (deposit) {
      await replyMessage(event.replyToken, [
        {
          type: 'text',
          text: `🔍 รหัส: ${deposit.deposit_code}\nสินค้า: ${deposit.product_name}\nคงเหลือ: ${deposit.remaining_qty}\nสถานะ: ${deposit.status}`,
        },
      ]);
    } else {
      await replyMessage(event.replyToken, [
        { type: 'text', text: `❌ ไม่พบรหัสฝาก "${text}"` },
      ]);
    }
    return;
  }

  // Default help message
  await replyMessage(event.replyToken, [
    {
      type: 'text',
      text: '📋 StockManager\n\nพิมพ์รหัสฝากเหล้า (เช่น DEP-12345) เพื่อตรวจสอบสถานะ\n\nหรือเปิดเว็บแอปเพื่อจัดการระบบ',
    },
  ]);
}

async function handlePostback(supabase: ReturnType<typeof createServiceClient>, event: LineEvent) {
  const data = event.postback?.data || '';
  const params = new URLSearchParams(data);
  const action = params.get('action');

  if (!event.replyToken) return;

  if (action === 'check_deposit') {
    const code = params.get('code');
    if (code) {
      const { data: deposit } = await supabase
        .from('deposits')
        .select('*')
        .eq('deposit_code', code)
        .single();

      if (deposit) {
        await replyMessage(event.replyToken, [
          {
            type: 'text',
            text: `✅ ${deposit.deposit_code}\n${deposit.product_name}\nคงเหลือ: ${deposit.remaining_qty}`,
          },
        ]);
      }
    }
  }
}
