import { percent } from '@/lib/format';
import type { AngleShare } from '@/lib/types';
import { BarList } from '../ui/BarList';
import styles from './competitors.module.css';

/**
 * Share of a competitor's active ads by angle: one series, so one hue and no
 * legend. Each value sits at its bar's tip; hovering a row shows
 * the ad count behind the percentage, and the table below carries every value
 * for screen readers.
 */
export function AngleBars({ angles, total }: { angles: AngleShare[]; total: number }) {
  const sorted = [...angles].sort((a, b) => b.ads - a.ads);
  return (
    <figure className={styles.bars}>
      <BarList bars={sorted.map((a) => ({ key: a.label, label: a.label, value: a.ads, valueLabel: `${percent(a.ads, total)}%`, tip: `${a.ads} of ${total} ads` }))} />
      <div className="sr-only">
        <table>
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
      </div>
    </figure>
  );
}
