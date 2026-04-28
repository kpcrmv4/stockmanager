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
    header?: Record<string, unknown>;
    body?: Record<string, unknown>;
    footer?: Record<string, unknown>;
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
// Bottle Keeper theme — used by every customer-facing flex
// ---------------------------------------------------------------------------
//
// Deep red header / cream body / red CTA. The customer sees the same
// visual language across the entire deposit lifecycle (entry card,
// confirmation, rejection, withdrawal, expiry warning, link flow).
const BK = {
  // Header
  headerBg:    '#9B2A2A',
  headerTitle: '#F5D08C',  // gold/cream — for the big title
  headerSub:   '#E8C7A0',  // muted cream — for the branch name under the title
  // Body
  bodyBg:      '#FFF8EE',
  textDark:    '#1F1411',
  textMuted:   '#7A6A60',
  brandRed:    '#9B2A2A',  // accent — links / values that pop
  brandRedSoft:'#FBE9E2',  // light pink/cream — info pill / item box
  divider:     '#EFE3D2',
  // Footer
  ctaBg:       '#9B2A2A',
  ctaBgDim:    '#7A2222',
  ctaText:     '#FFFFFF',
  // Status accents
  successCheckBg: '#3FAA64',
  warningOrange:  '#D7833A',
} as const;

/** Header for Bottle Keeper customer cards.
 *  Title = gold/cream large, optional subtitle (branch) below smaller. */
function bkHeader(opts: {
  title: string;
  subtitle?: string;
  /** A small visual cue at the top of the header — emoji string */
  emoji?: string;
}): FlexBox {
  const contents: Record<string, unknown>[] = [];
  if (opts.emoji) {
    contents.push(textComponent(opts.emoji, {
      size: '4xl',
      align: 'center',
      color: BK.headerTitle,
    }));
  }
  contents.push(textComponent(opts.title, {
    size: 'xl',
    weight: 'bold',
    align: 'center',
    color: BK.headerTitle,
    wrap: true,
    margin: opts.emoji ? 'md' : 'none',
  }));
  if (opts.subtitle) {
    contents.push(textComponent(opts.subtitle, {
      size: 'sm',
      align: 'center',
      color: BK.headerSub,
      wrap: true,
      margin: 'sm',
    }));
  }
  return {
    type: 'box',
    layout: 'vertical',
    contents,
    paddingAll: 'xl',
    backgroundColor: BK.headerBg,
  };
}

/** Body container for Bottle Keeper cards (cream bg, normal padding). */
function bkBody(contents: Record<string, unknown>[]): FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    contents,
    paddingAll: 'xl',
    backgroundColor: BK.bodyBg,
    spacing: 'none',
  };
}

/** Single "Open Bottle Keeper"-style CTA button as the footer. */
function bkFooterButton(label: string, uri: string): FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [{
      type: 'button',
      style: 'primary',
      color: BK.ctaBg,
      height: 'md',
      action: { type: 'uri', label, uri },
    }],
    paddingAll: 'lg',
    backgroundColor: BK.bodyBg,
  };
}

/** Two-column row: muted label on the left, dark value on the right. */
function bkRow(label: string, value: string, valueColor: string = BK.textDark): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      textComponent(label, { size: 'sm', color: BK.textMuted, flex: 0 }),
      textComponent(value, {
        size: 'sm', weight: 'bold', color: valueColor, align: 'end', flex: 1, wrap: true,
      }),
    ],
    margin: 'md',
  };
}

/** Light-pink boxed item summary — see Withdrawal Complete card. */
function bkItemBox(items: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    contents: items,
    paddingAll: 'lg',
    backgroundColor: BK.brandRedSoft,
    cornerRadius: '12px',
    margin: 'lg',
    spacing: 'sm',
  };
}

/** Small info pill row — used for "📦 30-day storage". */
function bkInfoPill(text: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [textComponent(text, {
      size: 'sm', color: BK.textDark, weight: 'bold', align: 'center', wrap: true,
    })],
    paddingAll: 'md',
    backgroundColor: BK.brandRedSoft,
    cornerRadius: '8px',
    margin: 'lg',
  };
}

/** A faint horizontal divider that matches the cream body. */
function bkDivider(): Record<string, unknown> {
  return { type: 'separator', margin: 'lg', color: BK.divider };
}

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
// (a) depositConfirmedFlex — Bottle Keeper themed
// ---------------------------------------------------------------------------

