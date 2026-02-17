import { formatThaiDate, formatNumber, formatPercent } from '@/lib/utils/format';

type FlexContainer = Record<string, unknown>;

function flexBubble(body: Record<string, unknown>, header?: Record<string, unknown>): FlexContainer {
  return {
    type: 'bubble',
    ...(header ? { header } : {}),
    body,
  };
}

function flexText(text: string, opts: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'text', text, ...opts };
}

function flexBox(contents: Record<string, unknown>[], opts: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'box', layout: 'vertical', contents, ...opts };
}

export function dailyReminderTemplate(storeName: string): FlexContainer {
  return flexBubble(
    flexBox([
      flexText('🔔 เตือนนับสต๊อก', { weight: 'bold', size: 'lg', color: '#1DB446' }),
      flexText(`สาขา: ${storeName}`, { size: 'sm', color: '#666666', margin: 'md' }),
      flexText('ถึงเวลานับสต๊อกประจำวันแล้ว กรุณาเข้าระบบเพื่อบันทึกผลการนับ', {
        size: 'sm',
        color: '#333333',
        margin: 'md',
        wrap: true,
      }),
    ])
  );
}

export function discrepancyShortTemplate(
  storeName: string,
  productName: string,
  difference: number,
  diffPercent: number
): FlexContainer {
  return flexBubble(
    flexBox([
      flexText('⚠️ สต๊อกขาด', { weight: 'bold', size: 'lg', color: '#FF4444' }),
      flexText(`สาขา: ${storeName}`, { size: 'sm', color: '#666666', margin: 'md' }),
      flexText(`สินค้า: ${productName}`, { size: 'sm', margin: 'sm' }),
      flexText(`ขาด: ${formatNumber(Math.abs(difference))} (${formatPercent(diffPercent)})`, {
        size: 'sm',
        color: '#FF4444',
        margin: 'sm',
      }),
    ])
  );
}

export function discrepancyOverTemplate(
  storeName: string,
  productName: string,
  difference: number,
  diffPercent: number
): FlexContainer {
  return flexBubble(
    flexBox([
      flexText('📈 สต๊อกเกิน', { weight: 'bold', size: 'lg', color: '#FF8C00' }),
      flexText(`สาขา: ${storeName}`, { size: 'sm', color: '#666666', margin: 'md' }),
      flexText(`สินค้า: ${productName}`, { size: 'sm', margin: 'sm' }),
      flexText(`เกิน: ${formatNumber(difference)} (${formatPercent(diffPercent)})`, {
        size: 'sm',
        color: '#FF8C00',
        margin: 'sm',
      }),
    ])
  );
}

export function depositConfirmedTemplate(
  customerName: string,
  productName: string,
  quantity: number,
  depositCode: string,
  expiryDate: string
): FlexContainer {
  return flexBubble(
    flexBox([
      flexText('✅ ฝากเหล้าสำเร็จ', { weight: 'bold', size: 'lg', color: '#1DB446' }),
      flexText(`ลูกค้า: ${customerName}`, { size: 'sm', margin: 'md' }),
      flexText(`สินค้า: ${productName}`, { size: 'sm', margin: 'sm' }),
      flexText(`จำนวน: ${formatNumber(quantity)}`, { size: 'sm', margin: 'sm' }),
      flexText(`รหัสฝาก: ${depositCode}`, { size: 'sm', weight: 'bold', margin: 'sm', color: '#1DB446' }),
      flexText(`หมดอายุ: ${formatThaiDate(expiryDate)}`, { size: 'sm', margin: 'sm', color: '#999999' }),
    ])
  );
}

export function withdrawalCompletedTemplate(
  customerName: string,
  productName: string,
  quantity: number,
  remainingQty: number
): FlexContainer {
  return flexBubble(
    flexBox([
      flexText('📤 เบิกเหล้าสำเร็จ', { weight: 'bold', size: 'lg', color: '#0066CC' }),
      flexText(`ลูกค้า: ${customerName}`, { size: 'sm', margin: 'md' }),
      flexText(`สินค้า: ${productName}`, { size: 'sm', margin: 'sm' }),
      flexText(`เบิก: ${formatNumber(quantity)}`, { size: 'sm', margin: 'sm' }),
      flexText(`คงเหลือ: ${formatNumber(remainingQty)}`, { size: 'sm', margin: 'sm', weight: 'bold' }),
    ])
  );
}

export function expiryWarningTemplate(
  customerName: string,
  productName: string,
  depositCode: string,
  daysLeft: number,
  storeName: string
): FlexContainer {
  return flexBubble(
    flexBox([
      flexText('⏰ เหล้าใกล้หมดอายุ', { weight: 'bold', size: 'lg', color: '#FF8C00' }),
      flexText(`สาขา: ${storeName}`, { size: 'sm', color: '#666666', margin: 'md' }),
      flexText(`ลูกค้า: ${customerName}`, { size: 'sm', margin: 'sm' }),
      flexText(`สินค้า: ${productName}`, { size: 'sm', margin: 'sm' }),
      flexText(`รหัส: ${depositCode}`, { size: 'sm', margin: 'sm' }),
      flexText(`เหลืออีก ${daysLeft} วัน`, { size: 'md', weight: 'bold', color: '#FF4444', margin: 'md' }),
    ])
  );
}

export function approvalRequestTemplate(
  staffName: string,
  productName: string,
  type: 'deposit' | 'withdrawal',
  storeName: string
): FlexContainer {
  const title = type === 'deposit' ? '📋 รอยืนยันฝากเหล้า' : '📋 รอยืนยันเบิกเหล้า';
  return flexBubble(
    flexBox([
      flexText(title, { weight: 'bold', size: 'lg', color: '#6C63FF' }),
      flexText(`สาขา: ${storeName}`, { size: 'sm', color: '#666666', margin: 'md' }),
      flexText(`พนักงาน: ${staffName}`, { size: 'sm', margin: 'sm' }),
      flexText(`สินค้า: ${productName}`, { size: 'sm', margin: 'sm' }),
      flexText('กรุณาเข้าระบบเพื่ออนุมัติ', { size: 'sm', color: '#999999', margin: 'md' }),
    ])
  );
}

export function promotionTemplate(
  title: string,
  body: string,
  storeName: string,
  imageUrl?: string
): FlexContainer {
  return {
    type: 'bubble',
    ...(imageUrl
      ? { hero: { type: 'image', url: imageUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' } }
      : {}),
    body: flexBox([
      flexText(`🎉 ${title}`, { weight: 'bold', size: 'lg', color: '#1DB446' }),
      flexText(`สาขา: ${storeName}`, { size: 'xs', color: '#999999', margin: 'md' }),
      flexText(body, { size: 'sm', color: '#333333', margin: 'md', wrap: true }),
    ]),
  };
}
