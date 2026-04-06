/**
 * Timezone-aware date utilities for GMT+7 (Asia/Bangkok).
 *
 * All server/client date operations that affect business logic
 * (e.g. "today", expiry calculations, day-of-week) MUST use these
 * helpers instead of raw `new Date()`.
 *
 * Raw `new Date()` is still fine for:
 * - Millisecond-diff calculations (e.g. timeAgo)
 * - Passing to Intl formatters that specify timeZone
 */

const TZ = 'Asia/Bangkok';

// ---------------------------------------------------------------------------
// Core: "now" in Bangkok
// ---------------------------------------------------------------------------

/**
 * Return a Date object whose `.getFullYear()`, `.getMonth()`, `.getDate()`,
 * `.getHours()` etc. reflect the current wall-clock time in Bangkok (GMT+7).
 *
 * Implementation: format the current instant as individual numeric parts in
 * Asia/Bangkok, then construct a Date from those parts.  The resulting Date's
 * internal UTC value is *not* meaningful — only the local-accessor values are.
 */
export function nowBangkok(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value || '0', 10);

  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}

// ---------------------------------------------------------------------------
// Date strings
// ---------------------------------------------------------------------------

/**
 * "Today" as YYYY-MM-DD in Bangkok timezone.
 * Use for Supabase date filters, input defaults, etc.
 */