interface DepositConfirmedItem {
  product_name: string;
  quantity: number;
  /** Per-bottle remaining %, optional. If multiple bottles share one
   *  product line, pass the average or omit. */
  remaining_percent?: number;
}

interface DepositConfirmedParams {
  /** Single deposit code (back-compat) — required when only 1 deposit */
  deposit_code: string;
  /** When the bar confirms a batch of deposits (multiple DEP codes
   *  uploaded together as one photo), pass the full list here. The
   *  card will show a "+N more" hint if there are too many to fit. */
  deposit_codes?: string[];
  /** Single line back-compat — ignored when items[] is provided */
  product_name: string;
  quantity: number;
  /** Multi-bottle / multi-product breakdown. Each row is one product
   *  line. If omitted, falls back to `[{ product_name, quantity }]`. */
  items?: DepositConfirmedItem[];
  store_name: string;
  expiry_date: string;
  /** Customer display name (LINE profile or staff-entered) */
  customer_name?: string | null;
  /** Customer phone (for the small caption below name) */
  customer_phone?: string | null;
  /** "Open Bottle Keeper" entry url — when provided, the footer becomes
   *  a CTA button instead of a hint line. */
  entry_url?: string | null;
}

/**
 * "Deposit Confirmed" card sent to the customer after the bar accepts
 * the bottle(s). Red header / cream body / red CTA. Supports one bottle
 * or many — pass `items[]` (and optionally `deposit_codes[]`) when the
 * customer fronted multiple in one batch.
 */
export function depositConfirmedFlex(params: DepositConfirmedParams): FlexMessage {
  const {
    deposit_code, deposit_codes, product_name, quantity, items,
    store_name, expiry_date, customer_name, customer_phone, entry_url,
  } = params;

  const lines: DepositConfirmedItem[] = items && items.length > 0
    ? items
    : [{ product_name, quantity }];
  const totalBottles = lines.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
  const codes = deposit_codes && deposit_codes.length > 0 ? deposit_codes : [deposit_code];

  // ── Item list inside the cream body ──
  const itemRows: Record<string, unknown>[] = [];
  itemRows.push(textComponent(lines.length === 1 ? 'ITEM' : `ITEMS (${lines.length})`, {
    size: 'xs', color: BK.textMuted, weight: 'bold',
  }));
  for (const it of lines) {
    const qtyLabel = `${formatNumber(it.quantity)} ${it.quantity === 1 ? 'bottle' : 'bottles'}`;
    if (typeof it.remaining_percent === 'number') {
      // 2-column row: name+qty on the left, % on the right
      itemRows.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        contents: [
          {
            type: 'box', layout: 'vertical', flex: 3, contents: [
              textComponent(it.product_name, {
                size: 'md', weight: 'bold', color: BK.textDark, wrap: true,
              }),
              textComponent(qtyLabel, { size: 'xs', color: BK.textMuted, margin: 'xs' }),
            ],
          },
          {
            type: 'box', layout: 'vertical', flex: 2, contents: [
              textComponent(`${Math.round(it.remaining_percent)}%`, {
                size: 'xxl', weight: 'bold', color: BK.brandRed, align: 'end',
              }),
              textComponent('Remaining', {
                size: 'xs', color: BK.brandRed, align: 'end', margin: 'xs',
              }),
            ],
          },
        ],
      });
    } else {
      itemRows.push({
        type: 'box',
        layout: 'vertical',
        margin: 'sm',
        contents: [
          textComponent(it.product_name, {
            size: 'md', weight: 'bold', color: BK.textDark, wrap: true,
          }),
          textComponent(qtyLabel, { size: 'xs', color: BK.textMuted, margin: 'xs' }),
        ],
      });
    }
  }

  // Body
  const bodyContents: Record<string, unknown>[] = [];
  if (customer_name) {
    bodyContents.push(textComponent(customer_name, {
      size: 'lg', weight: 'bold', align: 'center', color: BK.textDark, wrap: true,
    }));
    if (customer_phone) {
      bodyContents.push(textComponent(customer_phone, {
        size: 'sm', align: 'center', color: BK.textMuted, margin: 'xs',
      }));
    }
    bodyContents.push(bkDivider());
  }
  bodyContents.push(...itemRows);
  bodyContents.push(bkDivider());

  // Deposit dates / codes
  const today = new Date();
  bodyContents.push(bkRow('Deposit Date', formatEnDate(today)));
  bodyContents.push(bkRow('Expiry Date', formatEnDate(expiry_date), BK.brandRed));
  if (codes.length === 1) {
    bodyContents.push(bkRow('Deposit Code', codes[0]));
  } else {
    bodyContents.push(textComponent('Deposit Codes', {
      size: 'sm', color: BK.textMuted, margin: 'md',
    }));
    const preview = codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3} more` : '');
    bodyContents.push(textComponent(preview, {
      size: 'sm', color: BK.textDark, weight: 'bold', wrap: true, margin: 'xs',
    }));
  }

  bodyContents.push(bkInfoPill('📦  30-day storage'));

  return {
    type: 'flex',
    altText: `Deposit Confirmed — ${lines[0].product_name}${lines.length > 1 ? ` +${lines.length - 1} more` : ''} (${totalBottles} ${totalBottles === 1 ? 'bottle' : 'bottles'})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({ emoji: '🍷', title: 'Deposit Confirmed', subtitle: store_name }),
      body: bkBody(bodyContents),
      footer: entry_url
        ? bkFooterButton('📱  Open Bottle Keeper', entry_url)
        : {
            type: 'box',
            layout: 'vertical',
            contents: [textComponent('Show this code at the bar to withdraw', {
              size: 'xs', color: BK.textMuted, wrap: true, align: 'center',
            })],
            paddingAll: 'lg',
            backgroundColor: BK.bodyBg,
          },
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
      },
    },
  };
}

