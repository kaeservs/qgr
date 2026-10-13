'use client';

import { Film, Image as ImageIcon, Type } from 'lucide-react';
import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { cx } from '@/lib/cx';
import { clock } from '@/lib/video/edit';
import { TRANSITION_LABEL, pieceName, pieceSeconds } from '@/lib/video/timeline';
import type { Overlay, Placed } from '@/lib/video/timeline';
import { useTime } from './useEditedVideo';
import type { TimeClock } from './useEditedVideo';
import styles from './video.module.css';

const percent = (t: number, total: number) => `${(Math.min(Math.max(t, 0), total) / Math.max(total, 0.001)) * 100}%`;

/**
 * The edited video from end to end: every piece in order at its length (a
 * part of the clip shows a frame of it, a picture itself, a title card its
 * words), a mark where one cross-fades or slides into the next, the end card,
 * the texts laid over the video in a lane beneath, and the playhead. Clicking
 * moves the playhead and picks the piece there; the panel beside it changes
 * what is picked.
 */
export function Sequence({
  placed,
  total,
  clipSeconds,
  frames,
  urls,
  time: timeClock,
  selected,
  onSelect,
  onSeek,
  onTransition,
  overlays,
  selectedOverlay,
  onOverlay,
}: {
  placed: readonly Placed[];
  total: number;
  /** The run's clip's length, to find a frame of it in `frames`. */
  clipSeconds: number;
  /** Small frames across the run's clip, if they could be made. */
  frames: readonly string[];
  /** Links to the pictures added, by path. */
  urls: Readonly<Record<string, string>>;
  time: TimeClock;
  selected: string | null;
  onSelect: (id: string) => void;
  onSeek: (t: number) => void;
  /** The mark of the transition into a piece was pressed. */
  onTransition: (id: string) => void;
  overlays: readonly Overlay[];
  selectedOverlay: string | null;
  onOverlay: (id: string) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const t = useTime(timeClock);
  const sequenceEnd = placed[placed.length - 1]?.until ?? 0;

  const timeAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(total, Math.max(0, ((clientX - box.left) / box.width) * total));
  };
  const pick = (at: number) => {
    onSeek(at);
    // The later of two pieces sharing a moment is the one coming in.
    const under = [...placed].reverse().find((p) => at >= p.at && at < p.until);
    if (under) onSelect(under.segment.id);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pick(timeAt(e.clientX));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onSeek(timeAt(e.clientX));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === 'ArrowRight') onSeek(Math.min(total, t + step));
    else if (e.key === 'ArrowLeft') onSeek(Math.max(0, t - step));
    else if (e.key === 'Home') onSeek(0);
    else if (e.key === 'End') onSeek(total);
    else return;
    e.preventDefault();
  };

  const thumb = (p: Placed): string | null => {
    const s = p.segment;
    if (s.kind === 'image') return urls[s.media.path] ?? null;
    if (s.kind === 'clip' && s.media === null && frames.length > 0) {
      const i = Math.min(frames.length - 1, Math.floor(((s.start + s.end) / 2 / Math.max(clipSeconds, 0.001)) * frames.length));
      return frames[i] ?? null;
    }
    return null;
  };

  return (
    <div className={styles.sequence}>
      <div
        ref={track}
        className={styles.sequenceTrack}
        role="slider"
        tabIndex={0}
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={Math.round(total * 10) / 10}
        aria-valuenow={Math.round(t * 10) / 10}
        aria-valuetext={clock(t)}
        onPointerDown={down}
        onPointerMove={move}
        onKeyDown={key}
      >
        {placed.map((p) => {
          const s = p.segment;
          const src = thumb(p);
          return (
            <div
              key={s.id}
              className={cx(styles.piece, s.kind === 'title' && styles.pieceTitle, s.kind === 'image' && styles.pieceImage, s.kind === 'clip' && s.media && styles.pieceVideo, selected === s.id && styles.pieceOn)}
              style={{ left: percent(p.at, total), width: percent(p.until - p.at, total), ...(src ? { backgroundImage: `url("${src}")` } : {}) }}
              title={`${pieceName(s)} · ${clock(pieceSeconds(s))}`}
            >
              <span className={styles.pieceLabel}>
                {s.kind === 'title' ? <Type size={12} aria-hidden /> : s.kind === 'image' ? <ImageIcon size={12} aria-hidden /> : <Film size={12} aria-hidden />}
                <span>{s.kind === 'title' ? s.text : s.kind === 'image' ? s.media.name : s.media ? s.media.name : clock(s.start)}</span>
              </span>
            </div>
          );
        })}
        {total > sequenceEnd + 0.01 && (
          <div className={cx(styles.piece, styles.pieceEnd)} style={{ left: percent(sequenceEnd, total), width: percent(total - sequenceEnd, total) }} title="End card">
            <span className={styles.pieceLabel}>End card</span>
          </div>
        )}
        {placed.slice(1).map((p) => (
          <button
            key={`t-${p.segment.id}`}
            type="button"
            className={cx(styles.joint, p.segment.transition.type !== 'cut' && styles.jointOn)}
            style={{ left: percent(p.at + p.overlap / 2, total) }}
            aria-label={`Transition into piece ${p.index + 1}: ${TRANSITION_LABEL[p.segment.transition.type]}`}
            title={TRANSITION_LABEL[p.segment.transition.type]}
            onClick={() => onTransition(p.segment.id)}
          />
        ))}
        <span className={styles.seqPlayhead} style={{ left: percent(t, total) }} aria-hidden />
      </div>
      {overlays.length > 0 && (
        <div className={styles.overlayLane} aria-label="Texts on the video">
          {overlays.map((o) => (
            <button
              key={o.id}
              type="button"
              className={cx(styles.overlayMark, selectedOverlay === o.id && styles.overlayMarkOn)}
              style={{ left: percent(o.start, total), width: percent(o.end - o.start, total) }}
              onClick={() => {
                onOverlay(o.id);
                onSeek(o.start);
              }}
              title={o.text}
            >
              {o.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