export function todayBangkok(): string {
  const d = nowBangkok();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * "Yesterday" as YYYY-MM-DD in Bangkok timezone.
 * Bars operate past midnight, so the business date = yesterday.
 */
export function yesterdayBangkok(): string {
  const d = nowBangkok();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convert a Date to an ISO-8601 string **in the Bangkok timezone** (+07:00).
 * Useful when storing timestamps that must reflect the Bangkok wall-clock.
 */
export function toBangkokISO(date?: Date): string {
  const d = date ?? new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  // sv-SE locale formats as "YYYY-MM-DD HH:mm:ss"
  const str = formatter.format(d);
  return str.replace(' ', 'T') + '+07:00';
}

// ---------------------------------------------------------------------------
// Day-of-week
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Current day-of-week abbreviation in Bangkok timezone.
 * Returns 'Sun' | 'Mon' | ... | 'Sat'
 */
export function dayOfWeekBangkok(): (typeof DAY_NAMES)[number] {
  return DAY_NAMES[nowBangkok().getDay()];
}

// ---------------------------------------------------------------------------
// Arithmetic helpers
// ---------------------------------------------------------------------------

/**
 * Return a new Date that is `days` calendar days from now in Bangkok timezone,
 * as a UTC ISO string suitable for Supabase TIMESTAMPTZ columns.
 *
 * Positive = future, negative = past.
 */
export function daysFromNowISO(days: number): string {
  const d = nowBangkok();
  d.setDate(d.getDate() + days);
  // Set to start-of-day or end-of-day as needed
  d.setHours(0, 0, 0, 0);
  // Convert back: we know this represents a Bangkok midnight
  // Bangkok = UTC+7, so Bangkok midnight = 17:00 UTC previous day
  const utc = new Date(d.getTime() - 7 * 60 * 60 * 1000);
  // But for "days from now" comparison we typically want the exact moment
  // So return the current moment + days offset instead
  const now = new Date();
  now.setTime(now.getTime() + days * 24 * 60 * 60 * 1000);
  return now.toISOString();
}

/**
 * Return a Date representing N hours ago (absolute UTC).
 * This is timezone-independent — used for "created more than X hours ago" queries.
 */
export function hoursAgoISO(hours: number): string {
  const d = new Date();
  d.setTime(d.getTime() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

/**
 * Calculate expiry date: today in Bangkok + N days, returns ISO string.
 * Sets to end of day in Bangkok (23:59:59) so expiry includes the full day.
 */
export function expiryDateISO(days: number): string {
  const d = nowBangkok();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  // Convert Bangkok 23:59:59 to UTC: subtract 7 hours
  const utcMs = d.getTime() - 7 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/**
 * Extend an existing expiry date by N days.  If the current expiry is in the
 * past, extends from "now" instead.
 */
export function extendExpiryISO(currentExpiry: string | null, days: number): string {
  const base = currentExpiry ? new Date(currentExpiry) : new Date();
  base.setTime(base.getTime() + days * 24 * 60 * 60 * 1000);
  return base.toISOString();
}

/**
 * Start of "today" in Bangkok as a UTC ISO string (Bangkok 00:00:00 → UTC).
 */
export function startOfTodayBangkokISO(): string {
  const d = nowBangkok();
  d.setHours(0, 0, 0, 0);
  const utcMs = d.getTime() - 7 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/**
 * End of "today" in Bangkok as a UTC ISO string (Bangkok 23:59:59 → UTC).
 */
export function endOfTodayBangkokISO(): string {
  const d = nowBangkok();
  d.setHours(23, 59, 59, 999);
  const utcMs = d.getTime() - 7 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/**
 * N days ago from today in Bangkok, start-of-day, as UTC ISO string.
 */
export function daysAgoBangkokISO(days: number): string {
  const d = nowBangkok();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  const utcMs = d.getTime() - 7 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/**
 * Format hours and minutes from a Date-like value in Bangkok timezone.
 * Returns "HH:mm" string.
 */
export function formatTimeBangkok(date: string | Date): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

// ---------------------------------------------------------------------------
// Withdrawal day helpers
// ---------------------------------------------------------------------------

/**
 * คำนวณช่วง "กะทำงาน" ปัจจุบันของร้านตามเวลาเปิด-ปิด
 *
 * ร้านเปิด 12:00 ปิด 06:00 (ข้ามวัน):
 * - เวลา 20:33 วันที่ 6 → กะ 6/4 12:00 ถึง 7/4 06:00 → return { from: '2026-04-06', to: '2026-04-07' }
 * - เวลา 03:00 วันที่ 7 → ยังอยู่ในกะวันที่ 6 → return { from: '2026-04-06', to: '2026-04-07' }
 * - เวลา 10:00 วันที่ 7 → ก่อนเปิดร้าน ยังไม่มีกะใหม่ → แสดงกะเมื่อวาน
 *
 * @param startHour ชั่วโมงเปิดร้าน (default 12)
 * @param endHour ชั่วโมงปิดร้าน (default 6, ข้ามวัน)
 */
export function currentShiftRange(
  startHour: number = 12,
  endHour: number = 6,
): { from: string; to: string } {
  const now = nowBangkok();
  const hour = now.getHours();

  // กรณีข้ามวัน: startHour > endHour (เช่น 12:00 - 06:00)
  const isOvernight = startHour > endHour;

  let shiftDate: Date;

  if (isOvernight) {
    if (hour >= startHour) {
      // หลังเปิดร้าน เช่น 20:33 → กะของวันนี้
      shiftDate = new Date(now);
    } else if (hour < endHour) {
      // หลังเที่ยงคืน แต่ร้านยังไม่ปิด เช่น 03:00 → กะของเมื่อวาน
      shiftDate = new Date(now);
      shiftDate.setDate(shiftDate.getDate() - 1);
    } else {
      // ระหว่างปิดร้านถึงเปิดร้าน เช่น 10:00 → แสดงกะล่าสุด (เมื่อวาน)
      shiftDate = new Date(now);
      shiftDate.setDate(shiftDate.getDate() - 1);
    }
  } else {
    // กรณีไม่ข้ามวัน (เช่น 09:00 - 17:00)
    if (hour >= startHour) {
      shiftDate = new Date(now);
    } else {
      shiftDate = new Date(now);
      shiftDate.setDate(shiftDate.getDate() - 1);
    }
  }

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const from = fmt(shiftDate);
  const toDate = new Date(shiftDate);
  toDate.setDate(toDate.getDate() + 1);
  const to = fmt(toDate);

  return { from, to };
}

/**
 * Check if in-store withdrawal is currently blocked based on store settings.
 * ใช้วันปฏิทินจริง (ไม่มี cutoff) — ตี 1 วันอาทิตย์ = อาทิตย์ = เบิกได้
 *
 * Returns { blocked, calendarDay, reason } for UI messaging.
 */
export function isWithdrawalBlocked(
  blockedDays: string[] = ['Fri', 'Sat'],
): { blocked: boolean; calendarDay: string; reason?: string } {
  const dayName = dayOfWeekBangkok();
  const blocked = blockedDays.includes(dayName);
  const dayNamesTH: Record<string, string> = {
    Sun: 'อาทิตย์', Mon: 'จันทร์', Tue: 'อังคาร', Wed: 'พุธ',
    Thu: 'พฤหัสบดี', Fri: 'ศุกร์', Sat: 'เสาร์',
  };
  return {
    blocked,
    calendarDay: dayName,
    reason: blocked
      ? `วัน${dayNamesTH[dayName]}ไม่สามารถเบิกเหล้าใช้ในร้านได้ (เบิกกลับบ้านได้)`
      : undefined,
  };
}

/**
 * Calculate the "effective" expiry date, accounting for:
 * 1. Blocked withdrawal days — ถ้าหมดอายุตรงวันห้ามเบิก ขยายไปวันถัดไปที่เบิกได้
 * 2. Store working hours — ขยายถึงเวลาปิดร้าน (เช่น ตี 6) ของวันที่เบิกได้
 *
 * storeEndHour = ชั่วโมงปิดร้าน (จาก print_server_working_hours.endHour, default 6)
 *
 * Example: expiry=Saturday 23:59, blockedDays=[Fri,Sat], endHour=6
 *          → effective expiry = Monday 06:00 (วันอาทิตย์ + grace ถึงตี 6 วันจันทร์)
 */
export function effectiveExpiryISO(
  expiryDate: string,
  blockedDays: string[] = ['Fri', 'Sat'],
  storeEndHour: number = 6,
): string {
  const expiry = new Date(expiryDate);

  // Get the Bangkok day-of-week for the expiry date
  const expiryBangkok = new Date(
    expiry.getTime() + 7 * 60 * 60 * 1000, // Convert to Bangkok wall-clock
  );

  let dayIndex = expiryBangkok.getDay();
  let daysAdded = 0;

  // If expiry falls on a blocked day, keep adding days until we find a non-blocked day
  while (blockedDays.includes(DAY_NAMES[dayIndex]) && daysAdded < 7) {
    daysAdded++;
    dayIndex = (dayIndex + 1) % 7;
  }

  if (daysAdded === 0) {
    // Expiry is not on a blocked day — just add store closing grace
    const graced = new Date(expiry.getTime());
    graced.setTime(graced.getTime() + storeEndHour * 60 * 60 * 1000);
    return graced.toISOString();
  }

  // Extend expiry by daysAdded to the next non-blocked day
  const extended = new Date(expiry.getTime());
  extended.setTime(extended.getTime() + daysAdded * 24 * 60 * 60 * 1000);

  // Add store closing grace (e.g. until 6 AM of the following day)
  extended.setTime(extended.getTime() + storeEndHour * 60 * 60 * 1000);

  return extended.toISOString();
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/**
 * Get month/date components from Bangkok timezone for code generation etc.
 */
export function bangkokDateParts(): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
} {
  const d = nowBangkok();
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hours: d.getHours(),
    minutes: d.getMinutes(),
  };
}
