/**
 * LINE Messaging API Service
 *
 * รองรับ 2 แบบ:
 * 1. Per-branch bot — ใช้ line_token ของแต่ละสาขา
 * 2. Central bot — ใช้ LINE_CENTRAL_TOKEN จาก app_settings / env
 *
 * การเลือก token:
 *   - ถ้าส่ง `token` parameter → ใช้ token นั้น (per-branch)
 *   - ถ้าไม่ส่ง → ใช้ env LINE_CHANNEL_ACCESS_TOKEN (central fallback)
 */

const LINE_API_URL = 'https://api.line.me/v2/bot/message';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LineMessage {
  type: string;
  text?: string;
  altText?: string;
  contents?: Record<string, unknown>;
}

interface LineSendOptions {
  /** Per-branch LINE OA token (ถ้าไม่ส่ง จะใช้ central token จาก env) */
  token?: string;
}

// ---------------------------------------------------------------------------
// Core: Push & Reply
// ---------------------------------------------------------------------------

/**
 * Push message ไปยัง userId/groupId
 * @param to - LINE userId หรือ groupId
 * @param messages - รายการ messages
 * @param options - ระบุ token ของสาขา (ถ้าไม่ระบุใช้ central)
 */
export async function pushMessage(
  to: string,
  messages: LineMessage[],
  options?: LineSendOptions,
) {
  const token = resolveToken(options?.token);
  if (!token) {
    console.warn('[LINE] No token available, skipping push');
    return;
  }

  const response = await fetch(`${LINE_API_URL}/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE push error: ${error}`);
  }
}

/**
 * Reply message ด้วย replyToken (ต้องใช้ token ของ bot ที่รับ webhook)
 * @param replyToken - จาก LINE webhook event
 * @param messages - รายการ messages
 * @param token - token ของ LINE OA สาขาที่รับ webhook (บังคับ)
 */
export async function replyMessage(
  replyToken: string,
  messages: LineMessage[],
  token: string,
) {
  const response = await fetch(`${LINE_API_URL}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE reply error: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Push helpers: Per-Branch
// ---------------------------------------------------------------------------

/**
 * ส่งแจ้งเตือนไปกลุ่ม staff ของสาขา
 */
export async function pushToStaffGroup(
  staffGroupId: string,
  messages: LineMessage[],
  storeToken: string,
) {
  return pushMessage(staffGroupId, messages, { token: storeToken });
}

/**
 * ส่งแจ้งเตือนไปกลุ่ม bar ของสาขา
 */
export async function pushToBarGroup(
  barGroupId: string,
  messages: LineMessage[],
  storeToken: string,
) {
  return pushMessage(barGroupId, messages, { token: storeToken });
}

/**
 * ส่งแจ้งเตือนไปลูกค้า (ผ่าน LINE OA ของสาขา)
 */
export async function pushToCustomer(
  lineUserId: string,
  messages: LineMessage[],
  storeToken: string,
) {
  return pushMessage(lineUserId, messages, { token: storeToken });
}

// ---------------------------------------------------------------------------
// Push helpers: Central Bot
// ---------------------------------------------------------------------------

/**
 * ส่งแจ้งเตือนผ่าน bot กลาง (ใช้สำหรับโอนสต๊อก, คลังกลาง)
 */
export async function pushViaCentralBot(
  to: string,
  messages: LineMessage[],
  centralToken?: string,
) {
  const token = centralToken || process.env.LINE_CENTRAL_TOKEN;
  return pushMessage(to, messages, { token: token || undefined });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * ดึง LINE profile ของ user
 * @param userId - LINE userId
 * @param token - token ของ bot ที่ user เป็น friend (per-branch หรือ central)
 */
export async function getLineProfile(userId: string, token?: string) {
  const resolved = resolveToken(token);
  if (!resolved) return null;

  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${userId}`,
    { headers: { Authorization: `Bearer ${resolved}` } },
  );

  if (!response.ok) return null;
  return response.json() as Promise<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
    statusMessage?: string;
  }>;
}

// ---------------------------------------------------------------------------
// LIFF / Token Verification
// ---------------------------------------------------------------------------

export async function verifyLineAccessToken(accessToken: string) {
  const response = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`,
  );

  if (!response.ok) return null;
  return response.json() as Promise<{
    scope: string;
    client_id: string;
    expires_in: number;
  }>;
}

export async function getLineProfileFromToken(accessToken: string) {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;
  return response.json() as Promise<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Flex Message Builder
// ---------------------------------------------------------------------------

/**
 * สร้าง flex message object สำหรับส่งผ่าน LINE
 */
export function createFlexMessage(
  altText: string,
  contents: Record<string, unknown>,
): LineMessage {
  return { type: 'flex', altText, contents };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function resolveToken(explicitToken?: string): string | null {
  if (explicitToken) return explicitToken;
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || null;
}
