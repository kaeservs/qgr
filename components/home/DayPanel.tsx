import { ArrowRight, X } from 'lucide-react';
import Link from 'next/link';
import { cx } from '@/lib/cx';
import type { RunWithStatus } from '@/lib/data';
import { PLACE_LABEL } from '@/lib/post-input';
import { postState } from '@/lib/posts';
import { dayLabel, formatInZone, wallTime } from '@/lib/schedule';
import type { Post } from '@/lib/types';
import { PlaceIcon } from '../ui/PlatformIcon';
import { StatusPill } from '../ui/StatusPill';
import styles from './home.module.css';

const POST_STATE = { look: 'Needs a look', waiting: 'Scheduled', sent: 'Sent', cancelled: 'Cancelled' } as const;

/** One post in a line: what, when, where. A post still to go opens in the Scheduled list, the rest in the list of every post. */
function PostItem({ post, timeZone, withDay }: { post: Post; timeZone: string; withDay: boolean }) {
  const state = postState(post);
  const places = post.targets.filter((t) => t.status !== 'cancelled');
  return (
    <li>
      <Link href={state === 'waiting' ? `/posts?view=scheduled#post-${post.id}` : `/posts#post-${post.id}`} className={styles.dayItem}>
        <span className={styles.dayItemMain}>
          <strong>
            {post.adSetTitle}, variant {post.variantLabel}
          </strong>
          <span className={styles.dayItemSub}>
            {withDay ? formatInZone(post.scheduledFor, timeZone) : wallTime(post.scheduledFor, timeZone).time}
            <span className={styles.dayPlaces} role="img" aria-label={places.map((t) => PLACE_LABEL[t.place]).join(', ')}>
              {places.map((t) => (
                <PlaceIcon key={t.place} place={t.place} size={13} decorative />
              ))}
            </span>
            {state !== 'waiting' && <span>{POST_STATE[state]}</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Under the calendar: the chosen day's posts and runs, or, with no day chosen,
 * the posts still to go out, soonest first.
 */
export function DayPanel({
  day,
  runs,
  posts,
  comingUp,
  scheduled,
  timeZone,
  onClose,
}: {
  /** `YYYY-MM-DD`, or null for what is coming up. */
  day: string | null;
  /** The day's runs. */
  runs: RunWithStatus[];
  /** The day's posts, in the team's zone. */
  posts: Post[];
  /** The next posts to go out. */
  comingUp: Post[];
  /** How many posts wait to go out in all. */
  scheduled: number;
  timeZone: string;
  onClose: () => void;
}) {
  if (!day) {
    return (
      <section className={styles.dayPanel} aria-labelledby="coming-up">
        <div className={styles.dayPanelHead}>
          <h3 id="coming-up" className={styles.dayPanelTitle}>
            Coming up
          </h3>
          {scheduled > 0 && (
            <Link href="/posts?view=scheduled" className={cx('link small', styles.dayPanelLink)}>
              All scheduled ({scheduled})
              <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </div>
        {comingUp.length === 0 ? (
          <p className="muted small">No posts scheduled. Approve an ad in Content, then post it or schedule it.</p>
        ) : (
          <ul className={styles.dayList}>
            {comingUp.map((post) => (
              <PostItem key={post.id} post={post} timeZone={timeZone} withDay />
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className={styles.dayPanel} aria-labelledby="day-panel" aria-live="polite">
      <div className={styles.dayPanelHead}>
        <h3 id="day-panel" className={styles.dayPanelTitle}>
          {dayLabel(day)}
        </h3>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Back to what is coming up" onClick={onClose}>
          <X size={17} aria-hidden />
        </button>
      </div>
      {posts.length > 0 && (
        <>
          <h4 className={styles.dayGroup}>
            {posts.length} post{posts.length === 1 ? '' : 's'}
          </h4>
          <ul className={styles.dayList}>
            {posts.map((post) => (
              <PostItem key={post.id} post={post} timeZone={timeZone} withDay={false} />
            ))}
          </ul>
        </>
      )}
      {runs.length > 0 && (
        <>
          <h4 className={styles.dayGroup}>
            {runs.length} run{runs.length === 1 ? '' : 's'} started
          </h4>
          <ul className={styles.dayList}>
            {runs.map((run) => (
              <li key={run.id}>
                <Link href={`/runs/${run.id}`} className={cx(styles.dayItem, styles.dayItemRun)}>
                  <span className={styles.dayItemMain}>
                    <strong>{run.title}</strong>
                    <span className={styles.dayItemSub}>
                      <StatusPill status={run.status} small />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {posts.length + runs.length === 0 && <p className="muted small">Nothing on this day.</p>}
    </section>
  );
}
