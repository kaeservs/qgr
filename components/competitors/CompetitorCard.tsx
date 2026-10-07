import Link from 'next/link';
import { timeAgo } from '@/lib/format';
import type { Competitor } from '@/lib/types';
import { Avatar } from '../ui/Avatar';
import { PlatformIcons } from '../ui/PlatformIcon';
import styles from './competitors.module.css';

export function CompetitorCard({ competitor: c, now }: { competitor: Competitor; now: string }) {
  const top = [...c.hooks].sort((a, b) => b.daysRunning - a.daysRunning)[0];
  return (
    <article className={styles.compCard}>
      <div className={styles.compHead}>
        <Avatar name={c.name} size={44} />
        <div className={styles.compName}>
          <h2>
            <Link href={`/competitors/${c.id}`} className={styles.stretch}>
              {c.name}
            </Link>
          </h2>
          <span className="muted small">{c.domain}</span>
        </div>
        <PlatformIcons platforms={c.platforms} />
      </div>
      {top && (
        <blockquote className={styles.topHook}>
          <span className="eyebrow">Top hook</span>
          <p>“{top.text}”</p>
        </blockquote>
      )}
      <dl className={styles.compStats}>
        <div>
          <dt>Active ads</dt>
          <dd>{c.activeAds}</dd>
        </div>
        <div>
          <dt>Winning hooks</dt>
          <dd>{c.hooks.length}</dd>
        </div>
        <div>
          <dt>Last scan</dt>
          <dd>{timeAgo(c.lastScanAt, now)}</dd>
        </div>
      </dl>
    </article>
  );
}
