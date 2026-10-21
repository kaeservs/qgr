import { adSignal, SIGNAL_LABEL } from '@/lib/competitor-signal';
import type { AdFacts, SignalLevel } from '@/lib/competitor-signal';
import { cx } from '@/lib/cx';
import styles from './competitors.module.css';

const TONE: Record<SignalLevel, string> = {
  strong: styles.signalStrong ?? '',
  promising: styles.signalPromising ?? '',
  little: styles.signalQuiet ?? '',
  new: styles.signalQuiet ?? '',
  ended: styles.signalEnded ?? '',
  unknown: styles.signalQuiet ?? '',
};

/**
 * How well a competitor's ad looks to be doing, worked out of its public
 * signs (lib/competitor-signal.ts), with the facts it rests on beside it.
 */
export function AdSignalBadge({ ad, withReasons = true }: { ad: AdFacts; withReasons?: boolean }) {
  const signal = adSignal(ad);
  return (
    <span className={styles.signal}>
      <span className={cx('pill pill-sm', TONE[signal.level])}>{SIGNAL_LABEL[signal.level]}</span>
      {withReasons && signal.reasons.length > 0 && <span className={styles.signalReasons}>{signal.reasons.join(' · ')}</span>}
    </span>
  );
}
