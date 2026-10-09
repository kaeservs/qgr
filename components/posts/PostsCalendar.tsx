'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cx } from '@/lib/cx';
import { formatMonth } from '@/lib/format';
import { PLACE_LABEL } from '@/lib/post-input';
import { monthGrid, postsByDay, postState, shiftMonth } from '@/lib/posts';
import { dayLabel, formatInZone, wallTime } from '@/lib/schedule';
import type { Post } from '@/lib/types';
import { PlaceIcon } from '../ui/PlatformIcon';
import { PostDialog } from './PostDialog';
import { usePostActions } from './usePostActions';
import styles from './posts.module.css';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATE_LABEL = { look: 'needs a look', waiting: 'scheduled', sent: 'sent', cancelled: 'cancelled' } as const;

const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * The month's posts on the days they go out, in the team's zone. A post opens
 * to move it, send it now or cancel it. On a phone it reads as a list of the
 * days that have posts.
 */
export function PostsCalendar({ posts, timeZone, today }: { posts: Post[]; timeZone: string; /** `YYYY-MM-DD` in the team's zone. */ today: string }) {
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [openId, setOpenId] = useState<string | null>(null);
  const actions = usePostActions(timeZone);
  const byDay = useMemo(() => postsByDay(posts, timeZone), [posts, timeZone]);
  const weeks = monthGrid(month);
  const inMonth = [...byDay.keys()].filter((day) => day.startsWith(month)).length;
  const open = posts.find((p) => p.id === openId) ?? null;

  return (
    <section className={cx('card', styles.calendar)} aria-labelledby="calendar-month">
      <header className={styles.calHead}>
        <h2 id="calendar-month" className="display h2">
          {formatMonth(dateOf(`${month}-01`))}
        </h2>
        <div className={styles.calNav}>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMonth(today.slice(0, 7))} disabled={month === today.slice(0, 7)}>
            Today
          </button>
          <button type="button" className="icon-btn icon-btn-plain" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
            <ChevronLeft size={20} />
          </button>
          <button type="button" className="icon-btn icon-btn-plain" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      {inMonth === 0 && <p className={cx('muted small', styles.calEmpty)}>Nothing goes out in {formatMonth(dateOf(`${month}-01`))}.</p>}

      <div className={styles.calWeekdays} aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <ol className={styles.calMonth} aria-labelledby="calendar-month">
        {weeks.flat().map((day) => {
          const list = byDay.get(day) ?? [];
          const outside = !day.startsWith(month);
          return (
            <li
              key={day}
              className={cx(styles.calDay, outside && styles.calDayOutside, day === today && styles.calDayToday, list.length === 0 && styles.calDayEmpty)}
              aria-current={day === today ? 'date' : undefined}
            >
              <span className={styles.calDate}>
                <span className="sr-only">{dayLabel(day)}</span>
                <span className={styles.calDateLong} aria-hidden>
                  {dayLabel(day)}
                </span>
                <span className={styles.calDateShort} aria-hidden>
                  {dateOf(day).getUTCDate()}
                </span>
              </span>
              {list.map((post) => {
                const state = postState(post);
                const places = post.targets.filter((t) => t.status !== 'cancelled');
                return (
                  <button
                    key={post.id}
                    type="button"
                    className={cx(styles.chip, styles[`chip-${state}`])}
                    onClick={() => setOpenId(post.id)}
                    aria-label={`${formatInZone(post.scheduledFor, timeZone)}: ${post.adSetTitle}, variant ${post.variantLabel}, to ${places.map((t) => PLACE_LABEL[t.place]).join(', ')}, ${STATE_LABEL[state]}`}
                  >
                    <span className={styles.chipTop}>
                      <strong>{wallTime(post.scheduledFor, timeZone).time}</strong>
                      <span className={styles.chipPlaces}>
                        {places.map((t) => (
                          <PlaceIcon key={t.place} place={t.place} size={13} decorative />
                        ))}
                      </span>
                    </span>
                    <span className={styles.chipTitle}>
                      {post.adSetTitle} · {post.variantLabel}
                    </span>
                  </button>
                );
              })}
            </li>
          );
        })}
      </ol>

      <p className={styles.calKey}>
        <span className={cx(styles.keyDot, styles['chip-waiting'])} aria-hidden /> Scheduled
        <span className={cx(styles.keyDot, styles['chip-sent'])} aria-hidden /> Sent
        <span className={cx(styles.keyDot, styles['chip-look'])} aria-hidden /> Needs a look
      </p>

      {open && <PostDialog key={open.id} post={open} timeZone={timeZone} actions={actions} onClose={() => setOpenId(null)} />}
    </section>
  );
}
