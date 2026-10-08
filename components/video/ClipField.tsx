'use client';

import { CircleCheck, Film, LoaderCircle, Scissors, TriangleAlert, X as Close } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { CLIP_TYPES } from '@/lib/data/source';
import type { ClipExtension } from '@/lib/data/source';
import { MAX_CLIP_BYTES } from '@/lib/run-input';
import type { Clip } from '@/lib/types';
import { frameSize, keptSeconds, length } from '@/lib/video/edit';
import type { Part } from '@/lib/video/edit';
import { RenderError } from '@/lib/video/errors';
import { extensionFor, removeUpload, uploadClip, UploadError } from '@/lib/video/upload';
import { ClipCutter } from './ClipCutter';
import type { Cut } from './ClipCutter';
import styles from './video.module.css';

/** Where the clip is, for the form around it. */
export type ClipStatus = { state: 'empty' } | { state: 'working'; label: string } | { state: 'ready'; clip: Clip; sample: boolean } | { state: 'failed'; error: string };

type Job = { stage: 'preparing' | 'uploading'; progress: number } | { stage: 'ready'; clip: Clip; sample: boolean } | { stage: 'failed'; error: string };

interface Picked {
  file: File;
  url: string;
  cut: Cut | null;
}

/** Room to spare under the 50 MB limit: a file never comes out exactly the size it was aimed at. */
const AIM_BYTES = 45 * 1024 * 1024;

/** The kind of file it is, by its type or else its name; null for a kind Storage does not keep. */
function kindOf(file: File): ClipExtension | null {
  const byType = extensionFor(file.type);
  if (byType) return byType;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'mp4' || ext === 'm4v' ? 'mp4' : ext === 'mov' ? 'mov' : ext === 'webm' ? 'webm' : null;
}

const isWhole = (keep: readonly Part[], duration: number) => keep.length === 1 && (keep[0]?.start ?? 1) < 0.05 && (keep[0]?.end ?? 0) > duration - 0.05;

function describe(job: Job | null): ClipStatus {
  if (!job) return { state: 'empty' };
  if (job.stage === 'ready') return { state: 'ready', clip: job.clip, sample: job.sample };
  if (job.stage === 'failed') return { state: 'failed', error: job.error };
  const pct = Math.round(job.progress * 100);
  return { state: 'working', label: job.stage === 'preparing' ? `Preparing the clip… ${pct}%` : `Uploading the clip… ${pct}%` };
}

/**
 * A video picked from the computer, cut before it goes anywhere. Once the
 * cut is chosen, the kept parts are made into one file in the browser (unless
 * the whole clip already fits) and uploaded, while the person writes their
 * notes. A clip replaced or taken away is removed from Storage again.
 */
