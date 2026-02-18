import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import {
  replyMessage,
  pushToStaffGroup,
  createFlexMessage,
} from '@/lib/line/messaging';
import { approvalRequestTemplate } from '@/lib/line/flex-templates';
import { generateCustomerUrl } from '@/lib/auth/customer-token';

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
  line_channel_secret: string | null;
  deposit_notify_group_id: string | null;
  bar_notify_group_id: string | null;
  stock_notify_group_id: string | null;
}

type SupabaseClient = ReturnType<typeof createServiceClient>;

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
// Store Resolution — หาสาขาจากหลายทาง
//
// ลำดับ:
//   1. destination (channel_id) → multi-bot mode (แต่ละสาขามี bot แยก)
//   2. groupId → หาจากกลุ่ม LINE ที่ตั้งค่าไว้
//   3. lineUserId → หาจาก deposits ของลูกค้า (single-bot + 1-to-1 chat)
// ---------------------------------------------------------------------------

const STORE_SELECT =
  'id, store_name, line_token, line_channel_secret, deposit_notify_group_id, bar_notify_group_id, stock_notify_group_id';

async function resolveStore(
  supabase: SupabaseClient,
  destination: string,
  event: LineEvent,
): Promise<StoreInfo | null> {
  // --- 1. จาก destination (channel_id ของ bot สาขา) ---
  if (destination) {
    const { data: store } = await supabase
      .from('stores')
      .select(STORE_SELECT)
      .eq('line_channel_id', destination)
      .eq('active', true)
      .single();

    if (store?.line_token) return store as StoreInfo;
  }

  // --- 2. จาก groupId (ข้อความส่งมาจากกลุ่ม LINE) ---
  const groupId = event.source.groupId;
  if (groupId) {
    // ค้นหาสาขาที่มี group ID นี้ในคอลัมน์ใดคอลัมน์หนึ่ง
    const { data: storeByGroup } = await supabase
      .from('stores')
      .select(STORE_SELECT)
      .eq('active', true)
      .or(
        `stock_notify_group_id.eq.${groupId},deposit_notify_group_id.eq.${groupId},bar_notify_group_id.eq.${groupId}`,
      )
      .limit(1)
      .single();

    if (storeByGroup) return storeByGroup as StoreInfo;
  }

  // --- 3. จาก deposits ของลูกค้า (1-to-1 chat, single-bot mode) ---
  const userId = event.source.userId;
  if (userId && event.source.type === 'user') {
    // หาสาขาที่ลูกค้ามี deposit ล่าสุด
    const { data: recentDeposit } = await supabase
      .from('deposits')
      .select('store_id')
      .eq('line_user_id', userId)
      .in('status', ['in_store', 'pending_confirm', 'pending_withdrawal'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recentDeposit) {
      const { data: store } = await supabase
        .from('stores')
        .select(STORE_SELECT)
        .eq('id', recentDeposit.store_id)
        .eq('active', true)
        .single();

      if (store) return store as StoreInfo;
    }
  }

  return null;
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
  // 1. Verify webhook signature (ใช้ channel_secret ของสาขาหรือ central)
  // -----------------------------------------------------------------------
  let channelSecret = process.env.LINE_CHANNEL_SECRET || '';

  // ลองหา channel_secret จากสาขาก่อน (multi-bot mode)
  if (destination) {
    const { data: store } = await supabase
      .from('stores')
      .select('line_channel_secret')
      .eq('line_channel_id', destination)
      .eq('active', true)
      .single();

    if (store?.line_channel_secret) {
      channelSecret = store.line_channel_secret;
    }
  }

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
  // 2. Process events
  // -----------------------------------------------------------------------
  for (const event of parsed.events) {
    try {
      // Resolve store สำหรับ event นี้
      const storeInfo = await resolveStore(supabase, destination, event);

      if (event.type === 'message' && event.message?.type === 'text') {
        await handleTextMessage(supabase, event, storeInfo);
      } else if (event.type === 'postback') {
        await handlePostback(supabase, event, storeInfo);
      } else if (event.type === 'join') {
        // Bot ถูกเชิญเข้ากลุ่ม → log group ID เพื่อใช้ตั้งค่า
        console.log(
          `[LINE] Bot joined group: ${event.source.groupId} ` +
            `(store: ${storeInfo?.store_name || 'unknown — ใส่ Group ID นี้ในตั้งค่าสาขา'})`,
        );

        // ตอบกลับเพื่อให้ admin เห็น group ID
        if (event.source.groupId) {
          const botToken =
            storeInfo?.line_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
          await replyMessage(
            event.replyToken!,
            [
              {
                type: 'text',
                text: `✅ Bot เข้ากลุ่มเรียบร้อย\n\n📋 Group ID:\n${event.source.groupId}\n\nกรุณาคัดลอก Group ID นี้ไปวางในตั้งค่าสาขา`,
              },
            ],
            botToken,
          );
        }
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
  supabase: SupabaseClient,
  event: LineEvent,
  storeInfo: StoreInfo | null,
) {
  const text = event.message?.text?.trim() || '';
  const userId = event.source.userId;

  if (!userId || !event.replyToken) return;

  // token สำหรับ reply (ใช้ token สาขา หรือ central bot)
  const botToken =
    storeInfo?.line_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

  // -----------------------------------------------------------------------
  // Pattern: DEP-XXXXX → ค้นหารหัสฝากเหล้า
  // -----------------------------------------------------------------------
  if (/^DEP-/i.test(text)) {
    const query = supabase
      .from('deposits')
      .select('*, store:stores(store_name)')
      .ilike('deposit_code', text);

    if (storeInfo) {
      query.eq('store_id', storeInfo.id);
    }

    const { data: deposit } = await query.single();

    if (deposit) {
      const rawStore = deposit.store as unknown;
      const storeName =
        (Array.isArray(rawStore) ? rawStore[0]?.store_name : (rawStore as { store_name: string } | null)?.store_name) || '';
      await replyMessage(
        event.replyToken,
        [
          {
            type: 'text',
            text: `🔍 รหัส: ${deposit.deposit_code}\nสินค้า: ${deposit.product_name}\nคงเหลือ: ${deposit.remaining_qty}\nสถานะ: ${deposit.status}${storeName ? `\nสาขา: ${storeName}` : ''}`,
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
    // Query deposits — ถ้ารู้สาขา filter ตามสาขา, ถ้าไม่รู้ดึงทุกสาขา
    const query = supabase
      .from('deposits')
      .select('deposit_code, product_name, remaining_qty, status, store:stores(store_name)')
      .eq('line_user_id', userId)
      .in('status', ['in_store', 'pending_confirm'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (storeInfo) {
      query.eq('store_id', storeInfo.id);
    }

    const { data: deposits } = await query;

    const portalUrl = generateCustomerUrl(userId);
    const storeName = storeInfo?.store_name || '';

    if (deposits && deposits.length > 0) {
      const list = deposits
        .map((d) => {
          const raw = d.store as unknown;
          const dStore =
            (Array.isArray(raw) ? raw[0]?.store_name : (raw as { store_name: string } | null)?.store_name) || '';
          const storeLabel = !storeInfo && dStore ? ` [${dStore}]` : '';
          return `📦 ${d.deposit_code}${storeLabel}\n   ${d.product_name} (เหลือ ${d.remaining_qty})`;
        })
        .join('\n\n');

      const header = storeName
        ? `🍾 ของฝากของคุณที่ ${storeName}`
        : '🍾 ของฝากของคุณ';

      await replyMessage(
        event.replyToken,
        [
          {
            type: 'text',
            text: `${header}\n\n${list}\n\nพิมพ์รหัส DEP-xxxxx เพื่อดูรายละเอียด\n\n🔗 ดูทั้งหมด: ${portalUrl}`,
          },
        ],
        botToken,
      );
    } else {
      const noDepositMsg = storeName
        ? `📋 ยังไม่มีของฝากที่ ${storeName}`
        : '📋 ยังไม่มีของฝาก';

      await replyMessage(
        event.replyToken,
        [
          {
            type: 'text',
            text: `${noDepositMsg}\n\nติดต่อพนักงานเพื่อฝากเหล้า\n\n🔗 เปิดหน้าลูกค้า: ${portalUrl}`,
          },
        ],
        botToken,
      );
    }
    return;
  }

  // -----------------------------------------------------------------------
  // Default: Help message + Customer portal link
  // -----------------------------------------------------------------------
  const storeSuffix = storeInfo
    ? `\n\n📍 สาขา: ${storeInfo.store_name}`
    : '';
  const portalLink = generateCustomerUrl(userId);

  await replyMessage(
    event.replyToken,
    [
      {
        type: 'text',
        text: `📋 StockManager\n\n• พิมพ์รหัสฝาก (DEP-xxxxx) เพื่อตรวจสอบสถานะ\n• พิมพ์ "ฝากเหล้า" เพื่อดูของฝากของคุณ\n\n🔗 เปิดหน้าลูกค้า: ${portalLink}${storeSuffix}`,
      },
    ],
    botToken,
  );
}

// ---------------------------------------------------------------------------
// Postback Handler
// ---------------------------------------------------------------------------

async function handlePostback(
  supabase: SupabaseClient,
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
      .select('*, store:stores(store_name, line_token, deposit_notify_group_id)')
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
        await supabase.from('audit_logs').insert({
          store_id: deposit.store_id,
          action_type: 'CUSTOMER_WITHDRAWAL_REQUEST',
          table_name: 'withdrawals',
          new_value: {
            customer_name: deposit.customer_name,
            product_name: deposit.product_name,
            line_user_id: userId,
          },
          changed_by: null,
        });

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

        // แจ้ง staff ของสาขา — ใช้ข้อมูลจาก deposit.store (ไม่ต้องพึ่ง storeInfo)
        const depositStore = deposit.store as {
          store_name: string;
          line_token: string | null;
          deposit_notify_group_id: string | null;
        } | null;

        const notifyGroupId =
          storeInfo?.deposit_notify_group_id ||
          depositStore?.deposit_notify_group_id;
        const notifyToken =
          storeInfo?.line_token ||
          depositStore?.line_token ||
          process.env.LINE_CHANNEL_ACCESS_TOKEN ||
          '';
        const notifyStoreName =
          storeInfo?.store_name ||
          depositStore?.store_name ||
          '';

        if (notifyGroupId && notifyToken) {
          const flexMsg = createFlexMessage(
            'คำขอเบิกเหล้า',
            approvalRequestTemplate(
              deposit.customer_name,
              deposit.product_name,
              'withdrawal',
              notifyStoreName,
            ),
          );
          await pushToStaffGroup(notifyGroupId, [flexMsg], notifyToken);
        }
      }
    }
  }
}
