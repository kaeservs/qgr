import styles from './ui.module.css';

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Shown at the bar's tip. */
  valueLabel: string;
  /** What the value is made of, shown on hover. */
  tip: string;
}

/**
 * Horizontal bars for one series, in the order given: one hue and no legend,
 * the value at each tip, what it is made of on hover. It draws only; the
 * caller puts the same values in a table for screen readers.
 */
export function BarList({ bars }: { bars: Bar[] }) {
  const max = Math.max(...bars.map((b) => b.value), Number.MIN_VALUE);
  return (
    <div className={styles.bars} aria-hidden>
      {bars.map((b) => (
        <div key={b.key} className={styles.barRow}>
          <span className={styles.barLabel}>{b.label}</span>
          <span className={styles.barTrack}>
            <span className={styles.bar} style={{ width: `${(b.value / max) * 100}%` }} />
            <span className={styles.barValue}>{b.valueLabel}</span>
          </span>
          <span className={styles.barTip}>{b.tip}</span>
        </div>
      ))}
    </div>
  );
}
