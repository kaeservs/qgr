import { CircleCheck, CircleHelp, CircleX, Globe, Hourglass, TriangleAlert } from 'lucide-react';
import { cx } from '@/lib/cx';
import { judged, LEAD_PLATFORM_LABEL, VERDICT_LABEL } from '@/lib/leads';
import type { Counts } from '@/lib/leads';
import type { LeadPlatform, LeadVerdict } from '@/lib/types';
import { PlaceIcon, PlatformIcon } from '../ui/PlatformIcon';
import ui from '../ui/ui.module.css';
import styles from './leads.module.css';

const PILL = {
  qualified: { icon: CircleCheck, tone: 'status-approved' },
  not_qualified: { icon: CircleX, tone: 'status-failed' },
  unclear: { icon: CircleHelp, tone: 'status-review' },
  waiting: { icon: Hourglass, tone: 'status-queued' },
  failed: { icon: TriangleAlert, tone: 'status-failed' },
} as const;

/** A lead's verdict as a status pill: an icon and its words, never colour alone. */
export function VerdictPill({ verdict, label }: { verdict: LeadVerdict | 'waiting' | 'failed'; label?: string }) {
  const { icon: Icon, tone } = PILL[verdict];
  return (
    <span className={cx(ui.status, ui[tone], ui.statusSmall)}>
      <Icon size={13} strokeWidth={2.2} aria-hidden />
      {label ?? (verdict === 'failed' ? 'Could not be judged' : VERDICT_LABEL[verdict])}
    </span>
  );
}

/** Where a lead came from, as its mark. */
export function LeadPlatformIcon({ platform, size = 14 }: { platform: LeadPlatform; size?: number }) {
  const label = LEAD_PLATFORM_LABEL[platform];
  if (platform === 'facebook' || platform === 'instagram' || platform === 'linkedin') return <PlaceIcon place={platform} size={size} />;
  if (platform === 'meta' || platform === 'x') return <PlatformIcon platform={platform} size={size} />;
  const Icon = platform === 'website' ? Globe : CircleHelp;
  return <Icon size={size} aria-label={label} role="img" />;
}

const SEGMENTS = [
  ['qualified', styles.qualified],
  ['notQualified', styles.notQualified],
  ['unclear', styles.unclear],
  ['waiting', styles.waiting],
] as const;

/**
 * One bar of a campaign's or an ad's leads by verdict, in the order of the
 * legend, its counts said in words beside it. `scale` sets its length against
 * the largest beside it, so an ad's bar shows how many leads it brought too.
 */
export function ShareBar({ counts, scale = 1 }: { counts: Counts; scale?: number }) {
  if (counts.leads === 0) return null;
  const words = `${counts.qualified} qualified, ${counts.notQualified} not qualified, ${counts.unclear} can’t tell, ${counts.waiting} not judged yet`;
  return (
    <span className={styles.bar} role="img" aria-label={words} title={words} style={scale < 1 ? { width: `${Math.max(4, Math.round(scale * 100))}%` } : undefined}>
      {SEGMENTS.filter(([key]) => counts[key] > 0).map(([key, tone]) => (
        <span key={key} className={tone} style={{ flexGrow: counts[key], flexBasis: 0 }} />
      ))}
    </span>
  );
}

export function ShareLegend() {
  return (
    <ul className={styles.legend} aria-label="Colours of the bars">
      <li>
        <span className={cx(styles.swatch, styles.qualified)} aria-hidden />
        {VERDICT_LABEL.qualified}
      </li>
      <li>
        <span className={cx(styles.swatch, styles.notQualified)} aria-hidden />
        {VERDICT_LABEL.not_qualified}
      </li>
      <li>
        <span className={cx(styles.swatch, styles.unclear)} aria-hidden />
        {VERDICT_LABEL.unclear}
      </li>
      <li>
        <span className={cx(styles.swatch, styles.waiting)} aria-hidden />
        {VERDICT_LABEL.waiting}
      </li>
    </ul>
  );
}

/** "11 of 15 qualified · 73%", of the leads judged. */
export function qualifiedLine(counts: Counts): string {
  const n = judged(counts);
  if (n === 0) return counts.leads > 0 ? 'None judged yet' : 'No leads';
  return `${counts.qualified} of ${n} qualified · ${Math.round((counts.qualified / n) * 100)}%`;
}
