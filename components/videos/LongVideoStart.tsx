'use client';

import { Ear, FileVideo, Sparkles, Square, X as Close } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { formatBytes } from '@/lib/format';
import { clock, MAX_LONG_DESCRIPTION, MAX_LONG_GUIDANCE, MAX_LONG_TITLE, titleFromFile } from '@/lib/long-video';
import type { LongFile, LongHearing } from '@/lib/speech-long';
import type { TranscriptLine } from '@/lib/types';
import { keepLocalFile } from '@/lib/video/local-files';
import styles from './videos.module.css';

type Step =
  | { step: 'empty' }
  | { step: 'reading' }
  | { step: 'ready'; info: LongFile }
  | { step: 'hearing'; info: LongFile; hearing: LongHearing; started: number }
  | { step: 'heard'; info: LongFile; lines: TranscriptLine[] }
  | { step: 'saving'; info: LongFile; lines: TranscriptLine[] };

/** About how long is left, from how fast it has gone so far: "about 12 minutes left". */
function left(started: number, share: number | null): string | null {
  if (share === null || share < 0.03) return null;
  const seconds = ((Date.now() - started) / 1000) * ((1 - share) / share);
  if (seconds < 60) return 'under a minute left';
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'} left`;
}

/**
 * A long recording, heard on this computer: picked, read for its length, then
 * listened to five minutes at a time (lib/speech-long.ts). Only what is said is
 * sent on, to find the moments worth an ad; the file stays here.
 */
