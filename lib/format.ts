// Dates are formatted in UTC with a fixed locale so the server and the browser
// render the same string (a mismatch is a hydration error). Showing them in
// each person's own time zone comes with real accounts.

const dateLong = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const formatDate = (iso: string) => dateLong.format(new Date(iso));
export const formatShortDate = (iso: string) => dateShort.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatMonth = (d: Date) => monthYear.format(d);

/** `2026-10-07` for a timestamp, in UTC: the key the calendar groups runs by. */
export const dayKey = (iso: string) => iso.slice(0, 10);

export function timeAgo(iso: string, now: string): string {
  const minutes = Math.round((Date.parse(now) - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatShortDate(iso);
}

/** `horizonvisa.example` from `https://www.horizonvisa.example/path`. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

const dayShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** `Mon 12 Oct`. */
export const formatDayShort = (iso: string) => dayShort.format(new Date(iso)).replace(',', '');
