import Link from 'next/link';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
import { postState } from '@/lib/posts';
import { formatInZone } from '@/lib/schedule';
import type { Post } from '@/lib/types';
import { PlaceIcon } from '../ui/PlatformIcon';
import ui from '../ui/ui.module.css';
import styles from './posts.module.css';

const STATE = {
  look: { label: 'Needs a look', tone: 'status-failed' },
  waiting: { label: 'Scheduled', tone: 'status-waiting' },
  sent: { label: 'Sent', tone: 'status-approved' },
  cancelled: { label: 'Cancelled', tone: 'status-queued' },
} as const;

/** Posts in a few words each, for Home: when, which ad, where, and how it went. Each opens on Posts. */
export function PostRows({ posts, timeZone }: { posts: Post[]; timeZone: string }) {
  return (
    <ul className={styles.rows}>
      {posts.map((post) => {
        const { label, tone } = STATE[postState(post)];
        const places = post.targets.filter((t) => t.status !== 'cancelled');
        return (
          <li key={post.id}>
            <Link href={`/posts#post-${post.id}`} className={styles.row}>
              {post.thumbnail ? (
                // A plain img: a small data URL the post keeps.
                <img className={styles.rowThumb} src={post.thumbnail} alt="" />
              ) : (
                <span className={cx(styles.rowThumb, styles.thumbArt)} aria-hidden>
                  {post.variantLabel}
                </span>
              )}
              <span className={styles.rowMain}>
                <strong>
                  {post.adSetTitle}, variant {post.variantLabel}
                </strong>
                <span className={styles.rowWhen}>
                  {formatInZone(post.scheduledFor, timeZone)}
                  <span className={styles.chipPlaces} aria-label={places.map((t) => PLACE_LABEL[t.place]).join(', ')} role="img">
                    {places.map((t) => (
                      <PlaceIcon key={t.place} place={t.place} size={14} decorative />
                    ))}
                  </span>
                </span>
              </span>
              <span className={cx(ui.status, ui.statusSmall, ui[tone])}>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
