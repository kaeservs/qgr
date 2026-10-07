import { percent } from '@/lib/format';
import type { AngleShare } from '@/lib/types';
import styles from './competitors.module.css';

/**
 * Share of a competitor's active ads by angle: one series, so one hue and no
 * legend. Each value sits at its bar's tip; hovering or focusing a row shows
 * the ad count behind the percentage, and the table below carries every value
 * for screen readers.
 */
export function AngleBars({ angles, total }: { angles: AngleShare[]; total: number }) {
  const sorted = [...angles].sort((a, b) => b.ads - a.ads);
  const max = Math.max(...sorted.map((a) => a.ads), 1);
  return (
    <figure className={styles.bars}>
      <div aria-hidden>
        {sorted.map((a) => (
          <div key={a.label} className={styles.barRow}>
            <span className={styles.barLabel}>{a.label}</span>
            <span className={styles.barTrack}>
              <span className={styles.bar} style={{ width: `${(a.ads / max) * 100}%` }} />
              <span className={styles.barValue}>{percent(a.ads, total)}%</span>
            </span>
            <span className={styles.tip}>
              {a.ads} of {total} ads
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Share of active ads by angle</caption>
        <thead>
          <tr>
            <th scope="col">Angle</th>
            <th scope="col">Ads</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => (
            <tr key={a.label}>
              <th scope="row">{a.label}</th>
              <td>{a.ads}</td>
              <td>{percent(a.ads, total)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
