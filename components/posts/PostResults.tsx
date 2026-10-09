import { BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
import { audience, engagementRate, engagements, formatCount, formatRate, measured, resultsByAngle } from '@/lib/results';
import { dayInZone, dayLabel } from '@/lib/schedule';
import type { Post } from '@/lib/types';
import { BarList } from '../ui/BarList';
import { EmptyState } from '../ui/EmptyState';
import { PlaceIcon } from '../ui/PlatformIcon';
import styles from './posts.module.css';

const count = (n: number | null) => (n === null ? '–' : formatCount(n));

/**
 * What worked, from the numbers each platform gave back: the totals, each
 * angle's engagement (one series of bars, value at the tip), and every place
 * measured, in a table. Engagement is reactions, comments, shares and clicks
 * per person reached, worked out in lib/results.ts, never by a model.
 */
export function PostResults({ posts, timeZone }: { posts: Post[]; timeZone: string }) {
  const places = measured(posts);
  if (places.length === 0) {
    return (
      <EmptyState icon={BarChart3} title="No results yet">
        Once posts go out for real, n8n reads their numbers every six hours and they show here. Posts through the stand-ins have none: nothing was posted.
      </EmptyState>
    );
  }
  const angles = resultsByAngle(posts).filter((a) => a.rate !== null);
  const reach = places.reduce((n, p) => n + (audience(p.results) ?? 0), 0);
  const engaged = places.reduce((n, p) => n + engagements(p.results), 0);
  const postCount = new Set(places.map((p) => p.post.id)).size;

  return (
    <div className={styles.resultsView}>
      <section className={styles.kpis} aria-label="Totals">
        <div className={cx('card', styles.kpi)}>
          <span className={styles.kpiLabel}>Places measured</span>
          <span className={styles.kpiValue}>{places.length}</span>
          <span className={styles.kpiNote}>
            from {postCount} post{postCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className={cx('card', styles.kpi)}>
          <span className={styles.kpiLabel}>People reached</span>
          <span className={styles.kpiValue}>{formatCount(reach)}</span>
          <span className={styles.kpiNote}>or views, where a platform gives no reach</span>
        </div>
        <div className={cx('card', styles.kpi)}>
          <span className={styles.kpiLabel}>Engagement</span>
          <span className={styles.kpiValue}>{reach > 0 ? formatRate(engaged / reach) : '–'}</span>
          <span className={styles.kpiNote}>{formatCount(engaged)} reactions, comments, shares and clicks</span>
        </div>
      </section>

      <section className="card card-pad" aria-labelledby="by-angle">
        <h2 id="by-angle" className="card-title">
          Engagement by angle
        </h2>
        <p className="muted small">Per person reached, across every place an angle went out. The strategist reads the same numbers before it plans.</p>
        <figure className={styles.angleBars}>
          <BarList
            bars={angles.map((a) => ({
              key: a.angle,
              label: a.angle,
              value: a.rate ?? 0,
              valueLabel: formatRate(a.rate ?? 0),
              tip: `${formatCount(a.engagements)} from ${formatCount(a.reach)} reached${a.best ? `, best on ${PLACE_LABEL[a.best]}` : ''}`,
            }))}
          />
          <div className="sr-only">
            <table>
              <caption>Engagement by angle</caption>
              <thead>
                <tr>
                  <th scope="col">Angle</th>
                  <th scope="col">Engagement</th>
                  <th scope="col">Reached</th>
                  <th scope="col">Engagements</th>
                  <th scope="col">Best on</th>
                </tr>
              </thead>
              <tbody>
                {angles.map((a) => (
                  <tr key={a.angle}>
                    <th scope="row">{a.angle}</th>
                    <td>{formatRate(a.rate ?? 0)}</td>
                    <td>{formatCount(a.reach)}</td>
                    <td>{formatCount(a.engagements)}</td>
                    <td>{a.best ? PLACE_LABEL[a.best] : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      </section>

      <section className="card" aria-labelledby="by-place">
        <h2 id="by-place" className={cx('card-title', styles.tableTitle)}>
          Every place measured
        </h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Post</th>
                <th scope="col">Where</th>
                <th scope="col">Went out</th>
                <th scope="col" className={styles.num}>
                  Reached
                </th>
                <th scope="col" className={styles.num}>
                  Views
                </th>
                <th scope="col" className={styles.num}>
                  Reactions
                </th>
                <th scope="col" className={styles.num}>
                  Comments
                </th>
                <th scope="col" className={styles.num}>
                  Shares
                </th>
                <th scope="col" className={styles.num}>
                  Clicks
                </th>
                <th scope="col" className={styles.num}>
                  Engagement
                </th>
              </tr>
            </thead>
            <tbody>
              {places.map(({ post, place, results }) => {
                const target = post.targets.find((t) => t.place === place);
                const rate = engagementRate(results);
                return (
                  <tr key={`${post.id}-${place}`}>
                    <th scope="row">
                      <Link href={`/posts#post-${post.id}`} className="link">
                        {post.adSetTitle}, {post.variantLabel}
                      </Link>
                      <span className={styles.tableAngle}>{post.angle}</span>
                    </th>
                    <td>
                      <span className={styles.tablePlace}>
                        <PlaceIcon place={place} size={14} decorative />
                        {PLACE_LABEL[place]}
                      </span>
                    </td>
                    <td>{dayLabel(dayInZone(target?.postedAt ?? post.scheduledFor, timeZone))}</td>
                    <td className={styles.num}>{count(results.reach)}</td>
                    <td className={styles.num}>{count(results.views)}</td>
                    <td className={styles.num}>{count(results.reactions)}</td>
                    <td className={styles.num}>{count(results.comments)}</td>
                    <td className={styles.num}>{count(results.shares)}</td>
                    <td className={styles.num}>{count(results.clicks)}</td>
                    <td className={cx(styles.num, styles.rate)}>{rate === null ? '–' : formatRate(rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={cx('muted small', styles.tableNote)}>A dash: the platform does not give that number for that kind of post (Instagram has no clicks on a feed post).</p>
      </section>
    </div>
  );
}
