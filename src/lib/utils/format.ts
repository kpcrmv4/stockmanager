const thaiDateFormatter = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'Asia/Bangkok',
});

const thaiDateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
});

const thaiShortDateFormatter = new Intl.DateTimeFormat('th-TH', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'Asia/Bangkok',
});

export function formatThaiDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return thaiDateFormatter.format(d);
}

export function formatThaiDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return thaiDateTimeFormatter.format(d);
}

export function formatThaiShortDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return thaiShortDateFormatter.format(d);
}

export function formatNumber(num: number, decimals = 0): string {
  return num.toLocaleString('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(amount: number): string {
  return `฿${formatNumber(amount, 2)}`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value, 1)}%`;
}

/**
 * Calculate days until a target date.
 * Uses absolute UTC timestamps — timezone-independent because both
 * endpoints reference the same instant.
 */
export function daysUntil(date: string | Date): number {
  const target = new Date(date).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}
