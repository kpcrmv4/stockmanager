import crypto from 'crypto';

/**
 * Customer Token (stateless) — ใช้สำหรับ customer page เมื่อไม่มี LIFF
 *
 * Flow:
 *  1. Webhook ได้ lineUserId จาก event
 *  2. สร้าง signed token ที่มี lineUserId + expiry
 *  3. ส่ง URL กลับไปใน LINE chat: /customer?token=xxxx
 *  4. Customer page verify token → ได้ lineUserId → query deposits
 *
 * Token format: base64url( lineUserId + ":" + expiryMs + ":" + hmacSignature )
 */

const TOKEN_SECRET =
  process.env.CUSTOMER_TOKEN_SECRET ||
  process.env.CRON_SECRET ||
  'stockmanager-fallback-secret';

/** Token มีอายุ 24 ชั่วโมง (เปลี่ยนได้) */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hmacSign(payload: string): string {
  return crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
}

/**
 * สร้าง customer token จาก lineUserId
 */
export function generateCustomerToken(lineUserId: string): string {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const payload = `${lineUserId}:${expiry}`;
  const sig = hmacSign(payload);
  const raw = `${payload}:${sig}`;
  return Buffer.from(raw).toString('base64url');
}

/**
 * ตรวจสอบ customer token แล้วคืน lineUserId
 * คืน null ถ้า token ไม่ถูกต้องหรือหมดอายุ
 */
export function verifyCustomerToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = raw.split(':');
    if (parts.length !== 3) return null;

    const [lineUserId, expiryStr, sig] = parts;
    const expiry = parseInt(expiryStr, 10);

    // เช็คหมดอายุ
    if (isNaN(expiry) || Date.now() > expiry) return null;

    // เช็ค signature
    const payload = `${lineUserId}:${expiryStr}`;
    const expected = hmacSign(payload);
    if (sig !== expected) return null;

    return lineUserId;
  } catch {
    return null;
  }
}

/**
 * สร้าง full URL สำหรับ customer portal
 */
export function generateCustomerUrl(
  lineUserId: string,
  path = '/customer',
): string {
  const token = generateCustomerToken(lineUserId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}${path}?token=${token}`;
}