export function ClipField({ onStatus }: { onStatus: (status: ClipStatus) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [cutting, setCutting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const running = useRef<AbortController | null>(null);
  // The upload this field made and no run has used yet, to remove if it is replaced or left.
  const uploaded = useRef<string | null>(null);
  const shown = useRef('');

  // Encoding reports every frame; the form hears of it only when what it shows changes (a whole percent).
  const report = useCallback(
    (next: Job | null) => {
      const status = describe(next);
      const key = JSON.stringify(status);
      if (key === shown.current) return;
      shown.current = key;
      setJob(next);
      onStatus(status);
    },
    [onStatus],
  );

  // Leaving the page takes away an upload no run used. Storage refuses to remove one a run did use.
  useEffect(() => {
    const leave = () => {
      if (uploaded.current) void removeUpload(uploaded.current);
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      running.current?.abort();
      leave();
    };
  }, []);

  function discard() {
    running.current?.abort();
    running.current = null;
    if (uploaded.current) void removeUpload(uploaded.current);
    uploaded.current = null;
  }

  function pick(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/') && !kindOf(file)) return setProblem('Pick a video file: MP4, MOV or WebM.');
    setProblem(null);
    discard();
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked({ file, url: URL.createObjectURL(file), cut: null });
    report(null);
    setCutting(true);
  }

  async function prepare(file: File, cut: Cut, signal: AbortSignal) {
    const duration = keptSeconds(cut.keep);
    const kind = kindOf(file);
    let blob: Blob;
    let size = cut.size;
    if (kind && file.size <= MAX_CLIP_BYTES && isWhole(cut.keep, cut.duration)) {
      // Nothing cut and small enough: the file goes up as it is, untouched.
      blob = new Blob([file], { type: CLIP_TYPES[kind] });
    } else {
      report({ stage: 'preparing', progress: 0 });
      // Mediabunny loads now, the first time a clip is made: most visits to this page never need it.
      const { bitrateToFit, probeClip, render } = await import('@/lib/video/render');
      const info = await probeClip(file);
      size = frameSize({ aspect: 'original', fit: 'fill' }, { width: info.width, height: info.height });
      let bitrate = bitrateToFit(size, Math.min(30, info.frameRate || 30), duration, AIM_BYTES, info.hasAudio);
      const make = () =>
        render({
          source: file,
          keep: cut.keep,
          tail: 0,
          size,
          bitrate,
          volume: 1,
          draw: (ctx, picture) => {
            if (picture) ctx.drawImage(picture.image, 0, 0, size.width, size.height);
          },
          onProgress: (share) => report({ stage: 'preparing', progress: share }),
          signal,
        });
      let made = await make();
      // Rarely the encoder overshoots; once more, a little smaller, before giving up.
      if (made.blob.size > MAX_CLIP_BYTES) {
        bitrate = Math.round(bitrate * 0.75 * (AIM_BYTES / made.blob.size));
        made = await make();
      }
      if (made.blob.size > MAX_CLIP_BYTES) throw new RenderError('Even made smaller, this clip is over 50 MB. Cut it shorter.');
      blob = made.blob;
    }

    report({ stage: 'uploading', progress: 0 });
    const up = await uploadClip(blob, (share) => report({ stage: 'uploading', progress: share }), signal);
    if (!up.sample) uploaded.current = up.path;
    report({ stage: 'ready', sample: up.sample, clip: { path: up.path, name: file.name, duration, width: size.width, height: size.height, size: blob.size } });
  }

  function start(cut: Cut) {
    if (!picked) return;
    discard();
    const controller = new AbortController();
    running.current = controller;
    setPicked({ ...picked, cut });
    setCutting(false);
    prepare(picked.file, cut, controller.signal).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      const error = err instanceof RenderError || err instanceof UploadError ? err.message : 'The clip could not be uploaded. Try again.';
      report({ stage: 'failed', error });
    });
  }

  function clear() {
    discard();
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(null);
    report(null);
    setCutting(false);
  }

  const status = describe(job);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*"
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      {!picked || (!picked.cut && !cutting) ? (
        <button
          type="button"
          className={cx(styles.clipDrop, dragging && styles.clipDropOn)}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files);
          }}
        >
          <Film size={22} aria-hidden />
          <span>
            Drop a video here, or <span className="link">browse</span>
          </span>
          <span className="muted small">MP4, MOV or WebM · cut it before it uploads · up to 10 minutes kept</span>
        </button>
      ) : (
        <div className={styles.clipChip}>
          {picked.cut?.poster ? <img className={styles.clipThumb} src={picked.cut.poster} alt="" /> : <span className={styles.clipThumb} aria-hidden />}
          <div className={styles.clipInfo}>
            <span className={styles.clipName}>{picked.file.name}</span>
            {picked.cut && (
              <span className="muted small">
                {length(keptSeconds(picked.cut.keep))} kept of {length(picked.cut.duration)}
                {picked.cut.keep.length > 1 && ` · ${picked.cut.keep.length} parts`}
              </span>
            )}
            {status.state === 'working' && (
              <>
                <span className={styles.clipStatus} aria-live="polite">
                  <LoaderCircle size={14} className="spin" aria-hidden />
                  {status.label}
                </span>
                <span className={styles.progress} aria-hidden>
                  <span style={{ width: `${Math.round(((job && 'progress' in job ? job.progress : 0) || 0) * 100)}%` }} />
                </span>
              </>
            )}
            {status.state === 'ready' && (
              <span className={cx(styles.clipStatus, styles.clipStatusOk)}>
                <CircleCheck size={14} aria-hidden />
                {status.sample ? 'Cut. Sample data keeps no uploads, so it stays in this browser.' : 'Uploaded'}
              </span>
            )}
            {status.state === 'failed' && (
              <span className={cx(styles.clipStatus, styles.clipStatusBad)} role="alert">
                <TriangleAlert size={14} aria-hidden />
                {status.error}
              </span>
            )}
            {cutting && !picked.cut && <span className={styles.clipStatus}>Cutting…</span>}
          </div>
          <div className={styles.clipActions}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCutting(true)} disabled={cutting}>
              <Scissors size={15} aria-hidden />
              {picked.cut ? 'Change cut' : 'Cut'}
            </button>
            {status.state === 'failed' && picked.cut && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => picked.cut && start(picked.cut)}>
                Try again
              </button>
            )}
            <button type="button" className="icon-btn icon-btn-plain" aria-label={`Remove ${picked.file.name}`} onClick={clear}>
              <Close size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}
      {problem && (
        <p className="error-text" role="alert">
          {problem}
        </p>
      )}
      {picked && cutting && (
        <ClipCutter
          file={picked.file}
          url={picked.url}
          initialKeep={picked.cut?.keep ?? null}
          onCancel={() => {
            setCutting(false);
            // Cancelling the first cut lets go of the file; cancelling a recut keeps the clip as it was.
            if (!picked.cut) clear();
          }}
          onDone={start}
        />
      )}
    </>
  );
}