/** Format a date as "13 Dec 2025" (English short, Asia/Bangkok tz). */
function formatEnDate(d: string | Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  });
}

// ---------------------------------------------------------------------------
// (a2) depositRejectedFlex — Bottle Keeper themed
// ---------------------------------------------------------------------------

interface DepositRejectedParams {
  /** Product name(s). When multiple, pass the joined string e.g. "Angostura, 818 Blanco". */
  product_name: string;
  store_name: string;
  reason: string;
  customer_name?: string | null;
  customer_phone?: string | null;
}

/**
 * "Deposit Could Not Be Accepted" card — apologetic, with the reason
 * staff entered. Same red header / cream body palette as the other
 * customer cards; the item box switches to the soft-pink variant to
 * keep things calm rather than alarming.
 */
export function depositRejectedFlex(params: DepositRejectedParams): FlexMessage {
  const { product_name, store_name, reason, customer_name, customer_phone } = params;

  const bodyContents: Record<string, unknown>[] = [];
  if (customer_name) {
    bodyContents.push(textComponent(customer_name, {
      size: 'lg', weight: 'bold', align: 'center', color: BK.textDark, wrap: true,
    }));
    if (customer_phone) {
      bodyContents.push(textComponent(customer_phone, {
        size: 'sm', align: 'center', color: BK.textMuted, margin: 'xs',
      }));
    }
    bodyContents.push(bkDivider());
  }

  bodyContents.push(textComponent('We could not accept your deposit', {
    size: 'md', weight: 'bold', align: 'center', color: BK.brandRed, wrap: true,
  }));

  bodyContents.push(bkItemBox([
    textComponent('ITEM', { size: 'xs', color: BK.textMuted, weight: 'bold' }),
    textComponent(product_name, {
      size: 'md', weight: 'bold', color: BK.brandRed, wrap: true, margin: 'xs',
    }),
    textComponent('REASON', { size: 'xs', color: BK.textMuted, weight: 'bold', margin: 'md' }),
    textComponent(reason || '-', {
      size: 'sm', color: BK.textDark, wrap: true, margin: 'xs',
    }),
  ]));

  bodyContents.push(textComponent('Please speak with our staff for details', {
    size: 'xs', color: BK.textMuted, align: 'center', wrap: true, margin: 'lg',
  }));

  return {
    type: 'flex',
    altText: `Deposit not accepted — ${product_name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({ emoji: '⚠️', title: 'Deposit Not Accepted', subtitle: store_name }),
      body: bkBody(bodyContents),
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [textComponent('Sorry for the inconvenience.', {
          size: 'xs', color: BK.textMuted, wrap: true, align: 'center',
        })],
        paddingAll: 'lg',
        backgroundColor: BK.bodyBg,
      },
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
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
export function withdrawalCompletedFlex(params: WithdrawalCompletedParams & {
  deposit_code?: string;
  customer_name?: string | null;
}): FlexMessage {
  const { product_name, actual_qty, remaining_qty, store_name, deposit_code, customer_name } = params;
  const today = formatEnDate(new Date());

  const bodyContents: Record<string, unknown>[] = [];
  if (customer_name) {
    bodyContents.push(textComponent(customer_name, {
      size: 'lg', weight: 'bold', color: BK.textDark, wrap: true,
    }));
  }
  bodyContents.push(textComponent('Your withdrawal has been processed!', {
    size: 'sm', weight: 'bold', color: BK.brandRed, margin: customer_name ? 'sm' : 'none', wrap: true,
  }));
  bodyContents.push(bkDivider());

  // Item box (cream/pink)
  bodyContents.push(bkItemBox([
    textComponent('Item Withdrawn', { size: 'xs', color: BK.textMuted, weight: 'bold' }),
    textComponent(product_name, {
      size: 'xl', weight: 'bold', color: BK.brandRed, wrap: true, margin: 'xs',
    }),
    textComponent('Quantity', { size: 'xs', color: BK.textMuted, weight: 'bold', margin: 'md' }),
    textComponent(`${formatNumber(actual_qty)} ${actual_qty === 1 ? 'bottle' : 'bottles'}`, {
      size: 'xl', weight: 'bold', color: BK.brandRed, margin: 'xs',
    }),
  ]));

  if (deposit_code) {
    bodyContents.push(bkRow('Deposit Code', deposit_code));
  }
  bodyContents.push(bkRow('Withdrawal Date', today, BK.brandRed));
  bodyContents.push(bkRow(
    'Remaining',
    `${formatNumber(remaining_qty)} ${remaining_qty === 1 ? 'bottle' : 'bottles'}`,
    remaining_qty > 0 ? BK.textDark : BK.brandRed,
  ));

  return {
    type: 'flex',
    altText: `Withdrawal Complete — ${product_name} (${formatNumber(actual_qty)})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({ emoji: '✅', title: 'Withdrawal Complete', subtitle: store_name }),
      body: bkBody(bodyContents),
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [textComponent(
          remaining_qty > 0
            ? 'Our staff will serve you shortly!'
            : 'All your bottles have been withdrawn.',
          { size: 'sm', weight: 'bold', color: BK.brandRed, wrap: true, align: 'center' },
        )],
        paddingAll: 'lg',
        backgroundColor: BK.bodyBg,
      },
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (c) depositExpiryWarningFlex — Bottle Keeper themed
// ---------------------------------------------------------------------------

interface DepositExpiryWarningParams {
  deposit_code: string;
  product_name: string;
  remaining_qty: number;
  expiry_date: string;
  days_remaining: number;
  store_name?: string;
  customer_name?: string | null;
  entry_url?: string | null;
}

/**
 * "Bottles Expiring Soon" reminder. Uses the same red/cream Bottle
 * Keeper theme as the other customer cards; days-remaining gets a
 * highlighted callout in the body.
 */
export function depositExpiryWarningFlex(params: DepositExpiryWarningParams): FlexMessage {
  const {
    deposit_code, product_name, remaining_qty, expiry_date, days_remaining,
    store_name, customer_name, entry_url,
  } = params;

  const bodyContents: Record<string, unknown>[] = [];
  if (customer_name) {
    bodyContents.push(textComponent(customer_name, {
      size: 'lg', weight: 'bold', align: 'center', color: BK.textDark, wrap: true,
    }));
    bodyContents.push(bkDivider());
  }

  // Big "X days left" callout
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    paddingAll: 'lg',
    backgroundColor: BK.brandRedSoft,
    cornerRadius: '12px',
    contents: [
      textComponent(`${formatNumber(days_remaining)}`, {
        size: '4xl', weight: 'bold', align: 'center', color: BK.brandRed,
      }),
      textComponent(`${days_remaining === 1 ? 'day' : 'days'} until expiry`, {
        size: 'sm', align: 'center', color: BK.brandRed, margin: 'xs',
      }),
    ],
  });

  bodyContents.push(bkItemBox([
    textComponent('ITEM', { size: 'xs', color: BK.textMuted, weight: 'bold' }),
    textComponent(product_name, {
      size: 'md', weight: 'bold', color: BK.brandRed, wrap: true, margin: 'xs',
    }),
    textComponent(
      `${formatNumber(remaining_qty)} ${remaining_qty === 1 ? 'bottle' : 'bottles'} remaining`,
      { size: 'xs', color: BK.textMuted, margin: 'xs' },
    ),
  ]));

  bodyContents.push(bkRow('Deposit Code', deposit_code));
  bodyContents.push(bkRow('Expiry Date', formatEnDate(expiry_date), BK.brandRed));

  return {
    type: 'flex',
    altText: `Expiring soon — ${product_name} (${days_remaining} days)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({
        emoji: '⏳',
        title: 'Expiring Soon',
        subtitle: store_name || 'Bottle Keeper',
      }),
      body: bkBody(bodyContents),
      footer: entry_url
        ? bkFooterButton('📱  Open Bottle Keeper', entry_url)
        : {
            type: 'box',
            layout: 'vertical',
            contents: [textComponent('Please come withdraw before the expiry date.', {
              size: 'xs', color: BK.textMuted, wrap: true, align: 'center',
            })],
            paddingAll: 'lg',
            backgroundColor: BK.bodyBg,
          },
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
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
    altText: `Confirm deposit ${deposit_code}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({ emoji: '🔍', title: 'Is this your deposit?', subtitle: store_name }),
      body: bkBody([
        bkItemBox([
          textComponent('ITEM', { size: 'xs', color: BK.textMuted, weight: 'bold' }),
          textComponent(product_name, {
            size: 'lg', weight: 'bold', color: BK.brandRed, wrap: true, margin: 'xs',
          }),
          textComponent(`${formatNumber(remaining_qty)} ${remaining_qty === 1 ? 'bottle' : 'bottles'} remaining`, {
            size: 'xs', color: BK.textMuted, margin: 'xs',
          }),
        ]),
        bkRow('Deposit Code', deposit_code, BK.brandRed),
        bkRow('Customer', customer_name),
        textComponent('Tap "Yes" to link this deposit to your LINE account', {
          size: 'xs', color: BK.textMuted, align: 'center', wrap: true, margin: 'lg',
        }),
      ]),
      footer: {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'button',
            action: {
              type: 'postback',
              label: '✓ Yes, this is mine',
              data: `action=link_deposit&code=${deposit_code}&store_id=${store_id}`,
              displayText: `Linking ${deposit_code}`,
            },
            style: 'primary', color: BK.ctaBg, height: 'md', flex: 2,
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'Not mine',
              data: `action=cancel_link&code=${deposit_code}`,
              displayText: 'Not my deposit',
            },
            style: 'secondary', height: 'md', flex: 1,
          },
        ],
        spacing: 'sm',
        paddingAll: 'lg',
        backgroundColor: BK.bodyBg,
      },
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
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

