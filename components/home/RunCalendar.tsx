'use client';

import { ChevronLeft, ChevronRight, Radar, Send } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cx } from '@/lib/cx';
import { dayKey, formatMonth } from '@/lib/format';
import { formatInZone } from '@/lib/schedule';
import styles from './home.module.css';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const monthStart = (iso: string) => {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** Weeks of the month, Monday first, padded with the neighbouring months' days. */
function weeksOf(month: Date): Date[][] {
  const first = new Date(month);
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + w * 7 + d);
      return day;
    }),
  );
}

export function RunCalendar({
  runDates,
  today,
  selected,
  onSelect,
  nextScan,
  nextPost,
  timeZone,
}: {
  runDates: string[];
  today: string;
  selected: string | null;
  onSelect: (day: string | null) => void;
  /** Null while no scan is scheduled. */
  nextScan: string | null;
  /** The next post waiting to go out, if any. */
  nextPost: string | null;
  /** The team's zone: a scan and a post are wall times in it. */
  timeZone: string;
}) {
  const [month, setMonth] = useState(() => monthStart(today));
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const iso of runDates) m.set(dayKey(iso), (m.get(dayKey(iso)) ?? 0) + 1);
    return m;
  }, [runDates]);
  const todayKey = dayKey(today);

  const shift = (by: number) => setMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + by, 1)));

  return (
    <div className={styles.calendar}>
      <div className={styles.calHead}>
        <h2 className="display h2">{formatMonth(month)}</h2>
        <div className={styles.calNav}>
          <button type="button" className="icon-btn icon-btn-plain" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft size={20} />
          </button>
          <button type="button" className="icon-btn icon-btn-plain" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <table className={styles.calGrid}>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeksOf(month).map((week, w) => (
            <tr key={w}>
              {week.map((day) => {
                const key = day.toISOString().slice(0, 10);
                const runs = perDay.get(key) ?? 0;
                const outside = day.getUTCMonth() !== month.getUTCMonth();
                const className = cx(styles.day, outside && styles.dayOutside, key === todayKey && styles.dayToday, key === selected && styles.daySelected);
                return (
                  <td key={key}>
                    {runs > 0 ? (
                      <button
                        type="button"
                        className={cx(className, styles.dayHasRuns)}
                        aria-pressed={key === selected}
                        aria-label={`${DAY_LABEL.format(day)}: ${runs} run${runs === 1 ? '' : 's'}`}
                        onClick={() => onSelect(key === selected ? null : key)}
                      >
                        {day.getUTCDate()}
                      </button>
                    ) : (
                      <span className={className} aria-current={key === todayKey ? 'date' : undefined}>
                        {day.getUTCDate()}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {nextScan && (
        <p className={styles.nextScan}>
          <Radar size={16} aria-hidden />
          <span>
            Next scan <strong>{formatInZone(nextScan, timeZone)}</strong>
          </span>
        </p>
      )}
      {nextPost && (
        <Link href="/posts" className={styles.nextScan}>
          <Send size={16} aria-hidden />
          <span>
            Next post <strong>{formatInZone(nextPost, timeZone)}</strong>
          </span>
        </Link>
      )}
    </div>
  );
}
