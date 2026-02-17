import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import {
  replyMessage,
  pushToStaffGroup,
  createFlexMessage,
} from '@/lib/line/messaging';
import { approvalRequestTemplate } from '@/lib/line/flex-templates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineEvent {
  type: string;
  replyToken?: string;
  source: { type: string; userId?: string; groupId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string };
}

interface LineWebhookBody {
  destination: string; // Channel ID ของ bot ที่รับ webhook
  events: LineEvent[];
}

interface StoreInfo {
  id: string;
  store_name: string;
  line_token: string;
  staff_group_id: string | null;
  bar_group_id: string | null;
}

// ---------------------------------------------------------------------------
// Signature Verification
// ---------------------------------------------------------------------------

function verifySignature(
  body: string,
  signature: string,
  channelSecret: string,
): boolean {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-line-signature') || '';

  const parsed = JSON.parse(body) as LineWebhookBody;
  const destination = parsed.destination;

  const supabase = createServiceClient();

  // -----------------------------------------------------------------------
  // 1. หาว่า webhook มาจาก bot ของสาขาไหน ตาม destination (channel_id)
  // -----------------------------------------------------------------------
  let storeInfo: StoreInfo | null = null;
  let channelSecret = process.env.LINE_CHANNEL_SECRET || '';

  if (destination) {
    const { data: store } = await supabase
      .from('stores')
      .select('id, store_name, line_token, staff_group_id, bar_group_id')
      .eq('line_channel_id', destination)
      .eq('active', true)
      .single();

    if (store && store.line_token) {
      storeInfo = store as StoreInfo;

      // TODO: ถ้าแต่ละสาขามี channel_secret แยก ให้ lookup จาก DB
      // ปัจจุบันใช้ env.LINE_CHANNEL_SECRET เป็น default
    }
  }

  // -----------------------------------------------------------------------
  // 2. Verify webhook signature
  // -----------------------------------------------------------------------
  if (!channelSecret) {
    return NextResponse.json(
      { error: 'No channel secret configured' },
      { status: 500 },
    );
  }

  if (!verifySignature(body, signature, channelSecret)) {
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 403 },
    );
  }

  // -----------------------------------------------------------------------
  // 3. Process events
  // -----------------------------------------------------------------------
  for (const event of parsed.events) {
    try {
      if (event.type === 'message' && event.message?.type === 'text') {
        await handleTextMessage(supabase, event, storeInfo);
      } else if (event.type === 'postback') {
        await handlePostback(supabase, event, storeInfo);
      } else if (event.type === 'join') {
        // Bot ถูกเชิญเข้ากลุ่ม → log group ID เพื่อใช้ตั้งค่า
        console.log(
          `[LINE] Bot joined group: ${event.source.groupId} ` +
            `(store: ${storeInfo?.store_name || 'central'})`,
        );
      }
    } catch (error) {
      console.error('[LINE] Error handling event:', error);
    }
  }

  return NextResponse.json({ status: 'ok' });
}

// ---------------------------------------------------------------------------
// Text Message Handler
// ---------------------------------------------------------------------------

