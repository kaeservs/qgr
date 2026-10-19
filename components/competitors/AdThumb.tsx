import { Clock3, ExternalLink, Play } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { AdExample } from '@/lib/types';
import { PlatformIcon } from '../ui/PlatformIcon';
import styles from './competitors.module.css';

const FORMAT = { video: 'Video', image: 'Image', carousel: 'Carousel', document: 'Document', text: 'Text' } as const;

/**
 * A competitor's ad, drawn in a neutral tone so it is never mistaken for one
 * of ours, or shown as the screenshot it was read from, with the words read
 * from it under it. Linked to Meta's Ad Library when Apify read it there.
 * With `onChoose`, a person can tick it to build a run on.
 */
export function AdThumb({ ad, chosen, onChoose }: { ad: AdExample; chosen?: boolean; onChoose?: (chosen: boolean) => void }) {
  const words = ad.text.length > 140 ? `${ad.text.slice(0, 140).trimEnd()}…` : ad.text;
  return (
    <figure className={cx(styles.thumb, chosen && styles.thumbChosen)}>
      <div className={cx(styles.thumbArt, ad.screenshot ? styles.thumbShot : styles[`tone-${ad.tone}`])}>
        {ad.screenshot && <img src={ad.screenshot} alt={`Screenshot of the ad: ${words}`} />}
        <span className={styles.thumbPlatform}>
          <PlatformIcon platform={ad.platform} size={14} />
        </span>
        {ad.format === 'video' && !ad.screenshot && (
          <span className={styles.thumbPlay} aria-hidden>
            <Play size={16} fill="currentColor" />
          </span>
        )}
        {!ad.screenshot && <p className={styles.thumbText}>{ad.text}</p>}
        {onChoose && (
          <label className={styles.thumbPick}>
            <input type="checkbox" checked={chosen ?? false} onChange={(e) => onChoose(e.target.checked)} />
            <span className="sr-only">Build on this ad: {words}</span>
          </label>
        )}
      </div>
      {(ad.headline || ad.screenshot) && (
        <div className={styles.thumbRead}>
          {ad.headline && <p className={styles.thumbHeadline}>{ad.headline}</p>}
          {ad.screenshot && <p className={styles.thumbWords}>{ad.text}</p>}
        </div>
      )}
      <figcaption className={styles.thumbCaption}>
        <span>{FORMAT[ad.format]}</span>
        {ad.angle && <span>{ad.angle}</span>}
        {ad.daysRunning !== null && (
          <span>
            <Clock3 size={13} aria-hidden />
            {ad.daysRunning} days
          </span>
        )}
        {ad.url && (
          <a className="link" href={ad.url} target="_blank" rel="noopener noreferrer">
            See the ad
            <ExternalLink size={12} aria-hidden />
            <span className="sr-only"> in Meta’s Ad Library (opens in a new tab)</span>
          </a>
        )}
      </figcaption>
    </figure>
  );
}
