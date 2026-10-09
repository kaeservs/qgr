// Times in the team's own zone. Everything else on the dashboard is shown in
// UTC (lib/format.ts); a scan schedule and a post's time are wall times the
// team picked, so they are shown in the zone they were picked in. The server
// and the browser format with the same zone and locale, so they agree.

import type { AgentSettings, ScanEvery } from './types';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Zones offered on Settings: where the team and its audience are. Any other valid zone is kept if it is already set. */
export const TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Ho_Chi_Minh',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
] as const;

/** `New York` for `America/New_York`. */
export const zoneLabel = (zone: string) => (zone === 'UTC' ? 'UTC' : (zone.split('/').pop() ?? zone).replace(/_/g, ' '));

export const isTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const pad = (n: number) => String(n).padStart(2, '0');
export const hourLabel = (hour: number) => `${pad(hour)}:00`;

/** `Scans every Monday, 09:00`; null while scans are off. */
export function scanLabel(s: Pick<AgentSettings, 'scanEvery' | 'scanDay' | 'scanHour'>): string | null {
  if (s.scanEvery === 'off') return null;
  const when = s.scanEvery === 'day' ? 'every day' : `every ${WEEKDAYS[s.scanDay - 1] ?? 'Monday'}`;
  return `Scans ${when}, ${hourLabel(s.scanHour)}`;
}

export const SCAN_EVERY_LABEL: Record<ScanEvery, string> = { off: 'Only when you ask', day: 'Every day', week: 'Every week' };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${zone}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: isTimeZone(zone) ? zone : 'UTC' });
    formatters.set(key, f);
  }
  return f;
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `Thu 8 Oct` for a wall date `YYYY-MM-DD`. Spelled out here rather than by
 * Intl: browsers and Node disagree on the short forms (`Mon, 28 Sept` against
 * `Mon 28 Sep`), and a client component must render the same text as the
 * server.
 */
export function dayLabel(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return `${DAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** `Tue 13 Oct, 09:00` in the zone. */
export function formatInZone(iso: string, zone: string): string {
  const { date, time } = wallTime(iso, zone);
  return `${dayLabel(date)}, ${time}`;
}

/** The wall date and time of an instant in a zone, as a date and a time input hold them. */
export function wallTime(iso: string, zone: string): { date: string; time: string } {
  const parts = formatter(zone, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** `2026-10-13 09:00`, as schedule_post reads a wall time; null for anything else. */
export function localTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined || h > 23 || m > 59) return null;
  return `${date} ${time}`;
}

/** The `YYYY-MM-DD` day of an instant in a zone: the key the calendar groups posts by. */
export const dayInZone = (iso: string, zone: string) => wallTime(iso, zone).date;

/** The instant a wall time (`YYYY-MM-DD HH:MM`) names in a zone, as ISO; DST-aware. */
export function zonedToUtc(local: string, zone: string): string {
  const [date = '', time = ''] = local.split(' ');
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  // Guess the instant as if the zone were UTC, then correct by the zone's offset there, twice for a DST edge.
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const wall = wallTime(new Date(guess).toISOString(), zone);
    const [wy = 0, wmo = 1, wd = 1] = wall.date.split('-').map(Number);
    const [wh = 0, wmi = 0] = wall.time.split(':').map(Number);
    guess += target - Date.UTC(wy, wmo - 1, wd, wh, wmi);
  }
  return new Date(guess).toISOString();
}

/**
 * The next time a scan schedule falls due after `now`, worked out in the
 * zone's wall time. The database's next_scan_at() is the one that counts;
 * this serves the sample data, which has no database.
 */
export function nextScanAt(s: Pick<AgentSettings, 'scanEvery' | 'scanDay' | 'scanHour' | 'timeZone'>, now: string): string | null {
  if (s.scanEvery === 'off') return null;
  const start = wallTime(now, s.timeZone).date;
  for (let i = 0; i <= 8; i++) {
    const day = new Date(`${start}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + i);
    const date = day.toISOString().slice(0, 10);
    const weekday = ((day.getUTCDay() + 6) % 7) + 1;
    if (s.scanEvery === 'week' && weekday !== s.scanDay) continue;
    const at = zonedToUtc(`${date} ${hourLabel(s.scanHour)}`, s.timeZone);
    if (Date.parse(at) > Date.parse(now)) return at;
  }
  return null;
}
