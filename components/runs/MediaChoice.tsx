'use client';

import { ImagePlus, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { ClipboardEvent, Dispatch, DragEvent, SetStateAction } from 'react';
import { pricePictureAction } from '@/app/(app)/settings/actions';
import { priceVideoAction } from '@/app/(app)/videos/actions';
import { formatCredits } from '@/lib/ai-video';
import { cx } from '@/lib/cx';
import { SHOT_TYPES } from '@/lib/data/source';
import { CHEAPEST_RUN_VIDEO, forTheRun, MAX_REFERENCE_BYTES, MAX_REFERENCE_NOTE, MAX_REFERENCES, picturesBy, RUN_VIDEO_ASPECTS, RUN_VIDEO_QUALITIES, RUN_VIDEO_SECONDS, videoPriceRequest } from '@/lib/run-media';
import type { MediaSetup, RunMediaInput } from '@/lib/run-media';
import type { RunMediaKind, RunVideo } from '@/lib/types';
import { removeReference, uploadReference, UploadError } from '@/lib/video/upload';
import styles from './runs.module.css';

/** A reference picture as it is added: going up, ready with its path, or refused. */
export type ReferenceItem = { key: string; name: string; preview: string; note: string } & (
  | { state: 'uploading' }
  | { state: 'ready'; path: string; sample: boolean }
  | { state: 'failed'; error: string }
);

/** The answer being given, kept by whoever opens the question so it outlasts Back. */
export interface MediaDraft {
  kind: RunMediaKind;
  video: RunVideo;
  references: ReferenceItem[];
}

/** Where the question starts: what the team's picture switch would do, and the cheapest video. */
export const firstDraft = (setup: MediaSetup): MediaDraft => ({ kind: setup.picturesAuto ? 'pictures' : 'design', video: CHEAPEST_RUN_VIDEO, references: [] });

/** The answer to send, or what is still in the way of it. */
export function mediaAnswer(draft: MediaDraft): RunMediaInput | string {
  if (draft.kind === 'design') return { kind: 'design', references: [] };
  if (draft.references.some((r) => r.state === 'uploading')) return 'Wait for the reference pictures to finish uploading.';
  if (draft.references.some((r) => r.state === 'failed')) return 'Take away the reference picture that did not upload, or add it again.';
  const references = draft.references.flatMap((r) => (r.state === 'ready' ? [{ path: r.path, ...(r.note.trim() ? { note: r.note.trim() } : {}) }] : []));
  return draft.kind === 'video' ? { kind: 'video', references, video: draft.video } : { kind: 'pictures', references };
}

type Price = { state: 'asking' } | { state: 'ready'; credits: number; balance: number | null } | { state: 'failed'; error: string };

/** Higgsfield's price for what `key` names, asked a moment after it changes (nothing is made), and shown only for that. */
function usePrice(key: string | null, ask: () => Promise<{ ok: true; value: { credits: number; balance: number | null } } | { ok: false; error: string }>): [Price | null, () => void] {
  const [quote, setQuote] = useState<{ key: string; price: Price } | null>(null);
  const [retry, setRetry] = useState(0);
  const latest = useRef(ask);
  useEffect(() => {
    latest.current = ask;
  });
  useEffect(() => {
    if (key === null) return;
    const timer = setTimeout(() => {
      setQuote({ key, price: { state: 'asking' } });
      void latest.current()
        .catch(() => ({ ok: false as const, error: 'the price could not be asked.' }))
        .then((answer) => setQuote((q) => (q && q.key !== key ? q : { key, price: answer.ok ? { state: 'ready', credits: answer.value.credits, balance: answer.value.balance } : { state: 'failed', error: answer.error } })));
    }, 400);
    return () => clearTimeout(timer);
  }, [key, retry]);
  if (key === null) return [null, () => undefined];
  return [quote?.key === key ? quote.price : { state: 'asking' }, () => setRetry((n) => n + 1)];
}

/** A price for the run's three ads, as Higgsfield gave it for one. */
function PriceLine({ price, one, retry, creditsLeft }: { price: Price; one: string; retry: () => void; creditsLeft: number }) {
  if (price.state === 'asking') {
    return (
      <span className={cx('muted small', styles.priceLine)} role="status">
        <LoaderCircle size={13} className="spin" aria-hidden />
        Asking Higgsfield’s price…
      </span>
    );
  }
  if (price.state === 'failed') {
    return (
      <span className={cx('small', styles.priceLine)} role="status">
        <span className="muted">No price yet: {price.error}</span>
        <button type="button" className="link small" onClick={retry}>
          Ask again
        </button>
      </span>
    );
  }
  const run = forTheRun(price.credits);
  return (
    <span className="small" role="status">
      <strong>
        {formatCredits(run)} for the three ads
      </strong>
      <span className="muted">
        {' '}
        ({formatCredits(price.credits)} {one}) · {formatCredits(creditsLeft)} left in this month’s limit
        {price.balance !== null ? ` · ${formatCredits(price.balance)} on the Higgsfield plan` : ''}
      </span>
      {run > creditsLeft && <span className={styles.priceOver}> That is past this month’s limit: raise it in Settings, or pick a cheaper option.</span>}
    </span>
  );
}

const TYPES = Object.values(SHOT_TYPES) as string[];
const SECONDS_LABEL = (s: number) => `${s} seconds`;
const ASPECT_LABEL: Record<RunVideo['aspect'], string> = { '9:16': '9:16 · Stories and Reels', '1:1': '1:1 · Square', '16:9': '16:9 · Wide' };

/**
 * What the run's ads are made of: the drawn design, an AI picture for each ad
 * or an AI video for each, with Higgsfield's price for the three; and up to
 * four reference pictures Higgsfield keeps to. A run from a clip is not asked:
 * its ads are the clip.
 */
export function MediaChoice({ setup, draft, setDraft, disabled = false }: { setup: MediaSetup; draft: MediaDraft; setDraft: Dispatch<SetStateAction<MediaDraft>>; disabled?: boolean }) {
  const name = useId();
  const ready = draft.references.filter((r) => r.state === 'ready').length;
  const pictureModel = picturesBy(setup.pictureModel, ready);
  // Prices are asked only for what is picked, and never on the sample data.
  const [picturePrice, retryPicture] = usePrice(!setup.sample && draft.kind === 'pictures' && pictureModel === 'higgsfield' ? `picture:${setup.picturesQuality}` : null, () => pricePictureAction(setup.picturesQuality));
  const video = draft.video;
  const [videoPrice, retryVideo] = usePrice(!setup.sample && draft.kind === 'video' ? `video:${video.seconds}:${video.quality}:${video.aspect}` : null, () => priceVideoAction(videoPriceRequest(video)));
  const set = (kind: RunMediaKind) => setDraft((d) => ({ ...d, kind }));
  const setVideo = (change: Partial<RunVideo>) => setDraft((d) => ({ ...d, video: { ...d.video, ...change } }));

  const options: { kind: RunMediaKind; title: string; detail: string; off?: string }[] = [
    { kind: 'design', title: 'The drawn design', detail: 'Each ad’s words on Quantum Global’s own artwork. Free, and ready as soon as the ads are written.' },
    { kind: 'pictures', title: 'An AI picture for each ad', detail: 'The Content Agent describes a scene for each ad and an image model draws it; the words go over it.' },
    {
      kind: 'video',
      title: 'An AI video for each ad',
      detail: 'Higgsfield makes a short silent video for each ad (Seedance 2.0 Mini, its budget model). Edit and post it as any video ad.',
      ...(setup.videosLive ? {} : { off: 'AI video is off: switch it on in' }),
    },
  ];

  return (
    <>
      <fieldset className={styles.question} disabled={disabled}>
        <legend className="label">What the ads are made of</legend>
        {options.map((o) => (
          <label key={o.kind} className={cx(styles.answer, draft.kind === o.kind && styles.answerOn, o.off && styles.answerOff)}>
            <input type="radio" name={name} checked={draft.kind === o.kind} disabled={!!o.off} onChange={() => set(o.kind)} />
            <span>
              <strong>{o.title}</strong>
              <span className="muted small">{o.detail}</span>
              {o.off && (
                <span className="small">
                  {o.off}{' '}
                  <Link href="/settings" className="link">
                    Settings
                  </Link>{' '}
                  first.
                </span>
              )}
            </span>
          </label>
        ))}
        <div className={styles.mediaDetail}>
          {draft.kind === 'pictures' && (
            <>
              {pictureModel === 'higgsfield' ? (
                setup.sample ? (
                  <span className="muted small">Higgsfield’s GPT Image 2.5 makes them. The sample data prices nothing.</span>
                ) : (
                  <>
                    <span className="muted small">
                      Higgsfield’s GPT Image 2.5 makes them
                      {setup.pictureModel !== 'higgsfield' ? ', because Higgsfield is the one model that takes reference pictures' : ''}, at {setup.picturesQuality} quality.
                    </span>
                    {picturePrice && <PriceLine price={picturePrice} one="a picture" retry={retryPicture} creditsLeft={setup.creditsLeft} />}
                  </>
                )
              ) : pictureModel === 'cloudflare' ? (
                <span className="muted small">Cloudflare’s FLUX.1 schnell makes them, free. Add a reference picture and Higgsfield makes them instead, for credits.</span>
              ) : (
                <span className={cx('small', styles.priceOver)}>
                  Pictures are set to the stand-in, which makes none. Choose an image model in{' '}
                  <Link href="/settings" className="link">
                    Settings
                  </Link>
                  , or add a reference picture and Higgsfield makes them.
                </span>
              )}
            </>
          )}
          {draft.kind === 'video' && (
            <>
              <span className={styles.videoSettings}>
                <select className="select" aria-label="Length" value={video.seconds} onChange={(e) => setVideo({ seconds: Number(e.target.value) })}>
                  {RUN_VIDEO_SECONDS.map((s) => (
                    <option key={s} value={s}>
                      {SECONDS_LABEL(s)}
                    </option>
                  ))}
                </select>
                <select className="select" aria-label="Quality" value={video.quality} onChange={(e) => setVideo({ quality: e.target.value as RunVideo['quality'] })}>
                  {RUN_VIDEO_QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
                <select className="select" aria-label="Shape" value={video.aspect} onChange={(e) => setVideo({ aspect: e.target.value as RunVideo['aspect'] })}>
                  {RUN_VIDEO_ASPECTS.map((a) => (
                    <option key={a} value={a}>
                      {ASPECT_LABEL[a]}
                    </option>
                  ))}
                </select>
              </span>
              {setup.sample ? (
                <span className="muted small">The sample data prices nothing and makes no video.</span>
              ) : (
                videoPrice && <PriceLine price={videoPrice} one="a video" retry={retryVideo} creditsLeft={setup.creditsLeft} />
              )}
            </>
          )}
        </div>
      </fieldset>
      {draft.kind !== 'design' && <ReferencesField items={draft.references} setDraft={setDraft} disabled={disabled} />}
    </>
  );
}

/**
 * Up to four pictures Higgsfield keeps to (the office, a brochure, a look),
 * dropped, pasted or picked, each uploaded at once straight to Storage
 * (run-refs, the teammate's own folder), with a line on what it shows.
 * Taking one away removes it again; one a run uses stays with the run.
 */
function ReferencesField({ items, setDraft, disabled }: { items: ReferenceItem[]; setDraft: Dispatch<SetStateAction<MediaDraft>>; disabled: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  // The list as it stands, for adds that come quicker than a render.
  const current = useRef(items);
  useEffect(() => {
    current.current = items;
  }, [items]);
  const setItems = (change: (list: ReferenceItem[]) => ReferenceItem[]) => setDraft((d) => ({ ...d, references: change(d.references) }));

  function add(files: File[]) {
    setNote(null);
    const pictures = files.filter((f) => TYPES.includes(f.type));
    if (pictures.length < files.length) setNote('Only PNG, JPEG and WebP pictures can be given to Higgsfield.');
    const room = MAX_REFERENCES - current.current.length;
    if (pictures.length > room) setNote(`Up to ${MAX_REFERENCES} reference pictures a run.`);
    const added = pictures.slice(0, Math.max(0, room)).map((file) => {
      const base = { key: crypto.randomUUID(), name: file.name, preview: URL.createObjectURL(file), note: '' };
      const item: ReferenceItem = file.size > MAX_REFERENCE_BYTES ? { ...base, state: 'failed', error: 'Over 10 MB.' } : { ...base, state: 'uploading' };
      return { item, file };
    });
    if (added.length === 0) return;
    current.current = [...current.current, ...added.map((a) => a.item)];
    setItems((list) => [...list, ...added.map((a) => a.item)]);
    for (const { item, file } of added) {
      if (item.state !== 'uploading') continue;
      // The note typed meanwhile is kept: only the state moves on.
      const settle = (next: Pick<ReferenceItem, 'state'> & Record<string, unknown>) => setItems((list) => list.map((r) => (r.key === item.key ? ({ ...r, ...next } as ReferenceItem) : r)));
      uploadReference(file, () => undefined)
        .then((up) => {
          // Taken away while it went up: it goes again.
          if (!current.current.some((r) => r.key === item.key)) return up.sample ? undefined : removeReference(up.path);
          settle({ state: 'ready', path: up.path, sample: up.sample });
        })
        .catch((err: unknown) => settle({ state: 'failed', error: err instanceof UploadError ? err.message : 'It could not be uploaded. Try again.' }));
    }
  }

  function takeAway(item: ReferenceItem) {
    if (item.state === 'ready' && !item.sample) void removeReference(item.path);
    URL.revokeObjectURL(item.preview);
    current.current = current.current.filter((r) => r.key !== item.key);
    setItems((list) => list.filter((r) => r.key !== item.key));
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const files = [...e.clipboardData.files];
    if (files.length === 0) return;
    e.preventDefault();
    add(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `Pasted picture ${items.length + i + 1}.png`, { type: f.type }))));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (!disabled) add([...e.dataTransfer.files]);
  }

  const full = items.length >= MAX_REFERENCES;

  return (
    <div className={styles.question}>
      <span className="label" id={`${id}-label`}>
        Reference pictures for Higgsfield (optional)
      </span>
      <p className="muted small">
        Pictures it keeps to, such as your office, a project site, a brochure or a look. They don’t change the price. Up to {MAX_REFERENCES}; say what each shows and the Content Agent names it in
        each ad’s prompt.
      </p>
      {!full && (
        <div
          className={cx(styles.refsDrop, over && styles.refsDropOver)}
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
        >
          <ImagePlus size={18} aria-hidden />
          <span className="small">Paste one here, drop them in, or</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={disabled}>
            Choose pictures
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
      )}
      {note && <p className="muted small">{note}</p>}
      {items.length > 0 && (
        <ol className={styles.refList} aria-label="Reference pictures added">
          {items.map((item, i) => (
            <li key={item.key} className={cx(styles.refItem, item.state === 'failed' && styles.refFailed)}>
              <span className={styles.refThumb}>
                <img src={item.preview} alt={`Reference ${i + 1}: ${item.name}`} />
                <span className={styles.refNum}>{i + 1}</span>
              </span>
              <span className={styles.refBody}>
                <input
                  className="input"
                  value={item.note}
                  maxLength={MAX_REFERENCE_NOTE}
                  placeholder="What it shows, e.g. Our Miami office"
                  aria-label={`What reference ${i + 1} shows`}
                  disabled={disabled}
                  onChange={(e) => {
                    const text = e.target.value;
                    setItems((list) => list.map((r) => (r.key === item.key ? { ...r, note: text } : r)));
                  }}
                />
                {item.state === 'uploading' && (
                  <span className="muted small" aria-live="polite">
                    <LoaderCircle size={13} className="spin" aria-hidden /> Uploading
                  </span>
                )}
                {item.state === 'failed' && (
                  <span className={cx('small', styles.priceOver)} role="alert">
                    <TriangleAlert size={13} aria-hidden /> {item.error}
                  </span>
                )}
              </span>
              <button type="button" className="icon-btn icon-btn-plain" onClick={() => takeAway(item)} aria-label={`Take away reference ${i + 1}`} disabled={disabled}>
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
