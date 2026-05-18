const TUNISIA_TZ = 'Africa/Tunis';

export function tunisiaDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TUNISIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function tunisiaParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TUNISIA_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    weekday: weekdayMap[weekdayStr] ?? 0,
  };
}

/** UTC instant for start of Tunisia calendar day */
export function tunisiaDayStartUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+01:00`);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = tunisiaDayStartUtc(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return tunisiaDateKey(d);
}

export function isGameOpenOnDate(
  scheduleMode: string,
  calendarDays: number[],
  weekdays: number[],
  dateKey = tunisiaDateKey(),
): boolean {
  if (scheduleMode === 'ALL_DAYS') return true;
  const p = tunisiaParts(tunisiaDayStartUtc(dateKey));
  if (scheduleMode === 'CALENDAR_DAYS') {
    return calendarDays.includes(p.day);
  }
  if (scheduleMode === 'WEEKDAYS') {
    return weekdays.includes(p.weekday);
  }
  return false;
}
