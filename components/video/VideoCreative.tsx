'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { Clip } from '@/lib/types';
import { ASPECT_INFO, editedSeconds, frameSize, length } from '@/lib/video/edit';
import type { VideoEdit } from '@/lib/video/edit';
import { coverMoment, useEditedVideo } from './useEditedVideo';
import styles from './video.module.css';

/** What a variant's video is made of: the run's clip, where to play it from, and the variant's edit. */
export interface CreativeVideo {
  clip: Clip;
  /** Null when the clip can't be played here (sample data keeps no uploads). */
  url: string | null;
  edit: VideoEdit;
  brand: { name: string; website: string };
}

/**
 * A variant's video in its ad preview: the cover until it is played, then
 * the edited video with its words, captions and end card, drawn as the export
 * draws it. A tall video sits in a 4:5 box, the tallest a feed shows.
 */
export function VideoCreative({ video, words, label }: { video: CreativeVideo; words: string; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const element = useRef<HTMLVideoElement>(null);
  const { clip, url, edit, brand } = video;
  // Up to 720p: sharp in a preview, light enough for three side by side.
  const size = useMemo(() => frameSize(edit, clip, 720), [edit, clip]);
  const { player, src } = useEditedVideo(canvas, element, url, edit, size, { words, brand });
  const { showAt } = player;
  const cover = coverMoment(edit);

  // The cover again whenever the edit moves it. Its two numbers are the dependency: the edit is often a new object.
  const { clipTime, tailTime: coverTail } = cover;
  useEffect(() => showAt({ clipTime, tailTime: coverTail }), [showAt, clipTime, coverTail]);

  const box = Math.max(size.width / size.height, 4 / 5);
  const name = `${label} video, ${ASPECT_INFO[edit.aspect].label}, ${length(editedSeconds(edit))}`;

  return (
    <div className={styles.creative} style={{ aspectRatio: String(box) }}>
      <video ref={element} className={styles.hiddenVideo} src={src ?? undefined} preload="auto" playsInline aria-hidden tabIndex={-1} />
      <canvas ref={canvas} width={size.width} height={size.height} role="img" aria-label={name} />
      {/* Small and above the variant's own click area, so the rest of the post still selects the variant. */}
      {url ? (
        player.playing ? (
          <button type="button" className={styles.creativePause} onClick={() => player.pause()} aria-label={`Pause ${label}`}>
            <Pause size={16} aria-hidden />
          </button>
        ) : (
          <button type="button" className={styles.creativePlay} onClick={() => void player.play()} aria-label={`Play ${name}`}>
            <Play size={24} aria-hidden />
          </button>
        )
      ) : (
        <span className={styles.creativeNote}>Sample data keeps no uploads, so this clip can’t play here.</span>
      )}
      <span className={styles.creativeBadge}>{length(editedSeconds(edit))}</span>
    </div>
  );
}
