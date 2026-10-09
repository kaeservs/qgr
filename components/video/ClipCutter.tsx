'use client';

import { Pause, Play, Plus, Redo2, RotateCcw, Scissors, Trash2, Undo2, X as Close } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clock, gapAt, keptSeconds, length, MAX_CLIP_SECONDS, partIndexAt, removePart, restoreGap, splitAt, wholeClip } from '@/lib/video/edit';
import type { Part, Size } from '@/lib/video/edit';
import { seekTo, still } from './media';
import { useMoment, usePlayer, useUndoable } from './player';
import { Timeline } from './Timeline';
import { useFilmstrip } from './useFilmstrip';
import styles from './video.module.css';

export interface Cut {
  keep: Part[];
  /** The whole clip's length, before the cut. */
  duration: number;
  size: Size;
  /** A still of the first kept frame. */
  poster: string | null;
}

/** True when a key press is typing, not a shortcut. */
const typing = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

/**
 * Cuts a picked video before it is uploaded: split it at the playhead, take
 * parts out, trim a part's edges, and play the result. Only what is kept is
 * uploaded, so a long recording can still fit Storage's 50 MB.
 */
export function ClipCutter({ file, url, initialKeep, onCancel, onDone }: { file: File; url: string; initialKeep: Part[] | null; onCancel: () => void; onDone: (cut: Cut) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [meta, setMeta] = useState<{ duration: number; size: Size } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const keep = useUndoable<Part[]>(initialKeep ?? []);
  const player = usePlayer(video, keep.value);
  const { clipTime } = useMoment(player.clock);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  // A WebM from a screen recorder may not say how long it is; Mediabunny reads it from the file then.
  async function loaded() {
    const v = video.current;
    if (!v) return;
    let duration = v.duration;
    let size = { width: v.videoWidth, height: v.videoHeight };
    if (!Number.isFinite(duration) || duration <= 0) {
      try {
        const { probeClip } = await import('@/lib/video/render');
        const info = await probeClip(file);
        duration = info.duration;
        size = { width: info.width, height: info.height };
      } catch {
        return setError('This file’s length can’t be read.');
      }
    }
    setMeta({ duration, size });
    if (!initialKeep) keep.reset(wholeClip(duration));
  }

  const duration = meta?.duration ?? 0;
  const frames = useFilmstrip(meta ? file : null, duration);
  const parts = keep.value;
  const index = partIndexAt(parts, clipTime);
  const gap = meta ? gapAt(parts, clipTime, duration) : null;
  const canSplit = splitAt(parts, clipTime).length !== parts.length;
  const kept = keptSeconds(parts);
  const tooLong = kept > MAX_CLIP_SECONDS;

  const split = () => canSplit && keep.set(splitAt(parts, clipTime));
  const remove = () => index !== -1 && parts.length > 1 && keep.set(removePart(parts, index));
  const restore = () => gap && keep.set(restoreGap(parts, clipTime, duration));

  async function finish() {
    const v = video.current;
    const first = parts[0];
    if (!meta || !v || !first || tooLong) return;
    setFinishing(true);
    player.pause();
    await seekTo(v, first.start + 0.05);
    onDone({ keep: parts, duration: meta.duration, size: meta.size, poster: still(v) });
  }

  function onKey(e: React.KeyboardEvent) {
    if (typing(e.target) || !meta) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      player.toggle();
    } else if (!mod && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      split();
    } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      remove();
    } else if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) keep.redo();
      else keep.undo();
    } else if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      keep.redo();
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="cutter-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onKeyDown={onKey}
    >
      <header className={styles.dialogHead}>
        <div>
          <h2 id="cutter-title">Cut the clip</h2>
          <p className="muted small">{file.name}</p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={onCancel}>
          <Close size={18} aria-hidden />
        </button>
      </header>

      <div className={styles.dialogBody}>
        <div className={styles.stage}>
          <video
            ref={video}
            src={url}
            playsInline
            preload="auto"
            onLoadedMetadata={() => void loaded()}
            onError={() => setError('This browser can’t play this file. MP4 plays everywhere; try Chrome, Edge or Safari, or convert the file first.')}
            onClick={() => player.toggle()}
          />
          {error && <p className={styles.stageMessage}>{error}</p>}
        </div>

        {meta && !error && (
          <>
            <div className={styles.controls}>
              <button type="button" className={styles.playButton} aria-label={player.playing ? 'Pause' : 'Play the cut'} onClick={() => player.toggle()}>
                {player.playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
              </button>
              <span className={styles.time} aria-live="off">
                <strong>{clock(clipTime)}</strong> / {clock(duration)} · keeping {length(kept)}
              </span>
              <div className={styles.tools}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={split} disabled={!canSplit} aria-keyshortcuts="S">
                  <Scissors size={15} aria-hidden />
                  Split
                </button>
                {gap ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={restore}>
                    <Plus size={15} aria-hidden />
                    Keep this part
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={index === -1 || parts.length < 2} aria-keyshortcuts="Delete">
                    <Trash2 size={15} aria-hidden />
                    Remove part
                  </button>
                )}
                <button type="button" className="icon-btn icon-btn-plain" aria-label="Undo" title="Undo" onClick={keep.undo} disabled={!keep.canUndo} aria-keyshortcuts="Control+Z">
                  <Undo2 size={17} aria-hidden />
                </button>
                <button type="button" className="icon-btn icon-btn-plain" aria-label="Redo" title="Redo" onClick={keep.redo} disabled={!keep.canRedo} aria-keyshortcuts="Control+Shift+Z">
                  <Redo2 size={17} aria-hidden />
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => keep.set(wholeClip(duration))} disabled={parts.length === 1 && kept >= duration - 0.01}>
                  <RotateCcw size={15} aria-hidden />
                  Whole clip
                </button>
              </div>
            </div>
            <Timeline duration={duration} keep={parts} clock={player.clock} frames={frames} onSeek={player.seek} onKeep={(next, done) => (done ? keep.settle(next) : keep.preview(next))} />
            <p className={styles.hint}>
              Split where you want a cut to start and end, then remove the part between. Drag a part’s gold edges to trim it. <span className="kbd">S</span> splits,{' '}
              <span className="kbd">Delete</span> removes, <span className="kbd">Space</span> plays.
            </p>
          </>
        )}
      </div>

      <footer className={styles.dialogFoot}>
        <p className={styles.footNote} role={tooLong ? 'alert' : undefined}>
          {tooLong
            ? `Cut it to ${length(MAX_CLIP_SECONDS)} or less: this keeps ${length(kept)}.`
            : 'Only what you keep is uploaded. A clip over 50 MB is made smaller in this browser first.'}
        </p>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void finish()} disabled={!meta || !!error || tooLong || finishing || parts.length === 0} aria-busy={finishing}>
          {finishing ? 'Saving the cut…' : 'Use this clip'}
        </button>
      </footer>
    </dialog>
  );
}
