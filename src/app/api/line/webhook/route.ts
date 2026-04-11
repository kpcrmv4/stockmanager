import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import {
  replyMessage,
  pushToStaffGroup,
  createFlexMessage,
} from '@/lib/line/messaging';
import {
  approvalRequestTemplate,
  claimDepositFlex,
  claimMultipleDepositsFlex,
  depositLinkedFlex,
  groupIdFlex,
  multipleDepositsLinkedFlex,
  openDepositSystemFlex,
} from '@/lib/line/flex-templates';
import { buildCustomerEntryUrl } from '@/lib/line/customer-entry-url';

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
  store_code: string;
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
  'id, store_code, store_name, line_token, line_channel_secret, deposit_notify_group_id, bar_notify_group_id, stock_notify_group_id';

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
  // 1. Verify webhook signature (ใช้ channel_secret ของสาขาเท่านั้น)
  //
  // Per-store model: the `destination` field is the channel_id of the store
  // LINE OA that received the webhook. We look up the store by that id and
  // verify using THAT store's secret. No env fallback.
  // -----------------------------------------------------------------------
  if (!destination) {
    return NextResponse.json(
      { error: 'Missing destination' },
      { status: 400 },
    );
  }

  const { data: secretStore } = await supabase
    .from('stores')
    .select('line_channel_secret')
    .eq('line_channel_id', destination)
    .eq('active', true)
    .single();

  const channelSecret = secretStore?.line_channel_secret || '';

  if (!channelSecret) {
    console.warn(
      `[LINE] No store found for channel_id=${destination}. ` +
        'ตั้งค่า Channel ID/Secret ใน ตั้งค่า → สาขา → [ชื่อสาขา] → LINE OA',
    );
    return NextResponse.json(
      { error: 'Store not configured for this LINE channel' },
      { status: 404 },
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
          const botToken = storeInfo?.line_token || '';
          if (!botToken) {
            console.warn('[LINE] join event but store has no line_token — skip reply');
            continue;
          }
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

  // token สำหรับ reply — ต้องเป็น token ของสาขาเท่านั้น
  // (webhook verify ผ่านแล้ว → storeInfo ต้องมี token เสมอ)
  const botToken = storeInfo?.line_token || '';
  if (!botToken) {
    console.warn('[LINE] handleTextMessage: store has no line_token — skip reply');
    return;
  }

  // -----------------------------------------------------------------------
  // Pattern: "groupid" → reply with the current group id for easy copy
  //
  // Works only inside a LINE group. Sends two messages:
  //   1. A Flex card with the group id in a styled box
  //   2. A plain text bubble containing ONLY the raw id — the easiest UX
  //      to long-press and copy inside the LINE app (Flex has no native
  //      clipboard action).
  // -----------------------------------------------------------------------
  if (isGroupIdKeyword(text)) {
    const groupId = event.source.groupId;
    if (!groupId || event.source.type !== 'group') {
      await replyMessage(
        event.replyToken,
        [
          {
            type: 'text',
            text: 'ℹ️ คำสั่ง "groupid" ใช้ได้ในกลุ่ม LINE เท่านั้น\n\nกรุณาเชิญ bot เข้ากลุ่มก่อน แล้วพิมพ์ "groupid" ในกลุ่มนั้น',
          },
        ],
        botToken,
      );
      return;
    }

    // Note: we intentionally don't pass a group_name here. storeInfo.store_name
    // is the *store that owns this bot*, not the group's display name, which
    // the Messaging API doesn't give us without an extra groupSummary call.
    const flex = groupIdFlex({
      group_id: groupId,
      group_name: null,
    });

    await replyMessage(
      event.replyToken,
      [
        flex,
        // Plain text with ONLY the id — long-press to copy.
        { type: 'text', text: groupId },
      ],
      botToken,
    );
    return;
  }

  // -----------------------------------------------------------------------
  // Pattern: DEP-XXXXX → ค้นหารหัสฝากเหล้า + Claim Flow
  // -----------------------------------------------------------------------
  if (/^DEP-/i.test(text)) {
    const query = supabase
      .from('deposits')
      .select('*, store:stores(store_name, store_code)')
      .ilike('deposit_code', text);

    if (storeInfo) {
      query.eq('store_id', storeInfo.id);
    }

    const { data: deposit } = await query.single();

    if (!deposit) {
      await replyMessage(
        event.replyToken,
        [{ type: 'text', text: `❌ ไม่พบรหัสฝาก "${text}"` }],
        botToken,
      );
      return;
    }

    const rawStore = deposit.store as unknown;
    const storeRow =
      (Array.isArray(rawStore)
        ? rawStore[0]
        : (rawStore as { store_name: string; store_code: string } | null)) ||
      null;
    const storeName = storeRow?.store_name || '';
    const storeCode = storeRow?.store_code || storeInfo?.store_code || null;

    // Case 1: มี line_user_id แล้ว แต่ไม่ใช่คนพิมพ์ → ป้องกันคนอื่นเห็น
    if (deposit.line_user_id && deposit.line_user_id !== userId) {
      await replyMessage(
        event.replyToken,
        [{ type: 'text', text: `❌ ไม่พบรหัสฝาก "${text}"` }],
        botToken,
      );
      return;
    }

    // Case 2: มี line_user_id = ผู้พิมพ์ + status expired/withdrawn → แสดงสถานะ
    if (deposit.line_user_id === userId && ['expired', 'withdrawn'].includes(deposit.status)) {
      const statusLabel = deposit.status === 'expired' ? 'หมดอายุแล้ว' : 'เบิกครบแล้ว';
      await replyMessage(
        event.replyToken,
        [
          {
            type: 'text',
            text: `📋 ${deposit.deposit_code}\n${deposit.product_name}\nสถานะ: ${statusLabel}${storeName ? `\nสาขา: ${storeName}` : ''}`,
          },
        ],
        botToken,
      );
      return;
    }

    // Case 3: มี line_user_id = ผู้พิมพ์ → ผูกแล้ว แสดงข้อมูลเดิม
    if (deposit.line_user_id === userId) {
      const portalUrl = await buildCustomerEntryUrl({
        lineUserId: userId,
        storeCode,
      });
      const flex = depositLinkedFlex({
        deposit_code: deposit.deposit_code,
        product_name: deposit.product_name,
        customer_name: deposit.customer_name,
        remaining_qty: deposit.remaining_qty,
        quantity: deposit.quantity,
        store_name: storeName,
        expiry_date: deposit.expiry_date,
        customer_portal_url: portalUrl,
      });
      await replyMessage(event.replyToken, [flex], botToken);
      return;
    }

    // Case 4: ยังไม่มี line_user_id → ถามผูก
    // หา related deposits จาก received_photo_url เดียวกัน (batch detection)
    let batchCodes: string[] = [];
    let batchProductNames: string[] = [];

    if (deposit.received_photo_url) {
      const { data: batchDeposits } = await supabase
        .from('deposits')
        .select('deposit_code, product_name')
        .eq('store_id', deposit.store_id)
        .eq('received_photo_url', deposit.received_photo_url)
        .is('line_user_id', null)
        .in('status', ['in_store', 'pending_confirm'])
        .order('created_at', { ascending: true });

      if (batchDeposits && batchDeposits.length > 1) {
        batchCodes = batchDeposits.map((d) => d.deposit_code);
        batchProductNames = batchDeposits.map((d) => d.product_name);
      }
    }

    if (batchCodes.length > 1) {
      // Multiple deposits in same batch
      const flex = claimMultipleDepositsFlex({
        codes: batchCodes,
        product_names: batchProductNames,
        customer_name: deposit.customer_name,
        store_name: storeName,
        store_id: deposit.store_id,
        primary_code: deposit.deposit_code,
      });
      await replyMessage(event.replyToken, [flex], botToken);
    } else {
      // Single deposit
      const flex = claimDepositFlex({
        deposit_code: deposit.deposit_code,
        product_name: deposit.product_name,
        customer_name: deposit.customer_name,
        remaining_qty: deposit.remaining_qty,
        store_name: storeName,
        store_id: deposit.store_id,
      });
      await replyMessage(event.replyToken, [flex], botToken);
    }
    return;
  }

  // -----------------------------------------------------------------------
  // Pattern: GAS-style keywords → Flex card with button to deposit system
  //
  // Mirrors the old GAS bot: any of these keywords triggers the "open deposit
  // system" Flex card. The button opens the central LIFF (scoped via ?store=)
  // when configured, or falls back to a signed token URL.
  // -----------------------------------------------------------------------
  if (isDepositSystemKeyword(text)) {
    // Count the customer's active deposits at this branch (if resolvable).
    // If no store context, count across all stores — still useful info.
    const countQuery = supabase
      .from('deposits')
      .select('id', { count: 'exact', head: true })
      .eq('line_user_id', userId)
      .in('status', ['in_store', 'pending_confirm', 'pending_withdrawal']);

    if (storeInfo) {
      countQuery.eq('store_id', storeInfo.id);
    }

    const { count } = await countQuery;

    const entryUrl = await buildCustomerEntryUrl({
      lineUserId: userId,
      storeCode: storeInfo?.store_code ?? null,
    });

    const flex = openDepositSystemFlex({
      store_name: storeInfo?.store_name || 'StockManager',
      active_deposit_count: count ?? 0,
      entry_url: entryUrl,
    });

    await replyMessage(event.replyToken, [flex], botToken);
    return;
  }

  // -----------------------------------------------------------------------
  // Default: Help message + Customer portal link
  // -----------------------------------------------------------------------
  const storeSuffix = storeInfo
    ? `\n\n📍 สาขา: ${storeInfo.store_name}`
    : '';
  const portalLink = await buildCustomerEntryUrl({
    lineUserId: userId,
    storeCode: storeInfo?.store_code ?? null,
  });

  await replyMessage(
    event.replyToken,
    [
      {
        type: 'text',
        text: `📋 StockManager\n\n• พิมพ์รหัสฝาก (DEP-xxxxx) เพื่อตรวจสอบสถานะ\n• พิมพ์ "ฝากเหล้า" เพื่อเปิดระบบฝากเหล้า\n\n🔗 เปิดหน้าลูกค้า: ${portalLink}${storeSuffix}`,
      },
    ],
    botToken,
  );
}

// ---------------------------------------------------------------------------
// Keyword matcher — GAS-compatible trigger list
// ---------------------------------------------------------------------------
//
// Mirrors the old GAS bot's keyword behaviour. Matching is case-insensitive
// and ignores leading/trailing whitespace. The list covers:
//   - Thai deposit/stock phrases  (ฝากเหล้า, ของฝาก, เหล้า, เช็คเหล้า, ...)
//   - English shortcuts           (deposit, menu, start, help, hi, hello)
//   - Symbolic shortcuts          ("?", "/menu", "/start")
//
// The keywords here should stay broad — it's cheaper to show the Flex card
// one extra time than to frustrate a customer who typed a near-match.
// ---------------------------------------------------------------------------

const DEPOSIT_KEYWORD_PATTERNS: RegExp[] = [
  // Thai — deposit system entry
  /ฝากเหล้า/,
  /ระบบฝาก/,
  /ของฝาก/,
  /เหล้าฝาก/,
  /เช็คเหล้า/,
  /ดูเหล้า/,
  /ดูของฝาก/,
  /^เหล้า$/,
  // Thai — menu / help / greeting
  /^เมนู$/,
  /^ช่วย(เหลือ)?$/,
  /^เริ่ม(ต้น)?$/,
  /^สวัสดี(ครับ|ค่ะ)?$/,
  // English (case-insensitive)
  /^deposit$/i,
  /^deposits$/i,
  /^menu$/i,
  /^start$/i,
  /^help$/i,
  /^hi$/i,
  /^hello$/i,
  // Symbolic
  /^\?$/,
  /^\/(menu|start|help|deposit)$/i,
];

function isDepositSystemKeyword(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return DEPOSIT_KEYWORD_PATTERNS.some((re) => re.test(trimmed));
}

// ---------------------------------------------------------------------------
// Keyword matcher — "groupid" and common variants
// ---------------------------------------------------------------------------
//
// Triggers the Group ID reply. Intentionally broad: case-insensitive,
// whitespace-tolerant, supports Thai and symbolic shortcuts. Only fires in
// LINE groups (the handler itself checks event.source.type).
// ---------------------------------------------------------------------------

const GROUP_ID_KEYWORD_PATTERNS: RegExp[] = [
  /^group\s*id$/i,
  /^groupid$/i,
  /^\/group\s*id$/i,
  /^\/groupid$/i,
  /^id\s*กลุ่ม$/i,
  /^กลุ่ม\s*id$/i,
  /^ขอ\s*group\s*id$/i,
  /^ขอ\s*id\s*กลุ่ม$/i,
];

function isGroupIdKeyword(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return GROUP_ID_KEYWORD_PATTERNS.some((re) => re.test(trimmed));
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

  const botToken = storeInfo?.line_token || '';
  if (!botToken) {
    console.warn('[LINE] handlePostback: store has no line_token — skip reply');
    return;
  }

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
  // Action: link_deposit — ลูกค้ากดยืนยันผูก 1 รายการ
  // -----------------------------------------------------------------------
  if (action === 'link_deposit') {
    const code = params.get('code');
    const userId = event.source.userId;
    if (!code || !userId) return;

    const { data: deposit } = await supabase
      .from('deposits')
      .select('*, store:stores(store_name, store_code)')
      .eq('deposit_code', code)
      .single();

    if (!deposit) {
      await replyMessage(
        event.replyToken,
        [{ type: 'text', text: `❌ ไม่พบรหัสฝาก "${code}"` }],
        botToken,
      );
      return;
    }

    // ถ้าผูกแล้วกับคนอื่น → ไม่อนุญาต
    if (deposit.line_user_id && deposit.line_user_id !== userId) {
      await replyMessage(
        event.replyToken,
        [{ type: 'text', text: '❌ รหัสนี้ถูกผูกกับบัญชีอื่นแล้ว' }],
        botToken,
      );
      return;
    }

    // ถ้าผูกแล้วกับคนนี้ → แสดงข้อมูลเดิม
    if (deposit.line_user_id === userId) {
      await replyMessage(
        event.replyToken,
        [{ type: 'text', text: `✅ รหัส ${code} ผูกกับบัญชีของคุณแล้ว` }],
        botToken,
      );
      return;
    }

    // UPDATE: ผูก line_user_id
    const { error } = await supabase
      .from('deposits')
      .update({ line_user_id: userId })
      .eq('id', deposit.id)
      .is('line_user_id', null);

    if (error) {
      await replyMessage(
        event.replyToken,
        [{ type: 'text', text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' }],
        botToken,
      );
      return;
    }

    const rawStore = deposit.store as unknown;
    const storeRow =
      (Array.isArray(rawStore)
        ? rawStore[0]
        : (rawStore as { store_name: string; store_code: string } | null)) ||
      null;
    const storeName = storeRow?.store_name || '';
    const storeCode = storeRow?.store_code || storeInfo?.store_code || null;
    const portalUrl = await buildCustomerEntryUrl({
      lineUserId: userId,
      storeCode,
    });

    const flex = depositLinkedFlex({
      deposit_code: deposit.deposit_code,
      product_name: deposit.product_name,
      customer_name: deposit.customer_name,
      remaining_qty: deposit.remaining_qty,
      quantity: deposit.quantity,
      store_name: storeName,
      expiry_date: deposit.expiry_date,
      customer_portal_url: portalUrl,
    });

    await replyMessage(event.replyToken, [flex], botToken);
    return;
  }

  // -----------------------------------------------------------------------
  // Action: link_deposits_batch — ลูกค้ากดยืนยันผูกหลายรายการ
  // -----------------------------------------------------------------------
  if (action === 'link_deposits_batch') {
    const codesStr = params.get('codes');
    const userId = event.source.userId;
    if (!codesStr || !userId) return;

    const codes = codesStr.split(',').filter(Boolean);
    const linkedCodes: string[] = [];
    const linkedProductNames: string[] = [];
    let storeName = '';
    let resolvedStoreCode: string | null = null;

    for (const code of codes) {
      const { data: deposit } = await supabase
        .from('deposits')
        .select('id, deposit_code, product_name, store:stores(store_name, store_code)')
        .eq('deposit_code', code)
        .is('line_user_id', null)
        .single();

      if (deposit) {
        const { error } = await supabase
          .from('deposits')
          .update({ line_user_id: userId })
          .eq('id', deposit.id)
          .is('line_user_id', null);

        if (!error) {
          linkedCodes.push(deposit.deposit_code);
          linkedProductNames.push(deposit.product_name);
          if (!storeName) {
            const rawStore = deposit.store as unknown;
            const storeRow =
              (Array.isArray(rawStore)
                ? rawStore[0]
                : (rawStore as { store_name: string; store_code: string } | null)) ||
              null;
            storeName = storeRow?.store_name || '';
            resolvedStoreCode = storeRow?.store_code || null;
          }
        }
      }
    }

    if (linkedCodes.length === 0) {
      await replyMessage(
        event.replyToken,
        [{ type: 'text', text: '❌ ไม่สามารถผูกรายการได้ อาจถูกผูกไปแล้ว' }],
        botToken,
      );
      return;
    }

    const portalUrl = await buildCustomerEntryUrl({
      lineUserId: userId,
      storeCode: resolvedStoreCode || storeInfo?.store_code || null,
    });

    const flex = multipleDepositsLinkedFlex({
      codes: linkedCodes,
      product_names: linkedProductNames,
      store_name: storeName,
      customer_portal_url: portalUrl,
    });

    await replyMessage(event.replyToken, [flex], botToken);
    return;
  }

  // -----------------------------------------------------------------------
  // Action: cancel_link — ลูกค้ากดไม่ใช่ของฉัน
  // -----------------------------------------------------------------------
  if (action === 'cancel_link') {
    await replyMessage(
      event.replyToken,
      [{ type: 'text', text: '👌 ไม่มีการเปลี่ยนแปลง\n\nหากต้องการตรวจสอบข้อมูล ลองพิมพ์รหัสฝากอีกครั้ง' }],
      botToken,
    );
    return;
  }

  // -----------------------------------------------------------------------
  // Action: claim_deposit (ลูกค้าขอเบิก — legacy)
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
          storeInfo?.line_token || depositStore?.line_token || '';
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
