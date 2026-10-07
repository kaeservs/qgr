import Image from 'next/image';
import { cx } from '@/lib/cx';
import type { CreativeStyle } from '@/lib/types';
import { AutoTextarea } from './AutoTextarea';
import styles from './previews.module.css';

/**
 * The ad's image, drawn in Quantum Global's brand: the site's indigo, its
 * hero arcs and its gold headline type. A stand-in until the Content Agent
 * produces real images; the words on it are editable like the rest of the ad.
 */
export function Creative({
  text,
  style,
  ratio,
  editable = false,
  onChange,
}: {
  text: string;
  style: CreativeStyle;
  ratio: 'square' | 'wide';
  editable?: boolean;
  onChange?: (text: string) => void;
}) {
  return (
    <div className={cx(styles.creative, styles[`creative-${style}`], styles[`ratio-${ratio}`])}>
      <span className={styles.creativeArt} aria-hidden />
      <div className={styles.creativeInner}>
        <span className={styles.creativeBrand}>
          <Image src="/brand/qgr-mark.png" alt="" width={18} height={18} />
          Quantum Global
        </span>
        {editable && onChange ? (
          <AutoTextarea className={cx(styles.creativeText, styles.creativeField)} value={text} onChange={onChange} aria-label="Text on the image" singleLine />
        ) : (
          <p className={styles.creativeText}>{text}</p>
        )}
      </div>
    </div>
  );
}
