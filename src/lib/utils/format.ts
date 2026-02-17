const thaiDateFormatter = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'long',
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

export function formatThaiDate(date: string | Date): string {
  return thaiDateFormatter.format(new Date(date));
}

export function formatThaiDateTime(date: string | Date): string {
  return thaiDateTimeFormatter.format(new Date(date));
}

export function formatThaiShortDate(date: string | Date): string {
  return thaiShortDateFormatter.format(new Date(date));
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

export function daysUntil(date: string | Date): number {
  const target = new Date(date);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
