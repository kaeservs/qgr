import { ExternalLink, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
import { audience, engagementRate, engagements, formatCount, formatRate } from '@/lib/results';
import { formatInZone } from '@/lib/schedule';
import type { PostStatus, PostTarget } from '@/lib/types';
import { PlaceIcon } from '../ui/PlatformIcon';
import ui from '../ui/ui.module.css';
import styles from './posts.module.css';

export const POST_STATUS: Record<PostStatus, { label: string; tone: string }> = {
  scheduled: { label: 'Scheduled', tone: 'status-waiting' },
  posting: { label: 'Sending', tone: 'status-running' },
  posted: { label: 'Posted', tone: 'status-approved' },
  failed: { label: 'Failed', tone: 'status-failed' },
  unknown: { label: 'Check the Page', tone: 'status-failed' },
  cancelled: { label: 'Cancelled', tone: 'status-queued' },
};

/** A place's numbers in a line: reached, engagements and their rate, and when they were read. */
function ResultsLine({ target, timeZone }: { target: PostTarget; timeZone: string }) {
  const r = target.results;
  if (!r) return null;
  const reached = audience(r);
  const rate = engagementRate(r);
  return (
    <p className={styles.results}>
      {reached !== null && <span>{formatCount(reached)} {r.reach !== null ? 'reached' : 'views'}</span>}
      <span>{formatCount(engagements(r))} engagements</span>
      {rate !== null && <strong>{formatRate(rate)}</strong>}
      <span className={styles.resultsAt}>as of {formatInZone(r.at, timeZone)}</span>
    </p>
  );
}

/** One place a post goes: how it went, its link, its numbers, and Try again when it did not go. */
export function PostTargetRow({
  target,
  onRetry,
  busy,
  retrying = false,
  timeZone,
}: {
  target: PostTarget;
  onRetry: () => void;
  /** Something is being sent for this post: its buttons wait. */
  busy: boolean;
  /** This place is the one being tried again. */
  retrying?: boolean;
  timeZone: string;
}) {
  const { label, tone } = POST_STATUS[target.status];
  return (
    <li className={styles.target}>
      <span className={styles.targetPlace}>
        <PlaceIcon place={target.place} size={16} decorative />
        {PLACE_LABEL[target.place]}
      </span>
      <span className={cx(ui.status, ui.statusSmall, ui[tone])}>
        {target.status === 'posting' && <LoaderCircle size={13} strokeWidth={2.2} className="spin" aria-hidden />}
        {label}
      </span>
      {target.status === 'posted' && target.standIn && <span className={styles.targetNote}>Through the stand-in: nothing was posted</span>}
      {target.url && (
        <a href={target.url} className="link small" target="_blank" rel="noreferrer noopener">
          View post
          <ExternalLink size={13} aria-hidden />
        </a>
      )}
      {(target.status === 'failed' || target.status === 'unknown') && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry} disabled={busy} aria-busy={retrying}>
          <RotateCcw size={14} aria-hidden />
          {target.status === 'unknown' ? 'It isn’t there: send again' : 'Try again'}
        </button>
      )}
      {target.error && <p className={styles.targetError}>{target.error}</p>}
      <ResultsLine target={target} timeZone={timeZone} />
      {target.resultsError && (
        <p className={styles.resultsError}>
          <TriangleAlert size={13} aria-hidden />
          The last read of its results failed: {target.resultsError} {target.results ? 'These are the numbers from before.' : ''}
        </p>
      )}
    </li>
  );
}