export function claimMultipleDepositsFlex(params: ClaimMultipleDepositsParams): FlexMessage {
  const { codes, product_names, customer_name, store_name, store_id, primary_code } = params;

  const listItems: Record<string, unknown>[] = codes.slice(0, 6).map((code, i) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      textComponent(`${i + 1}.`, { size: 'sm', color: BK.textMuted, flex: 0 }),
      textComponent(`${code} — ${product_names[i] || ''}`, {
        size: 'sm', color: BK.textDark, flex: 1, wrap: true, margin: 'sm',
      }),
    ],
    margin: 'sm',
  }));
  if (codes.length > 6) {
    listItems.push(textComponent(`+${codes.length - 6} more`, {
      size: 'xs', color: BK.textMuted, margin: 'md',
    }));
  }

  return {
    type: 'flex',
    altText: `Confirm ${codes.length} deposits`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({
        emoji: '🍷',
        title: `${codes.length} Deposits Found`,
        subtitle: store_name,
      }),
      body: bkBody([
        textComponent(customer_name, {
          size: 'lg', weight: 'bold', align: 'center', color: BK.textDark, wrap: true,
        }),
        bkDivider(),
        bkItemBox(listItems),
        textComponent('Do these all belong to you?', {
          size: 'sm', color: BK.textMuted, align: 'center', wrap: true, margin: 'lg',
        }),
      ]),
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'postback',
              label: `✓ Yes, link all ${codes.length}`,
              data: `action=link_deposits_batch&codes=${codes.join(',')}&store_id=${store_id}`,
              displayText: `Linking all ${codes.length} deposits`,
            },
            style: 'primary', color: BK.ctaBg, height: 'md',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: `Only ${primary_code}`,
              data: `action=link_deposit&code=${primary_code}&store_id=${store_id}`,
              displayText: `Linking ${primary_code} only`,
            },
            style: 'secondary', height: 'sm', margin: 'sm',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'Not mine',
              data: `action=cancel_link&code=${primary_code}`,
              displayText: 'Not my deposits',
            },
            style: 'secondary', height: 'sm', margin: 'sm',
          },
        ],
        spacing: 'none',
        paddingAll: 'lg',
        backgroundColor: BK.bodyBg,
      },
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
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
    textComponent(customer_name, {
      size: 'lg', weight: 'bold', align: 'center', color: BK.textDark, wrap: true,
    }),
    textComponent('Linked to your account', {
      size: 'sm', weight: 'bold', align: 'center', color: BK.brandRed, margin: 'sm',
    }),
    bkDivider(),
    bkItemBox([
      textComponent('ITEM', { size: 'xs', color: BK.textMuted, weight: 'bold' }),
      textComponent(product_name, {
        size: 'lg', weight: 'bold', color: BK.brandRed, wrap: true, margin: 'xs',
      }),
      textComponent(`${formatNumber(remaining_qty)} / ${formatNumber(quantity)} ${quantity === 1 ? 'bottle' : 'bottles'} remaining`, {
        size: 'xs', color: BK.textMuted, margin: 'xs',
      }),
    ]),
    bkRow('Deposit Code', deposit_code, BK.brandRed),
  ];
  if (expiry_date) {
    bodyContents.push(bkRow('Expiry Date', formatEnDate(expiry_date), BK.brandRed));
  }

  return {
    type: 'flex',
    altText: `Linked ${deposit_code}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({ emoji: '🔗', title: 'Deposit Linked', subtitle: store_name }),
      body: bkBody(bodyContents),
      footer: bkFooterButton('📱  Open Bottle Keeper', customer_portal_url),
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
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

  const listItems: Record<string, unknown>[] = codes.slice(0, 8).map((code, i) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      textComponent('✓', { size: 'md', color: BK.brandRed, weight: 'bold', flex: 0 }),
      textComponent(`${code}  —  ${product_names[i] || ''}`, {
        size: 'sm', color: BK.textDark, flex: 1, wrap: true, margin: 'sm',
      }),
    ],
    margin: 'sm',
  }));
  if (codes.length > 8) {
    listItems.push(textComponent(`+${codes.length - 8} more`, {
      size: 'xs', color: BK.textMuted, margin: 'md',
    }));
  }

  return {
    type: 'flex',
    altText: `Linked ${codes.length} deposits`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({
        emoji: '🔗',
        title: `${codes.length} Deposits Linked`,
        subtitle: store_name,
      }),
      body: bkBody([
        textComponent('All linked to your account!', {
          size: 'sm', weight: 'bold', align: 'center', color: BK.brandRed, wrap: true,
        }),
        bkItemBox(listItems),
      ]),
      footer: bkFooterButton('📱  Open Bottle Keeper', customer_portal_url),
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
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
// (p) openDepositSystemFlex — reply when customer types "alcohol deposit" /
//                              "ฝากเหล้า" / similar trigger keywords
//
// Bottle Keeper themed: deep red header "Bottle Keeper" + branch name,
// cream body "Welcome!" + status, "30-day storage" pill, red CTA.
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
  /** Bot display name — kept for back-compat but no longer rendered */
  bot_name?: string;
}

export function openDepositSystemFlex(
  params: OpenDepositSystemParams,
): FlexMessage {
  const { store_name, active_deposit_count, customer_name, entry_url } = params;
  const hasItems = active_deposit_count > 0;

  const bodyContents: Record<string, unknown>[] = [
    textComponent('Welcome!', {
      size: 'xl', weight: 'bold', align: 'center', color: BK.textDark,
    }),
  ];
  if (customer_name) {
    bodyContents.push(textComponent(customer_name, {
      size: 'md', align: 'center', color: BK.textDark, wrap: true, margin: 'sm',
    }));
  }
  bodyContents.push(textComponent(
    hasItems
      ? `You have ${formatNumber(active_deposit_count)} ${active_deposit_count === 1 ? 'bottle' : 'bottles'} stored`
      : 'You have no bottles stored yet',
    { size: 'sm', align: 'center', color: BK.textMuted, wrap: true, margin: 'md' },
  ));
  bodyContents.push(bkInfoPill('📦  30-day storage'));

  return {
    type: 'flex',
    altText: `Open Bottle Keeper — ${store_name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: bkHeader({ emoji: '🍾', title: 'Bottle Keeper', subtitle: store_name }),
      body: bkBody(bodyContents),
      footer: bkFooterButton('📱  Open Bottle Keeper', entry_url),
      styles: {
        header: { backgroundColor: BK.headerBg },
        body: { backgroundColor: BK.bodyBg },
        footer: { backgroundColor: BK.bodyBg },
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
