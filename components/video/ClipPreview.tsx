'use client';

import { useEffect, useState } from 'react';
import { playableUrl } from './media';
import styles from './video.module.css';

/** A run's clip, to watch. The sample's file is picked once the browser says what it plays. */
export function ClipPreview({ url, name }: { url: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => setSrc(playableUrl(url)), [url]);
  return <video className={styles.runClip} src={src ?? undefined} controls preload="metadata" playsInline aria-label={`The clip: ${name}`} />;
}
