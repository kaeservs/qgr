import { ExternalLink, RotateCcw } from 'lucide-react';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
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

/** One place a post goes: how it went, its link, and Try again when it did not. */
export function PostTargetRow({ target, onRetry, busy }: { target: PostTarget; onRetry: () => void; busy: boolean }) {
  const { label, tone } = POST_STATUS[target.status];
  return (
    <li className={styles.target}>
      <span className={styles.targetPlace}>
        <PlaceIcon place={target.place} size={16} decorative />
        {PLACE_LABEL[target.place]}
      </span>
      <span className={cx(ui.status, ui.statusSmall, ui[tone])}>{label}</span>
      {target.status === 'posted' && target.standIn && <span className={styles.targetNote}>Through the stand-in: nothing was posted</span>}
      {target.url && (
        <a href={target.url} className="link small" target="_blank" rel="noreferrer noopener">
          View post
          <ExternalLink size={13} aria-hidden />
        </a>
      )}
      {(target.status === 'failed' || target.status === 'unknown') && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry} disabled={busy}>
          <RotateCcw size={14} aria-hidden />
          {target.status === 'unknown' ? 'It isn’t there: send again' : 'Try again'}
        </button>
      )}
      {target.error && <p className={styles.targetError}>{target.error}</p>}
    </li>
  );
}
