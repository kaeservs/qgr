'use client';

import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { cx } from '@/lib/cx';
import { clock, editedTimeAt, moveEdge, partIndexAt } from '@/lib/video/edit';
import type { Caption, Part } from '@/lib/video/edit';
import { useMoment } from './player';
import type { Clock } from './player';
import styles from './video.module.css';

const percent = (t: number, duration: number) => `${(Math.min(Math.max(t, 0), duration) / duration) * 100}%`;

/** A step for the arrow keys: a tenth of a second, a second with Shift, five with Page Up and Down. */
function keyStep(e: KeyboardEvent): number | null {
  const step = e.shiftKey ? 1 : 0.1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') return step;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') return -step;
  if (e.key === 'PageUp') return 5;
  if (e.key === 'PageDown') return -5;
  return null;
}

/**
 * The clip from end to end: what is kept, what is cut (hatched), the
 * playhead, and handles to trim the part under it. Clicking or dragging on
 * it moves the playhead; the tools beside it act on what is under the
 * playhead, so there is nothing else to select.
 */
export function Timeline({
  duration,
  keep,
  clock: playerClock,
  frames,
  onSeek,
  onKeep,
  captions,
  selectedCaption = null,
  onCaption,
}: {
  duration: number;
  keep: readonly Part[];
  clock: Clock;
  /** Small frames across the clip, if they could be made. */
  frames: readonly string[];
  onSeek: (clipTime: number) => void;
  /** An edge moved: `done` is false while it is being dragged and true once it is let go. */
  onKeep: (keep: Part[], done: boolean) => void;
  captions?: readonly Caption[];
  selectedCaption?: number | null;
  onCaption?: (index: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const { clipTime, tailTime } = useMoment(playerClock);
  const current = tailTime === null ? partIndexAt(keep, clipTime) : -1;
  const part = keep[current];

  const timeAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(Math.max((clientX - box.left) / box.width, 0), 1) * duration;
  };

  function scrub(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(timeAt(e.clientX));
  }

  function drag(edge: 'start' | 'end', index: number) {
    return {
      onPointerDown(e: PointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove(e: PointerEvent<HTMLDivElement>) {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const next = moveEdge(keep, index, edge, timeAt(e.clientX), duration);
        onKeep(next, false);
        const moved = next[index];
        // The picture follows the edge, so the cut can be placed on the right frame.
        if (moved) onSeek(edge === 'start' ? moved.start : Math.max(moved.start, moved.end - 0.04));
      },
      onPointerUp(e: PointerEvent<HTMLDivElement>) {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onKeep([...keep], true);
      },
      onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        const step = keyStep(e);
        const at = keep[index];
        if (step === null || !at) return;
        e.preventDefault();
        const next = moveEdge(keep, index, edge, (edge === 'start' ? at.start : at.end) + step, duration);
        onKeep(next, true);
        const moved = next[index];
        if (moved) onSeek(edge === 'start' ? moved.start : Math.max(moved.start, moved.end - 0.04));
      },
    };
  }

  // The stretches between kept parts, which are cut.
  const gaps: Part[] = [];
  let from = 0;
  for (const p of keep) {
    if (p.start - from > 0.01) gaps.push({ start: from, end: p.start });
    from = p.end;
  }
  if (duration - from > 0.01) gaps.push({ start: from, end: duration });

  return (
    <div className={styles.timeline}>
      <div ref={track} className={styles.track} onPointerDown={scrub} onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && onSeek(timeAt(e.clientX))}>
        <div className={styles.film} aria-hidden>
          {frames.map((src) => (
            <img key={src} src={src} alt="" draggable={false} />
          ))}
        </div>
        {gaps.map((g) => (
          <div key={`${g.start}-${g.end}`} className={styles.gap} style={{ left: percent(g.start, duration), width: percent(g.end - g.start, duration) }} aria-hidden>
            {(g.end - g.start) / duration > 0.08 && <span>Cut</span>}
          </div>
        ))}
        {keep.map((p, i) => (
          <div key={`${p.start}-${p.end}`} className={cx(styles.part, i === current && styles.partOn)} style={{ left: percent(p.start, duration), width: percent(p.end - p.start, duration) }} aria-hidden />
        ))}
        {part && (
          <>
            <div
              className={cx(styles.handle, styles.handleStart)}
              style={{ left: percent(part.start, duration) }}
              role="slider"
              tabIndex={0}
              aria-label={`Start of part ${current + 1}`}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration * 10) / 10}
              aria-valuenow={Math.round(part.start * 10) / 10}
              aria-valuetext={clock(part.start)}
              {...drag('start', current)}
            />
            <div
              className={cx(styles.handle, styles.handleEnd)}
              style={{ left: percent(part.end, duration) }}
              role="slider"
              tabIndex={0}
              aria-label={`End of part ${current + 1}`}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration * 10) / 10}
              aria-valuenow={Math.round(part.end * 10) / 10}
              aria-valuetext={clock(part.end)}
              {...drag('end', current)}
            />
          </>
        )}
        <div
          className={styles.playhead}
          style={{ left: percent(clipTime, duration) }}
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration * 10) / 10}
          aria-valuenow={Math.round(clipTime * 10) / 10}
          aria-valuetext={clock(clipTime)}
          onKeyDown={(e) => {
            if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              return onSeek(e.key === 'Home' ? 0 : duration);
            }
            const step = keyStep(e);
            if (step === null) return;
            e.preventDefault();
            onSeek(Math.min(Math.max(clipTime + step, 0), duration));
          }}
        />
      </div>

      {captions && (
        <div className={styles.captionLane} aria-label="Captions">
          {captions.map((c, i) => (
            <button
              key={i}
              type="button"
              className={cx(styles.captionMark, i === selectedCaption && styles.captionMarkOn, editedTimeAt(keep, c.start) === null && editedTimeAt(keep, c.end - 0.01) === null && styles.captionMarkCut)}
              style={{ left: percent(c.start, duration), width: percent(c.end - c.start, duration) }}
              title={c.text || 'Empty caption'}
              aria-label={`Caption ${i + 1} at ${clock(c.start)}: ${c.text || 'empty'}${editedTimeAt(keep, c.start) === null && editedTimeAt(keep, c.end - 0.01) === null ? ', in a cut part' : ''}`}
              onClick={() => {
                onCaption?.(i);
                onSeek(c.start);
              }}
            >
              {c.text}
            </button>
          ))}
        </div>
      )}

      <div className={styles.ruler} aria-hidden>
        <span>0:00.0</span>
        <span>{clock(duration)}</span>
      </div>
    </div>
  );
}
