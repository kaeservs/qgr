import { Clock3, Play } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { AdExample } from '@/lib/types';
import { PlatformIcon } from '../ui/PlatformIcon';
import styles from './competitors.module.css';

const FORMAT = { video: 'Video', image: 'Image', carousel: 'Carousel', document: 'Document', text: 'Text' } as const;

/** A competitor's ad, drawn in a neutral tone so it is never mistaken for one of ours. */
export function AdThumb({ ad }: { ad: AdExample }) {
  return (
    <figure className={styles.thumb}>
      <div className={cx(styles.thumbArt, styles[`tone-${ad.tone}`])}>
        <span className={styles.thumbPlatform}>
          <PlatformIcon platform={ad.platform} size={14} />
        </span>
        {ad.format === 'video' && (
          <span className={styles.thumbPlay} aria-hidden>
            <Play size={16} fill="currentColor" />
          </span>
        )}
        <p className={styles.thumbText}>{ad.text}</p>
      </div>
      <figcaption className={styles.thumbCaption}>
        <span>{FORMAT[ad.format]}</span>
        <span>
          <Clock3 size={13} aria-hidden />
          {ad.daysRunning} days
        </span>
      </figcaption>
    </figure>
  );
}
