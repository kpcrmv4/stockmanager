import { formatThaiDate, formatNumber, formatPercent } from '@/lib/utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlexMessage {
  type: 'flex';
  altText: string;
  contents: FlexBubble;
}

interface FlexBubble {
  type: 'bubble';
  size?: string;
  header?: FlexBox;
  body: FlexBox;
  footer?: FlexBox;
  styles?: {
    header?: { backgroundColor: string };
    body?: Record<string, unknown>;
    footer?: { separator?: boolean };
  };
  [key: string]: unknown;
}

interface FlexBox {
  type: 'box';
  layout: string;
  contents: Record<string, unknown>[];
  [key: string]: unknown;
}

type FlexContainer = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const COLORS = {
  green: '#1DB446',
  greenBg: '#E8F5E9',
  blue: '#0066CC',
  blueBg: '#E3F2FD',
  orange: '#FF8C00',
  orangeBg: '#FFF3E0',
  amber: '#F59E0B',
  amberBg: '#FFFBEB',
  red: '#DC2626',
  redBg: '#FEE2E2',
  textPrimary: '#111111',
  textSecondary: '#555555',
  textMuted: '#999999',
  separator: '#EEEEEE',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function textComponent(
  text: string,
  opts: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: 'text', text, ...opts };
}

function separatorComponent(): Record<string, unknown> {
  return { type: 'separator', margin: 'lg', color: COLORS.separator };
}

function labelValueRow(
  label: string,
  value: string,
  valueOpts: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      textComponent(label, {
        size: 'sm',
        color: COLORS.textMuted,
        flex: 0,
        wrap: false,
      }),
      textComponent(value, {
        size: 'sm',
        color: COLORS.textPrimary,
        align: 'end',
        weight: 'bold',
        flex: 1,
        wrap: true,
        ...valueOpts,
      }),
    ],
    margin: 'md',
  };
}

function headerBox(
  title: string,
  headerColor: string,
): FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      textComponent(title, {
        size: 'lg',
        weight: 'bold',
        color: COLORS.white,
      }),
    ],
    paddingAll: 'lg',
  };
}

function bodyBox(contents: Record<string, unknown>[]): FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    contents,
    paddingAll: 'lg',
    spacing: 'none',
  };
}

function footerBox(contents: Record<string, unknown>[]): FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    contents,
    paddingAll: 'lg',
    spacing: 'sm',
  };
}

// ---------------------------------------------------------------------------
// (a) depositConfirmedFlex
// ---------------------------------------------------------------------------

interface DepositConfirmedParams {
  deposit_code: string;
  product_name: string;
  quantity: number;
  store_name: string;
  expiry_date: string;
}

/**
 * Flex message sent to customer when the bar confirms their deposit.
 * Green accent.
 */