async function handleTextMessage(
  supabase: ReturnType<typeof createServiceClient>,
  event: LineEvent,
  storeInfo: StoreInfo | null,
) {
  const text = event.message?.text?.trim() || '';
  const userId = event.source.userId;

  if (!userId || !event.replyToken) return;

  // token สำหรับ reply (ต้องใช้ token ของ bot ที่รับ webhook)
  const botToken =
    storeInfo?.line_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

  // -----------------------------------------------------------------------
  // Pattern: DEP-XXXXX → ค้นหารหัสฝากเหล้า
  // -----------------------------------------------------------------------
  if (/^DEP-/i.test(text)) {
    const query = supabase
      .from('deposits')
      .select('*')
      .ilike('deposit_code', text);

    if (storeInfo) {
      query.eq('store_id', storeInfo.id);
    }

    const { data: deposit } = await query.single();

    if (deposit) {
      await replyMessage(
        event.replyToken,
        [
          {
            type: 'text',
            text: `🔍 รหัส: ${deposit.deposit_code}\nสินค้า: ${deposit.product_name}\nคงเหลือ: ${deposit.remaining_qty}\nสถานะ: ${deposit.status}`,
          },
        ],
        botToken,
      );
    } else {
      await replyMessage(
        event.replyToken,
        [{ type: 'text', text: `❌ ไม่พบรหัสฝาก "${text}"` }],
        botToken,
      );
    }
    return;
  }

  // -----------------------------------------------------------------------
  // Pattern: ระบบฝากเหล้า / ฝากเหล้า → ข้อมูลฝากเหล้าของลูกค้า
  // -----------------------------------------------------------------------
  if (/ฝากเหล้า|ระบบฝาก/.test(text)) {
    if (storeInfo) {
      const { data: deposits } = await supabase
        .from('deposits')
        .select('deposit_code, product_name, remaining_qty, status')
        .eq('store_id', storeInfo.id)
        .eq('line_user_id', userId)
        .in('status', ['in_store', 'pending_confirm'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (deposits && deposits.length > 0) {
        const list = deposits
          .map(
            (d) =>
              `📦 ${d.deposit_code}\n   ${d.product_name} (เหลือ ${d.remaining_qty})`,
          )
          .join('\n\n');

        await replyMessage(
          event.replyToken,
          [
            {
              type: 'text',
              text: `🍾 ของฝากของคุณที่ ${storeInfo.store_name}\n\n${list}\n\nพิมพ์รหัส DEP-xxxxx เพื่อดูรายละเอียดเพิ่ม`,
            },
          ],
          botToken,
        );
      } else {
        await replyMessage(
          event.replyToken,
          [
            {
              type: 'text',
              text: `📋 ยังไม่มีของฝากที่ ${storeInfo.store_name}\n\nติดต่อพนักงานเพื่อฝากเหล้า`,
            },
          ],
          botToken,
        );
      }
    } else {
      await replyMessage(
        event.replyToken,
        [
          {
            type: 'text',
            text: '📋 กรุณาติดต่อสาขาที่คุณต้องการฝากเหล้าโดยตรง',
          },
        ],
        botToken,
      );
    }
    return;
  }

  // -----------------------------------------------------------------------
  // Default: Help message
  // -----------------------------------------------------------------------
  const storeSuffix = storeInfo
    ? `\n\n📍 สาขา: ${storeInfo.store_name}`
    : '';

  await replyMessage(
    event.replyToken,
    [
      {
        type: 'text',
        text: `📋 StockManager\n\n• พิมพ์รหัสฝาก (DEP-xxxxx) เพื่อตรวจสอบสถานะ\n• พิมพ์ "ฝากเหล้า" เพื่อดูของฝากของคุณ\n• เปิดเว็บแอปเพื่อจัดการระบบ${storeSuffix}`,
      },
    ],
    botToken,
  );
}

// ---------------------------------------------------------------------------
// Postback Handler
// ---------------------------------------------------------------------------

async function handlePostback(
  supabase: ReturnType<typeof createServiceClient>,
  event: LineEvent,
  storeInfo: StoreInfo | null,
) {
  const data = event.postback?.data || '';
  const params = new URLSearchParams(data);
  const action = params.get('action');

  if (!event.replyToken) return;

  const botToken =
    storeInfo?.line_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

  // -----------------------------------------------------------------------
  // Action: check_deposit
  // -----------------------------------------------------------------------
  if (action === 'check_deposit') {
    const code = params.get('code');
    if (code) {
      const { data: deposit } = await supabase
        .from('deposits')
        .select('*')
        .eq('deposit_code', code)
        .single();

      if (deposit) {
        await replyMessage(
          event.replyToken,
          [
            {
              type: 'text',
              text: `✅ ${deposit.deposit_code}\n${deposit.product_name}\nคงเหลือ: ${deposit.remaining_qty}`,
            },
          ],
          botToken,
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Action: claim_deposit (ลูกค้าขอเบิก)
  // -----------------------------------------------------------------------
  if (action === 'claim_deposit') {
    const depositId = params.get('deposit_id');
    const userId = event.source.userId;
    if (!depositId || !userId) return;

    const { data: deposit } = await supabase
      .from('deposits')
      .select('*')
      .eq('id', depositId)
      .single();

    if (deposit && deposit.status === 'in_store') {
      const { error } = await supabase.from('withdrawals').insert({
        deposit_id: deposit.id,
        store_id: deposit.store_id,
        line_user_id: userId,
        customer_name: deposit.customer_name,
        product_name: deposit.product_name,
        requested_qty: deposit.remaining_qty,
        status: 'pending',
      });

      if (!error) {
        await replyMessage(
          event.replyToken,
          [
            {
              type: 'text',
              text: `📝 ส่งคำขอเบิกเรียบร้อย\n\n${deposit.product_name}\nรอพนักงานยืนยัน`,
            },
          ],
          botToken,
        );

        // แจ้ง staff group ของสาขา
        if (storeInfo?.staff_group_id && storeInfo.line_token) {
          const flexMsg = createFlexMessage(
            'คำขอเบิกเหล้า',
            approvalRequestTemplate(
              deposit.customer_name,
              deposit.product_name,
              'withdrawal',
              storeInfo.store_name,
            ),
          );
          await pushToStaffGroup(
            storeInfo.staff_group_id,
            [flexMsg],
            storeInfo.line_token,
          );
        }
      }
    }
  }
}
