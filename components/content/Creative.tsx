import Image from 'next/image';
import { cx } from '@/lib/cx';
import type { CreativeStyle } from '@/lib/types';
import { AutoTextarea } from './AutoTextarea';
import styles from './previews.module.css';

/**
 * The ad's image: the picture an image model made for it, darkened under the
 * words, or without one the design drawn in Quantum Global's brand (the
 * site's indigo, its hero arcs and its gold headline type). The words on it
 * are editable like the rest of the ad.
 */
export function Creative({
  text,
  style,
  image,
  ratio,
  editable = false,
  onChange,
}: {
  text: string;
  style: CreativeStyle;
  /** A generated image to draw instead of the brand's pattern. */
  image?: string | undefined;
  ratio: 'square' | 'wide';
  editable?: boolean;
  onChange?: (text: string) => void;
}) {
  return (
    <div className={cx(styles.creative, styles[`creative-${style}`], styles[`ratio-${ratio}`], image && styles.withImage)}>
      {image ? (
        // A plain img: the address is our own storage's, and the frame sets the size.
        <img className={styles.creativeImage} src={image} alt="" />
      ) : (
        <span className={styles.creativeArt} aria-hidden />
      )}
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
