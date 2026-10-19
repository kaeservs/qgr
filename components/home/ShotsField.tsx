'use client';

import { ImagePlus, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import { cx } from '@/lib/cx';
import { SHOT_TYPES } from '@/lib/data/source';
import { MAX_SHOT_BYTES, MAX_SHOTS } from '@/lib/run-input';
import { removeShot, uploadShot, UploadError } from '@/lib/video/upload';
import styles from './home.module.css';

type Shot = { key: string; name: string; preview: string; state: 'uploading' } | { key: string; name: string; preview: string; state: 'ready'; path: string; sample: boolean } | { key: string; name: string; preview: string; state: 'failed'; error: string };

/** What the start card needs: the screenshots ready to read, and whether any are still going up. */
export interface ShotsStatus {
  paths: string[];
  uploading: boolean;
  sample: boolean;
}

const TYPES = Object.values(SHOT_TYPES) as string[];

/**
 * Screenshots of a competitor's ads: dropped, pasted or picked, each uploaded
 * at once straight to Storage (competitor-shots, the teammate's own folder).
 * Taking one away removes it again; one a run uses stays with the run.
 */
export function ShotsField({ onStatus }: { onStatus: (status: ShotsStatus) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    onStatus({
      paths: shots.flatMap((s) => (s.state === 'ready' ? [s.path] : [])),
      uploading: shots.some((s) => s.state === 'uploading'),
      sample: shots.some((s) => s.state === 'ready' && s.sample),
    });
  }, [shots, onStatus]);

  // The previews live in this tab only; they go with the field.
  useEffect(() => {
    const list = previews.current;
    return () => list.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // The list as it stands, for adds that come quicker than a render.
  const current = useRef<Shot[]>([]);
  useEffect(() => {
    current.current = shots;
  }, [shots]);

  const add = useCallback((files: File[]) => {
    setNote(null);
    const pictures = files.filter((f) => TYPES.includes(f.type));
    if (pictures.length < files.length) setNote('Only PNG, JPEG and WebP screenshots can be read.');
    const room = MAX_SHOTS - current.current.length;
    if (pictures.length > room) setNote(`Up to ${MAX_SHOTS} screenshots a run.`);
    const added = pictures.slice(0, Math.max(0, room)).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      const key = crypto.randomUUID();
      const shot: Shot = file.size > MAX_SHOT_BYTES ? { key, name: file.name, preview, state: 'failed', error: 'Over 10 MB.' } : { key, name: file.name, preview, state: 'uploading' };
      return { shot, file };
    });
    if (added.length === 0) return;
    current.current = [...current.current, ...added.map((a) => a.shot)];
    setShots(current.current);
    for (const { shot, file } of added) {
      if (shot.state !== 'uploading') continue;
      const settle = (next: Shot) => setShots((now) => now.map((s) => (s.key === shot.key ? next : s)));
      uploadShot(file, () => undefined)
        .then((up) => {
          // Taken away while it went up: it goes again.
          if (!current.current.some((s) => s.key === shot.key)) return up.sample ? undefined : removeShot(up.path);
          settle({ key: shot.key, name: shot.name, preview: shot.preview, state: 'ready', path: up.path, sample: up.sample });
        })
        .catch((err: unknown) => settle({ key: shot.key, name: shot.name, preview: shot.preview, state: 'failed', error: err instanceof UploadError ? err.message : 'It could not be uploaded. Try again.' }));
    }
  }, []);

  function takeAway(shot: Shot) {
    if (shot.state === 'ready' && !shot.sample) void removeShot(shot.path);
    URL.revokeObjectURL(shot.preview);
    previews.current.delete(shot.preview);
    current.current = current.current.filter((s) => s.key !== shot.key);
    setShots(current.current);
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const files = [...e.clipboardData.files];
    if (files.length === 0) return;
    e.preventDefault();
    add(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `Pasted screenshot ${shots.length + i + 1}.png`, { type: f.type }))));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    add([...e.dataTransfer.files]);
  }

  const full = shots.length >= MAX_SHOTS;

  return (
    <div className={styles.shotsField}>
      <div
        className={cx(styles.shotsDrop, over && styles.shotsDropOver)}
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        tabIndex={0}
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
      >
        <ImagePlus size={22} aria-hidden />
        <p id={`${id}-label`} className={styles.shotsLabel}>
          Screenshots of their ads
        </p>
        <p id={`${id}-help`} className="muted small">
          Paste one here (Ctrl+V or ⌘V), drop them in, or pick them. Up to {MAX_SHOTS}, from a feed, Meta’s Ad Library or LinkedIn.
        </p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={full}>
          Choose screenshots
        </button>
        <input
          ref={input}
          type="file"
          accept={TYPES.join(',')}
          multiple
          hidden
          onChange={(e) => {
            add([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      {note && <p className="muted small">{note}</p>}
      {shots.length > 0 && (
        <ul className={styles.shotsList} aria-label="Screenshots added">
          {shots.map((shot, i) => (
            <li key={shot.key} className={cx(styles.shot, shot.state === 'failed' && styles.shotFailed)}>
              <img src={shot.preview} alt={`Screenshot ${i + 1}: ${shot.name}`} />
              <span className={styles.shotNum}>{i + 1}</span>
              {shot.state === 'uploading' && (
                <span className={styles.shotState} aria-live="polite">
                  <LoaderCircle size={14} className="spin" aria-hidden />
                  Uploading
                </span>
              )}
              {shot.state === 'failed' && (
                <span className={styles.shotState} role="alert">
                  <TriangleAlert size={14} aria-hidden />
                  {shot.error}
                </span>
              )}
              <button type="button" className={styles.shotRemove} onClick={() => takeAway(shot)} aria-label={`Take away screenshot ${i + 1}`}>
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