export function LongVideoStart() {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>({ step: 'empty' });
  const [title, setTitle] = useState('');
  const [guidance, setGuidance] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const running = useRef<AbortController | null>(null);
  const [, tick] = useState(0);

  // Hearing an hour takes a while: the time left is redrawn every few seconds, and leaving asks first.
  const hearing = step.step === 'hearing';
  useEffect(() => {
    if (!hearing) return;
    const id = setInterval(() => tick((n) => n + 1), 5000);
    const stay = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', stay);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', stay);
    };
  }, [hearing]);
  useEffect(() => () => running.current?.abort(), []);

  async function pick(f: File | undefined) {
    if (!f) return;
    running.current?.abort();
    setError(null);
    setRetry(false);
    if (!f.type.startsWith('video/') && !f.type.startsWith('audio/') && !/\.(mp4|m4v|mov|webm|mkv|m4a|mp3|wav)$/i.test(f.name)) return setError('Pick a video or a recording: MP4, MOV, WebM or an audio file.');
    setFile(f);
    setTitle(titleFromFile(f.name));
    setStep({ step: 'reading' });
    try {
      const { probeLong } = await import('@/lib/speech-long');
      setStep({ step: 'ready', info: await probeLong(f) });
    } catch (err) {
      setStep({ step: 'empty' });
      setFile(null);
      setError(err instanceof Error ? err.message : 'This file can’t be read as a video.');
    }
  }

  async function listen(info: LongFile) {
    if (!file) return;
    setError(null);
    setRetry(false);
    const controller = new AbortController();
    running.current = controller;
    const started = Date.now();
    setStep({ step: 'hearing', info, hearing: { stage: 'listening', share: null, lines: [] }, started });
    try {
      const { hearLong } = await import('@/lib/speech-long');
      const lines = await hearLong(file, info.duration, (h) => setStep({ step: 'hearing', info, hearing: h, started }), controller.signal);
      setStep({ step: 'heard', info, lines });
    } catch (err) {
      if (controller.signal.aborted) return setStep({ step: 'ready', info });
      setStep({ step: 'ready', info });
      setError(err instanceof Error ? err.message : 'The video could not be heard here.');
      setRetry(true);
    }
  }

  async function save(info: LongFile, lines: TranscriptLine[]) {
    if (!file) return;
    if (!title.trim()) return setError('Name the video.');
    setError(null);
    setStep({ step: 'saving', info, lines });
    try {
      const res = await fetch('/api/long-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), file: info, transcript: lines, ...(guidance.trim() ? { guidance: guidance.trim() } : {}), ...(description.trim() ? { description: description.trim() } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) throw new Error(body?.error ?? 'The video could not be kept.');
      keepLocalFile(body.id, file);
      router.push(`/videos/long/${body.id}`);
    } catch (err) {
      setStep({ step: 'heard', info, lines });
      setError(err instanceof Error ? err.message : 'The video could not be kept.');
    }
  }

  function clear() {
    running.current?.abort();
    setFile(null);
    setStep({ step: 'empty' });
    setError(null);
    setRetry(false);
  }

  const info = step.step === 'ready' || step.step === 'hearing' || step.step === 'heard' || step.step === 'saving' ? step.info : null;

  return (
    <section className={cx('card card-pad', styles.longStart)} aria-labelledby="long-start-title">
      <div>
        <h2 id="long-start-title" className="card-title">
          Find the best moments in a long video
        </h2>
        <p className="muted small">
          A webinar, a talk or an interview, up to three hours. It is heard on this computer and never uploaded: only what is said is sent on, and the agent picks the moments worth
          an ad. Then you cut the ones you like into clips, and each becomes a run.
        </p>
      </div>

      <input
        ref={picker}
        type="file"
        accept="video/*,audio/*,.mkv"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {!info ? (
        <button type="button" className={styles.longDrop} onClick={() => picker.current?.click()} disabled={step.step === 'reading'} aria-busy={step.step === 'reading'}>
          <FileVideo size={22} aria-hidden />
          <span>{step.step === 'reading' ? 'Reading the file…' : 'Pick the recording'}</span>
          <span className="muted small">MP4, MOV or WebM · it stays on this computer</span>
        </button>
      ) : (
        <div className={styles.longFile}>
          <FileVideo size={20} aria-hidden />
          <div>
            <strong>{info.name}</strong>
            <span className="muted small">
              {clock(info.duration)} · {formatBytes(info.size)}
              {info.width ? ` · ${info.width}×${info.height}` : ''}
            </span>
          </div>
          {step.step !== 'saving' && (
            <button type="button" className="icon-btn icon-btn-plain" aria-label="Pick another file" onClick={clear}>
              <Close size={18} aria-hidden />
            </button>
          )}
        </div>
      )}

      {step.step === 'hearing' && (
        <div className={styles.hearing} role="status">
          <div className={styles.hearingHead}>
            <span>
              <Ear size={16} aria-hidden />{' '}
              {step.hearing.stage === 'loading'
                ? `Getting the speech model ready${step.hearing.share !== null ? ` · ${Math.round(step.hearing.share * 100)}%` : '…'} (the first time only)`
                : `Listening · ${Math.round((step.hearing.share ?? 0) * 100)}%`}
            </span>
            <span className="muted small">{step.hearing.stage === 'listening' ? left(step.started, step.hearing.share) : null}</span>
          </div>
          <div className={styles.bar} aria-hidden>
            <span style={{ width: `${Math.round((step.hearing.share ?? 0) * 100)}%` }} />
          </div>
          {step.hearing.lines.length > 0 && (
            <ol className={styles.heardLines} aria-label="Heard so far">
              {step.hearing.lines.slice(-4).map((l, i) => (
                <li key={`${l.start}-${i}`}>
                  <span className="muted small">{clock(l.start)}</span> {l.text}
                </li>
              ))}
            </ol>
          )}
          <p className="muted small">Keep this tab open while it listens. It runs on this computer, so a newer laptop is faster; nothing is paid for.</p>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => running.current?.abort()}>
            <Square size={14} aria-hidden />
            Stop
          </button>
        </div>
      )}

      {(step.step === 'ready' || step.step === 'heard' || step.step === 'saving') && (
        <div className={styles.longFields}>
          <label className="field">
            <span className="label">Name</span>
            <input className="input" value={title} maxLength={MAX_LONG_TITLE} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Description (optional)</span>
            <textarea
              className="textarea"
              rows={2}
              maxLength={MAX_LONG_DESCRIPTION}
              value={description}
              placeholder="What the video is about: e.g. Our Q4 webinar on the Gold Card and EB-5, for families in India."
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className={`field ${styles.longWide}`}>
            <span className="label">Direction for the agent (optional)</span>
            <textarea
              className="textarea"
              rows={2}
              maxLength={MAX_LONG_GUIDANCE}
              value={guidance}
              placeholder="E.g. Find the moments about families with children close to 21, and the debt vs equity answer."
              onChange={(e) => setGuidance(e.target.value)}
            />
          </label>
        </div>
      )}

      {step.step === 'heard' || step.step === 'saving' ? (
        <p className="muted small">
          Heard {step.lines.length.toLocaleString('en-US')} lines, up to {clock(step.lines[step.lines.length - 1]?.end ?? 0)}.
        </p>
      ) : null}

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div className={styles.longActions}>
        {step.step === 'ready' && (
          <button type="button" className="btn btn-primary" onClick={() => void listen(step.info)}>
            <Ear size={17} aria-hidden />
            {retry ? 'Try listening again' : 'Listen to it'}
          </button>
        )}
        {(step.step === 'heard' || step.step === 'saving') && (
          <button type="button" className="btn btn-primary" onClick={() => void save(step.info, step.lines)} disabled={step.step === 'saving'} aria-busy={step.step === 'saving'}>
            <Sparkles size={17} aria-hidden />
            {step.step === 'saving' ? 'Keeping it…' : 'Find the best moments'}
          </button>
        )}
      </div>
    </section>
  );
}