export function depositConfirmedFlex(params: DepositConfirmedParams): FlexMessage {
  const { deposit_code, product_name, quantity, store_name, expiry_date } = params;

  return {
    type: 'flex',
    altText: `ฝากเหล้าสำเร็จ - ${product_name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('ฝากเหล้าสำเร็จ', COLORS.green),
      body: bodyBox([
        textComponent(product_name, {
          size: 'xl',
          weight: 'bold',
          color: COLORS.textPrimary,
          wrap: true,
        }),
        textComponent(store_name, {
          size: 'xs',
          color: COLORS.textMuted,
          margin: 'sm',
        }),
        separatorComponent(),
        labelValueRow('รหัสฝาก', deposit_code, { color: COLORS.green }),
        labelValueRow('จำนวน', `${formatNumber(quantity)} ขวด`),
        labelValueRow('หมดอายุ', formatThaiDate(expiry_date)),
      ]),
      footer: footerBox([
        textComponent('กรุณาแสดงรหัสฝากเมื่อต้องการเบิก', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.green },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (b) withdrawalCompletedFlex
// ---------------------------------------------------------------------------

interface WithdrawalCompletedParams {
  product_name: string;
  actual_qty: number;
  remaining_qty: number;
  store_name: string;
}

/**
 * Flex message sent to customer when withdrawal is completed.
 * Blue accent.
 */
export function withdrawalCompletedFlex(params: WithdrawalCompletedParams): FlexMessage {
  const { product_name, actual_qty, remaining_qty, store_name } = params;

  return {
    type: 'flex',
    altText: `เบิกเหล้าสำเร็จ - ${product_name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('เบิกเหล้าสำเร็จ', COLORS.blue),
      body: bodyBox([
        textComponent(product_name, {
          size: 'xl',
          weight: 'bold',
          color: COLORS.textPrimary,
          wrap: true,
        }),
        textComponent(store_name, {
          size: 'xs',
          color: COLORS.textMuted,
          margin: 'sm',
        }),
        separatorComponent(),
        labelValueRow('จำนวนที่เบิก', `${formatNumber(actual_qty)} ขวด`),
        labelValueRow('คงเหลือ', `${formatNumber(remaining_qty)} ขวด`, {
          color: remaining_qty > 0 ? COLORS.green : COLORS.red,
        }),
      ]),
      footer: footerBox([
        textComponent(
          remaining_qty > 0
            ? 'ยังมีเหล้าคงเหลือ สามารถเบิกเพิ่มได้'
            : 'เบิกครบแล้ว ไม่มีคงเหลือ',
          {
            size: 'xs',
            color: COLORS.textMuted,
            wrap: true,
            align: 'center',
          },
        ),
      ]),
      styles: {
        header: { backgroundColor: COLORS.blue },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (c) depositExpiryWarningFlex
// ---------------------------------------------------------------------------

interface DepositExpiryWarningParams {
  deposit_code: string;
  product_name: string;
  remaining_qty: number;
  expiry_date: string;
  days_remaining: number;
}

/**
 * Flex message sent to customer when their deposit is expiring soon.
 * Orange/amber accent.
 */
export function depositExpiryWarningFlex(params: DepositExpiryWarningParams): FlexMessage {
  const { deposit_code, product_name, remaining_qty, expiry_date, days_remaining } = params;

  const urgencyColor = days_remaining <= 3 ? COLORS.red : COLORS.orange;

  return {
    type: 'flex',
    altText: `เหล้าใกล้หมดอายุ - ${product_name} (เหลือ ${days_remaining} วัน)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('เหล้าใกล้หมดอายุ', COLORS.orange),
      body: bodyBox([
        textComponent(product_name, {
          size: 'xl',
          weight: 'bold',
          color: COLORS.textPrimary,
          wrap: true,
        }),
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            textComponent(`เหลืออีก ${days_remaining} วัน`, {
              size: 'md',
              weight: 'bold',
              color: urgencyColor,
            }),
          ],
          margin: 'md',
          paddingAll: 'sm',
          backgroundColor: days_remaining <= 3 ? COLORS.redBg : COLORS.orangeBg,
          cornerRadius: 'sm',
        },
        separatorComponent(),
        labelValueRow('รหัสฝาก', deposit_code),
        labelValueRow('คงเหลือ', `${formatNumber(remaining_qty)} ขวด`),
        labelValueRow('หมดอายุ', formatThaiDate(expiry_date), { color: urgencyColor }),
      ]),
      footer: footerBox([
        textComponent('กรุณามาเบิกก่อนหมดอายุ', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.orange },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (d) newDepositNotifyFlex
// ---------------------------------------------------------------------------

interface NewDepositNotifyParams {
  deposit_code: string;
  product_name: string;
  customer_name: string;
  quantity: number;
  table_number?: string;
  staff_name?: string;
}

/**
 * Flex message sent to bar GROUP when a new deposit needs confirmation.
 * Amber accent.
 */
export function newDepositNotifyFlex(params: NewDepositNotifyParams): FlexMessage {
  const { deposit_code, product_name, customer_name, quantity, table_number, staff_name } = params;

  const bodyContents: Record<string, unknown>[] = [
    textComponent(product_name, {
      size: 'xl',
      weight: 'bold',
      color: COLORS.textPrimary,
      wrap: true,
    }),
    separatorComponent(),
    labelValueRow('รหัสฝาก', deposit_code, { color: COLORS.amber }),
    labelValueRow('ลูกค้า', customer_name),
    labelValueRow('จำนวน', `${formatNumber(quantity)} ขวด`),
  ];

  if (table_number) {
    bodyContents.push(labelValueRow('โต๊ะ', table_number));
  }

  if (staff_name) {
    bodyContents.push(labelValueRow('พนักงาน', staff_name));
  }

  return {
    type: 'flex',
    altText: `ฝากเหล้ารอยืนยัน - ${customer_name} (${product_name})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('ฝากเหล้ารอยืนยัน', COLORS.amber),
      body: bodyBox(bodyContents),
      footer: footerBox([
        textComponent('กรุณาเข้าระบบเพื่อยืนยัน', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.amber },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (e) withdrawalRequestNotifyFlex
// ---------------------------------------------------------------------------

interface WithdrawalRequestNotifyParams {
  product_name: string;
  customer_name: string;
  requested_qty: number;
  table_number?: string;
}

/**
 * Flex message sent to bar GROUP when customer requests withdrawal.
 * Blue accent.
 */
export function withdrawalRequestNotifyFlex(params: WithdrawalRequestNotifyParams): FlexMessage {
  const { product_name, customer_name, requested_qty, table_number } = params;

  const bodyContents: Record<string, unknown>[] = [
    textComponent(product_name, {
      size: 'xl',
      weight: 'bold',
      color: COLORS.textPrimary,
      wrap: true,
    }),
    separatorComponent(),
    labelValueRow('ลูกค้า', customer_name),
    labelValueRow('จำนวนขอเบิก', `${formatNumber(requested_qty)} ขวด`),
  ];

  if (table_number) {
    bodyContents.push(labelValueRow('โต๊ะ', table_number));
  }

  return {
    type: 'flex',
    altText: `ขอเบิกเหล้า - ${customer_name} (${product_name})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('ขอเบิกเหล้า', COLORS.blue),
      body: bodyBox(bodyContents),
      footer: footerBox([
        textComponent('กรุณาเข้าระบบเพื่อดำเนินการ', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.blue },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (f) stockComparisonFlex
// ---------------------------------------------------------------------------

interface StockComparisonParams {
  store_name: string;
  date: string;
  total_items: number;
  over_threshold_count: number;
  summary: string;
}

/**
 * Flex message sent to stock GROUP when comparison has differences.
 * Red accent for issues.
 */
export function stockComparisonFlex(params: StockComparisonParams): FlexMessage {
  const { store_name, date, total_items, over_threshold_count, summary } = params;

  const hasIssues = over_threshold_count > 0;
  const accentColor = hasIssues ? COLORS.red : COLORS.green;
  const bgColor = hasIssues ? COLORS.red : COLORS.green;

  return {
    type: 'flex',
    altText: `ผลเปรียบเทียบสต๊อก - ${store_name} (${over_threshold_count} รายการเกินเกณฑ์)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('ผลเปรียบเทียบสต๊อก', bgColor),
      body: bodyBox([
        textComponent(store_name, {
          size: 'xl',
          weight: 'bold',
          color: COLORS.textPrimary,
          wrap: true,
        }),
        textComponent(formatThaiDate(date), {
          size: 'xs',
          color: COLORS.textMuted,
          margin: 'sm',
        }),
        separatorComponent(),
        labelValueRow('รายการทั้งหมด', `${formatNumber(total_items)} รายการ`),
        labelValueRow('เกินเกณฑ์', `${formatNumber(over_threshold_count)} รายการ`, {
          color: accentColor,
        }),
        separatorComponent(),
        textComponent('สรุป', {
          size: 'sm',
          weight: 'bold',
          color: COLORS.textSecondary,
          margin: 'md',
        }),
        textComponent(summary, {
          size: 'sm',
          color: COLORS.textPrimary,
          wrap: true,
          margin: 'sm',
        }),
      ]),
      footer: footerBox([
        textComponent('กรุณาเข้าระบบเพื่อตรวจสอบรายละเอียด', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
        }),
      ]),
      styles: {
        header: { backgroundColor: bgColor },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (k) claimDepositFlex — ถามลูกค้า "ใช่ของคุณไหม?" (1 รายการ)
// ---------------------------------------------------------------------------

interface ClaimDepositParams {
  deposit_code: string;
  product_name: string;
  customer_name: string;
  remaining_qty: number;
  store_name: string;
  store_id: string;
}

export function claimDepositFlex(params: ClaimDepositParams): FlexMessage {
  const { deposit_code, product_name, customer_name, remaining_qty, store_name, store_id } = params;

  return {
    type: 'flex',
    altText: `ยืนยันรหัสฝาก ${deposit_code}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('ยืนยันรหัสฝากเหล้า', COLORS.orange),
      body: bodyBox([
        textComponent(product_name, {
          size: 'xl',
          weight: 'bold',
          color: COLORS.textPrimary,
          wrap: true,
        }),
        textComponent(store_name, {
          size: 'xs',
          color: COLORS.textMuted,
          margin: 'sm',
        }),
        separatorComponent(),
        labelValueRow('รหัสฝาก', deposit_code, { color: COLORS.orange }),
        labelValueRow('ชื่อลูกค้า', customer_name),
        labelValueRow('คงเหลือ', `${formatNumber(remaining_qty)} ขวด`),
        separatorComponent(),
        textComponent('รายการนี้เป็นของคุณใช่ไหม?', {
          size: 'sm',
          color: COLORS.textSecondary,
          align: 'center',
          margin: 'lg',
          wrap: true,
        }),
      ]),
      footer: footerBox([
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'ใช่ ผูกกับฉัน',
                data: `action=link_deposit&code=${deposit_code}&store_id=${store_id}`,
                displayText: `ยืนยันผูกรหัส ${deposit_code}`,
              },
              style: 'primary',
              color: COLORS.green,
              height: 'sm',
            },
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'ไม่ใช่',
                data: `action=cancel_link&code=${deposit_code}`,
                displayText: 'ไม่ใช่ของฉัน',
              },
              style: 'secondary',
              height: 'sm',
            },
          ],
          spacing: 'sm',
        },
      ]),
      styles: {
        header: { backgroundColor: COLORS.orange },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (l) claimMultipleDepositsFlex — พบหลายรายการ batch เดียวกัน
// ---------------------------------------------------------------------------

interface ClaimMultipleDepositsParams {
  codes: string[];
  product_names: string[];
  customer_name: string;
  store_name: string;
  store_id: string;
  primary_code: string;
}

const COLORS_PURPLE = '#7C3AED';

export function claimMultipleDepositsFlex(params: ClaimMultipleDepositsParams): FlexMessage {
  const { codes, product_names, customer_name, store_name, store_id, primary_code } = params;

  const listItems: Record<string, unknown>[] = codes.map((code, i) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      textComponent(`${i + 1}.`, { size: 'sm', color: COLORS.textMuted, flex: 0 }),
      textComponent(`${code} — ${product_names[i] || ''}`, {
        size: 'sm',
        color: COLORS.textPrimary,
        flex: 1,
        wrap: true,
        margin: 'sm',
      }),
    ],
    margin: 'sm',
  }));

  return {
    type: 'flex',
    altText: `ยืนยันรหัสฝาก ${codes.length} รายการ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox(`พบ ${codes.length} รายการ`, COLORS_PURPLE),
      body: bodyBox([
        textComponent(customer_name, {
          size: 'lg',
          weight: 'bold',
          color: COLORS.textPrimary,
          wrap: true,
        }),
        textComponent(store_name, {
          size: 'xs',
          color: COLORS.textMuted,
          margin: 'sm',
        }),
        separatorComponent(),
        ...listItems,
        separatorComponent(),
        textComponent('ต้องการผูกรายการเหล่านี้กับบัญชีของคุณ?', {
          size: 'sm',
          color: COLORS.textSecondary,
          align: 'center',
          margin: 'lg',
          wrap: true,
        }),
      ]),
      footer: footerBox([
        {
          type: 'button',
          action: {
            type: 'postback',
            label: `ใช่ทั้งหมด (${codes.length} รายการ)`,
            data: `action=link_deposits_batch&codes=${codes.join(',')}&store_id=${store_id}`,
            displayText: `ยืนยันผูกทั้ง ${codes.length} รายการ`,
          },
          style: 'primary',
          color: COLORS.green,
          height: 'sm',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: `เฉพาะ ${primary_code}`,
            data: `action=link_deposit&code=${primary_code}&store_id=${store_id}`,
            displayText: `ยืนยันผูกเฉพาะ ${primary_code}`,
          },
          style: 'secondary',
          height: 'sm',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'ไม่ใช่ของฉัน',
            data: `action=cancel_link&code=${primary_code}`,
            displayText: 'ไม่ใช่ของฉัน',
          },
          style: 'secondary',
          height: 'sm',
        },
      ]),
      styles: {
        header: { backgroundColor: COLORS_PURPLE },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (m) depositLinkedFlex — ผูกสำเร็จ (1 รายการ)
// ---------------------------------------------------------------------------

interface DepositLinkedParams {
  deposit_code: string;
  product_name: string;
  customer_name: string;
  remaining_qty: number;
  quantity: number;
  store_name: string;
  expiry_date: string | null;
  customer_portal_url: string;
}

export function depositLinkedFlex(params: DepositLinkedParams): FlexMessage {
  const { deposit_code, product_name, customer_name, remaining_qty, quantity, store_name, expiry_date, customer_portal_url } = params;

  const bodyContents: Record<string, unknown>[] = [
    textComponent(product_name, {
      size: 'xl',
      weight: 'bold',
      color: COLORS.textPrimary,
      wrap: true,
    }),
    textComponent(store_name, {
      size: 'xs',
      color: COLORS.textMuted,
      margin: 'sm',
    }),
    separatorComponent(),
    labelValueRow('รหัสฝาก', deposit_code, { color: COLORS.green }),
    labelValueRow('ชื่อลูกค้า', customer_name),
    labelValueRow('คงเหลือ', `${formatNumber(remaining_qty)} / ${formatNumber(quantity)} ขวด`),
  ];

  if (expiry_date) {
    bodyContents.push(labelValueRow('หมดอายุ', formatThaiDate(expiry_date)));
  }

  return {
    type: 'flex',
    altText: `ผูกรหัสฝาก ${deposit_code} สำเร็จ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('ผูกรหัสฝากสำเร็จ', COLORS.green),
      body: bodyBox(bodyContents),
      footer: footerBox([
        {
          type: 'button',
          action: {
            type: 'uri',
            label: 'ดูรายการทั้งหมด',
            uri: customer_portal_url,
          },
          style: 'primary',
          color: COLORS.blue,
          height: 'sm',
        },
        textComponent('พิมพ์ "ฝากเหล้า" เพื่อดูของฝากทั้งหมด', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
          margin: 'sm',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.green },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (n) multipleDepositsLinkedFlex — ผูกหลายรายการสำเร็จ
// ---------------------------------------------------------------------------

interface MultipleDepositsLinkedParams {
  codes: string[];
  product_names: string[];
  store_name: string;
  customer_portal_url: string;
}

export function multipleDepositsLinkedFlex(params: MultipleDepositsLinkedParams): FlexMessage {
  const { codes, product_names, store_name, customer_portal_url } = params;

  const listItems: Record<string, unknown>[] = codes.map((code, i) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      textComponent('✅', { size: 'sm', flex: 0 }),
      textComponent(`${code} — ${product_names[i] || ''}`, {
        size: 'sm',
        color: COLORS.textPrimary,
        flex: 1,
        wrap: true,
        margin: 'sm',
      }),
    ],
    margin: 'sm',
  }));

  return {
    type: 'flex',
    altText: `ผูกรหัสฝาก ${codes.length} รายการสำเร็จ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox(`ผูกสำเร็จ ${codes.length} รายการ`, COLORS.green),
      body: bodyBox([
        textComponent(store_name, {
          size: 'xs',
          color: COLORS.textMuted,
        }),
        separatorComponent(),
        ...listItems,
      ]),
      footer: footerBox([
        {
          type: 'button',
          action: {
            type: 'uri',
            label: 'ดูรายการทั้งหมด',
            uri: customer_portal_url,
          },
          style: 'primary',
          color: COLORS.blue,
          height: 'sm',
        },
        textComponent('พิมพ์ "ฝากเหล้า" เพื่อดูของฝากทั้งหมด', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
          margin: 'sm',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.green },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Legacy templates (kept for backward compatibility)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// (g) borrowRequestFlex — ส่งไปกลุ่ม LINE ของสาขาผู้ให้ยืม
// ---------------------------------------------------------------------------

interface BorrowRequestFlexParams {
  from_store_name: string;
  to_store_name: string;
  requester_name: string;
  items: { product_name: string; quantity: number; unit?: string }[];
  notes?: string;
}

export function borrowRequestFlex(params: BorrowRequestFlexParams): FlexMessage {
  const { from_store_name, to_store_name, requester_name, items, notes } = params;

  const itemSummary = items
    .map((i) => `${i.product_name} x${formatNumber(i.quantity)}${i.unit ? ` ${i.unit}` : ''}`)
    .join(', ');

  const bodyContents: Record<string, unknown>[] = [
    textComponent(`ขอยืมสินค้า (${items.length} รายการ)`, {
      size: 'lg',
      weight: 'bold',
      color: COLORS.textPrimary,
      wrap: true,
    }),
    separatorComponent(),
    labelValueRow('จากสาขา', from_store_name),
    labelValueRow('ถึงสาขา', to_store_name),
    labelValueRow('ผู้ขอ', requester_name),
    separatorComponent(),
    textComponent('รายการ:', {
      size: 'sm',
      weight: 'bold',
      color: COLORS.textSecondary,
      margin: 'md',
    }),
    textComponent(itemSummary, {
      size: 'sm',
      color: COLORS.textPrimary,
      wrap: true,
      margin: 'sm',
    }),
  ];

  if (notes) {
    bodyContents.push(labelValueRow('หมายเหตุ', notes));
  }

  return {
    type: 'flex',
    altText: `คำขอยืมสินค้าจาก ${from_store_name} (${items.length} รายการ)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('คำขอยืมสินค้า', COLORS.amber),
      body: bodyBox(bodyContents),
      footer: footerBox([
        textComponent('กรุณาเข้าระบบเพื่ออนุมัติ', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.amber },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (h) borrowApprovedFlex — ส่งไปกลุ่ม LINE ของสาขาผู้ยืม
// ---------------------------------------------------------------------------

interface BorrowApprovedFlexParams {
  from_store_name: string;
  to_store_name: string;
  approver_name: string;
  items: { product_name: string; quantity: number; unit?: string }[];
}

export function borrowApprovedFlex(params: BorrowApprovedFlexParams): FlexMessage {
  const { from_store_name, to_store_name, approver_name, items } = params;

  const itemSummary = items
    .map((i) => `${i.product_name} x${formatNumber(i.quantity)}${i.unit ? ` ${i.unit}` : ''}`)
    .join(', ');

  return {
    type: 'flex',
    altText: `อนุมัติยืมสินค้าจาก ${to_store_name} แล้ว`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('อนุมัติยืมสินค้าแล้ว', COLORS.green),
      body: bodyBox([
        textComponent(itemSummary, {
          size: 'md',
          weight: 'bold',
          color: COLORS.textPrimary,
          wrap: true,
        }),
        separatorComponent(),
        labelValueRow('จากสาขา', from_store_name),
        labelValueRow('ผู้ให้ยืม', to_store_name),
        labelValueRow('อนุมัติโดย', approver_name),
      ]),
      footer: footerBox([
        textComponent('กรุณาเข้าระบบเพื่อยืนยันการตัดสต๊อกในเครื่อง POS', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.green },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (i) borrowRejectedFlex — ส่งไปกลุ่ม LINE ของสาขาผู้ยืม
// ---------------------------------------------------------------------------

interface BorrowRejectedFlexParams {
  from_store_name: string;
  to_store_name: string;
  rejector_name: string;
  reason?: string;
  items: { product_name: string; quantity: number; unit?: string }[];
}

export function borrowRejectedFlex(params: BorrowRejectedFlexParams): FlexMessage {
  const { from_store_name, to_store_name, rejector_name, reason, items } = params;

  const itemSummary = items
    .map((i) => `${i.product_name} x${formatNumber(i.quantity)}${i.unit ? ` ${i.unit}` : ''}`)
    .join(', ');

  const bodyContents: Record<string, unknown>[] = [
    textComponent(itemSummary, {
      size: 'md',
      weight: 'bold',
      color: COLORS.textPrimary,
      wrap: true,
    }),
    separatorComponent(),
    labelValueRow('จากสาขา', from_store_name),
    labelValueRow('ถึงสาขา', to_store_name),
    labelValueRow('ปฏิเสธโดย', rejector_name),
  ];

  if (reason) {
    bodyContents.push(labelValueRow('เหตุผล', reason));
  }

  return {
    type: 'flex',
    altText: `คำขอยืมสินค้าถูกปฏิเสธโดย ${to_store_name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('คำขอยืมถูกปฏิเสธ', COLORS.red),
      body: bodyBox(bodyContents),
      styles: {
        header: { backgroundColor: COLORS.red },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (j) borrowCompletedFlex — ส่งไปกลุ่ม LINE ของทั้งสองสาขา
// ---------------------------------------------------------------------------

interface BorrowCompletedFlexParams {
  from_store_name: string;
  to_store_name: string;
  items: { product_name: string; quantity: number; unit?: string }[];
}

export function borrowCompletedFlex(params: BorrowCompletedFlexParams): FlexMessage {
  const { from_store_name, to_store_name, items } = params;

  const itemSummary = items
    .map((i) => `${i.product_name} x${formatNumber(i.quantity)}${i.unit ? ` ${i.unit}` : ''}`)
    .join(', ');

  return {
    type: 'flex',
    altText: `ยืมสินค้าเสร็จสมบูรณ์ — ${from_store_name} ↔ ${to_store_name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('ยืมสินค้าเสร็จสมบูรณ์', COLORS.green),
      body: bodyBox([
        textComponent(itemSummary, {
          size: 'md',
          weight: 'bold',
          color: COLORS.textPrimary,
          wrap: true,
        }),
        separatorComponent(),
        labelValueRow('ผู้ยืม', from_store_name),
        labelValueRow('ผู้ให้ยืม', to_store_name),
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            textComponent('ทั้งสองสาขาตัดสต๊อก POS แล้ว', {
              size: 'sm',
              weight: 'bold',
              color: COLORS.green,
              align: 'center',
            }),
          ],
          margin: 'lg',
          paddingAll: 'sm',
          backgroundColor: COLORS.greenBg,
          cornerRadius: 'sm',
        },
      ]),
      styles: {
        header: { backgroundColor: COLORS.green },
      },
    },
  };
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

// ---------------------------------------------------------------------------
// (p) openDepositSystemFlex — reply when customer types "ฝากเหล้า" / "deposit"
//
// Mirrors the behaviour of the old GAS bot: instead of plain text, send a
// rich card with a single primary button that launches the deposit system.
// The button URL should be a LIFF deep link (with ?store={code}) when the
// central LIFF ID is configured, otherwise a signed token fallback URL.
// ---------------------------------------------------------------------------

interface OpenDepositSystemParams {
  /** Store display name to show in the card header area */
  store_name: string;
  /** Number of active deposits the customer has at this branch (0 = no items) */
  active_deposit_count: number;
  /** Customer display name (from LINE profile), optional */
  customer_name?: string | null;
  /** Full URL that the "Open" button should navigate to */
  entry_url: string;
  /** Bot display name, defaults to "DAVIS Ai" */
  bot_name?: string;
}

export function openDepositSystemFlex(
  params: OpenDepositSystemParams,
): FlexMessage {
  const {
    store_name,
    active_deposit_count,
    customer_name,
    entry_url,
    bot_name = 'DAVIS Ai',
  } = params;

  const hasItems = active_deposit_count > 0;

  // Body varies depending on whether the customer already has deposits
  const bodyContents: Record<string, unknown>[] = [
    textComponent(customer_name ? `สวัสดีคุณ ${customer_name}` : 'สวัสดีครับ 👋', {
      size: 'md',
      weight: 'bold',
      color: COLORS.textPrimary,
      wrap: true,
    }),
    textComponent(`สาขา: ${store_name}`, {
      size: 'xs',
      color: COLORS.textMuted,
      margin: 'sm',
    }),
    separatorComponent(),
  ];

  if (hasItems) {
    bodyContents.push(
      textComponent('🍾 ของฝากของคุณ', {
        size: 'sm',
        color: COLORS.textSecondary,
        margin: 'lg',
        weight: 'bold',
      }),
      labelValueRow(
        'รายการที่ยังอยู่',
        `${formatNumber(active_deposit_count)} รายการ`,
        { color: COLORS.green },
      ),
      textComponent('กดปุ่มด้านล่างเพื่อดูรายละเอียด / ขอเบิก', {
        size: 'xs',
        color: COLORS.textMuted,
        margin: 'md',
        wrap: true,
      }),
    );
  } else {
    bodyContents.push(
      textComponent('ยังไม่มีของฝากที่สาขานี้', {
        size: 'sm',
        color: COLORS.textSecondary,
        margin: 'lg',
        weight: 'bold',
      }),
      textComponent(
        'กดปุ่มด้านล่างเพื่อเปิดระบบฝากเหล้า — สามารถดูประวัติ, ตรวจสอบวันหมดอายุ, และขอเบิกได้จากหน้าเดียว',
        {
          size: 'xs',
          color: COLORS.textMuted,
          margin: 'md',
          wrap: true,
        },
      ),
    );
  }

  return {
    type: 'flex',
    altText: `เปิดระบบฝากเหล้า ${store_name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox(`🍾 ${bot_name}`, COLORS.green),
      body: bodyBox(bodyContents),
      footer: footerBox([
        {
          type: 'button',
          action: {
            type: 'uri',
            label: hasItems ? 'เปิดระบบฝากเหล้า' : 'เริ่มต้นใช้งาน',
            uri: entry_url,
          },
          style: 'primary',
          color: COLORS.green,
          height: 'sm',
        },
        textComponent('พิมพ์ DEP-xxxxx เพื่อตรวจสอบรหัสฝาก', {
          size: 'xs',
          color: COLORS.textMuted,
          wrap: true,
          align: 'center',
          margin: 'sm',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.green },
        footer: { separator: true },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (q) groupIdFlex — reply when staff types "groupid" inside a LINE group
//
// Sent alongside a plain-text message containing ONLY the raw group id, so
// the staff can long-press the text bubble to copy it directly without
// needing a clipboard action (which LINE's Flex spec does not support).
// ---------------------------------------------------------------------------

interface GroupIdFlexParams {
  group_id: string;
  group_name?: string | null;
}

export function groupIdFlex(params: GroupIdFlexParams): FlexMessage {
  const { group_id, group_name } = params;

  return {
    type: 'flex',
    altText: `Group ID: ${group_id}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: headerBox('✅ Group ID', COLORS.green),
      body: bodyBox([
        textComponent('นี่คือ LINE Group ID ของกลุ่มนี้', {
          size: 'sm',
          color: COLORS.textSecondary,
          wrap: true,
        }),
        textComponent(
          group_name ? `กลุ่ม: ${group_name}` : 'ใช้สำหรับตั้งค่าการแจ้งเตือนของสาขา',
          {
            size: 'xs',
            color: COLORS.textMuted,
            margin: 'sm',
            wrap: true,
          },
        ),
        separatorComponent(),
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          paddingAll: 'md',
          backgroundColor: '#F5F5F5',
          cornerRadius: '8px',
          contents: [
            textComponent('GROUP ID', {
              size: 'xs',
              color: COLORS.textMuted,
              weight: 'bold',
            }),
            textComponent(group_id, {
              size: 'sm',
              color: COLORS.textPrimary,
              weight: 'bold',
              wrap: true,
              margin: 'sm',
            }),
          ],
        },
        textComponent('📋 แตะค้างที่ข้อความด้านล่างเพื่อคัดลอก', {
          size: 'xs',
          color: COLORS.textMuted,
          margin: 'lg',
          wrap: true,
          align: 'center',
        }),
      ]),
      styles: {
        header: { backgroundColor: COLORS.green },
      },
    },
  };
}
