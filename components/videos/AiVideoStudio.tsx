'use client';

import { ArrowRight, Clapperboard, Film, ImageIcon, RotateCcw, Sparkles, Trash2, X as Close } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fitToModel, MAX_VIDEO_PROMPT, modelOf, parseVideoRequest, VIDEO_MODELS } from '@/lib/ai-video';
import type { VideoAspect, VideoModelKey, VideoReference } from '@/lib/ai-video';
import { cx } from '@/lib/cx';
import { dayLabel } from '@/lib/schedule';
import type { AiVideo } from '@/lib/types';
import styles from './videos.module.css';

/** A reference picked from this computer: shown here, sent nowhere while Higgsfield is not connected. */
interface Picked extends VideoReference {
  id: string;
  url: string;
}

/** A video asked for on this page while Higgsfield is not connected: nothing made it. */
interface Asked {
  id: string;
  prompt: string;
  model: VideoModelKey;
  seconds: number;
  aspect: VideoAspect;
  references: { kind: 'image' | 'clip'; name: string }[];
}

const ASPECT_LABEL: Record<VideoAspect, string> = { '9:16': '9:16 Reels, Stories', '1:1': '1:1 Feed', '16:9': '16:9 Wide' };

/** A clip's length, read from the file in the browser. */
function clipSeconds(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 0);
    video.onerror = () => resolve(0);
    video.src = url;
  });
}

const shortDay = (iso: string) => dayLabel(iso.slice(0, 10));

/**
 * AI video: a prompt, a model, a length, a shape and references make a
 * video, kept here to start a run from. A preview until Higgsfield is
 * connected: Generate checks the request as the server will, then says that
 * nothing was made, as the picture stand-in does.
 */
export function AiVideoStudio({ videos }: { videos: AiVideo[] }) {
  const [prompt, setPrompt] = useState('');
  const [shape, setShape] = useState<{ model: VideoModelKey; seconds: number; aspect: VideoAspect }>({ model: 'seedance', seconds: 10, aspect: '9:16' });
  const [refs, setRefs] = useState<Picked[]>([]);
  const [asked, setAsked] = useState<Asked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const model = modelOf(shape.model);

  // The pictures and clips shown here are this page's alone: let them go with it.
  const live = useRef(refs);
  live.current = refs;
  useEffect(() => () => live.current.forEach((r) => URL.revokeObjectURL(r.url)), []);

  async function addReferences(list: FileList | null) {
    if (!list) return;
    setError(null);
    const added: Picked[] = [];
    for (const file of [...list]) {
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'clip' : null;
      if (!kind) {
        setError(`${file.name} isn’t a picture or a video.`);
        continue;
      }
      const url = URL.createObjectURL(file);
      const seconds = kind === 'clip' ? await clipSeconds(url) : undefined;
      added.push({ id: crypto.randomUUID(), kind, name: file.name, size: file.size, url, ...(seconds !== undefined ? { seconds } : {}) });
    }
    setRefs((r) => [...r, ...added]);
  }

  function removeReference(id: string) {
    setRefs((list) => {
      const gone = list.find((r) => r.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return list.filter((r) => r.id !== id);
    });
  }

  function generate() {
    setNotice(null);
    const parsed = parseVideoRequest({ prompt, ...shape, references: refs.map(({ kind, name, size, seconds }) => ({ kind, name, size, seconds })) });
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    const { prompt: text, model: key, seconds, aspect, references } = parsed.value;
    setAsked((list) => [{ id: crypto.randomUUID(), prompt: text, model: key, seconds, aspect, references: references.map(({ kind, name }) => ({ kind, name })) }, ...list]);
    setNotice('Nothing was made: Higgsfield isn’t connected yet. Once it is, the video appears in the library below in a few minutes, and nothing is spent until someone presses Generate.');
  }

  function reuse(item: { prompt: string; model: VideoModelKey; seconds: number; aspect: VideoAspect }) {
    setPrompt(item.prompt);
    setShape(fitToModel(item, item.model));
    setError(null);
    promptBox.current?.focus();
    promptBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className={styles.studio}>
      <section className={cx('card card-pad', styles.composer)} aria-labelledby="make-title">
        <div>
          <h2 id="make-title" className="card-title">
            Make a video
          </h2>
          <p className="muted small">Say what is seen and how it moves. No identifiable people, no flags, no words in the picture: the ad’s words go over it later.</p>
        </div>

        <label className="field">
          <span className="label">Prompt</span>
          <textarea
            ref={promptBox}
            className={cx('textarea', styles.prompt)}
            value={prompt}
            maxLength={MAX_VIDEO_PROMPT}
            rows={4}
            placeholder="E.g. Slow drone shot over a quiet American suburb at golden hour, warm light, indigo and gold tones, space at the top for a headline."
            onChange={(e) => setPrompt(e.target.value)}
          />
          <span className={cx('muted small', styles.count)}>
            {prompt.length.toLocaleString('en-US')} / {MAX_VIDEO_PROMPT.toLocaleString('en-US')}
          </span>
        </label>

        <fieldset className={styles.fieldset}>
          <legend className="label">Model</legend>
          <div className={styles.models} role="radiogroup" aria-label="Model">
            {VIDEO_MODELS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={shape.model === m.key}
                className={cx(styles.model, shape.model === m.key && styles.modelOn)}
                onClick={() => setShape((s) => fitToModel(s, m.key))}
              >
                <strong>{m.name}</strong>
                <span className="muted small">{m.job}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles.twoUp}>
          <fieldset className={styles.fieldset}>
            <legend className="label">Length</legend>
            <div className={styles.segmented} role="radiogroup" aria-label="Length">
              {model.seconds.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={shape.seconds === s} className={cx(styles.segment, shape.seconds === s && styles.segmentOn)} onClick={() => setShape((x) => ({ ...x, seconds: s }))}>
                  {s} s
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend className="label">Shape</legend>
            <div className={styles.segmented} role="radiogroup" aria-label="Shape">
              {model.aspects.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={shape.aspect === a} className={cx(styles.segment, shape.aspect === a && styles.segmentOn)} onClick={() => setShape((x) => ({ ...x, aspect: a }))} title={ASPECT_LABEL[a]}>
                  {a}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset className={styles.fieldset}>
          <legend className="label">References</legend>
          <p className="muted small">
            {model.images.min > 0
              ? `${model.name} starts from one picture: it becomes the first frame.`
              : `${model.name} can follow ${model.images.max === 1 ? 'a picture' : `up to ${model.images.max} pictures`}${model.clips ? ` and one short clip (15 seconds at most) for the movement` : ''}. Optional.`}
          </p>
          <input
            ref={picker}
            type="file"
            accept={model.clips ? 'image/*,video/*' : 'image/*'}
            multiple
            hidden
            onChange={(e) => {
              void addReferences(e.target.files);
              e.target.value = '';
            }}
          />
          <div className={styles.refs}>
            {refs.map((r) => (
              <figure key={r.id} className={styles.ref}>
                {r.kind === 'image' ? <img src={r.url} alt="" /> : <video src={r.url} muted playsInline preload="metadata" />}
                <figcaption>
                  {r.kind === 'image' ? <ImageIcon size={13} aria-hidden /> : <Film size={13} aria-hidden />}
                  <span>{r.name}</span>
                </figcaption>
                <button type="button" className={styles.refRemove} aria-label={`Remove ${r.name}`} onClick={() => removeReference(r.id)}>
                  <Close size={14} aria-hidden />
                </button>
              </figure>
            ))}
            <button type="button" className={styles.refAdd} onClick={() => picker.current?.click()}>
              <ImageIcon size={18} aria-hidden />
              <span>{model.clips ? 'Add a picture or clip' : 'Add a picture'}</span>
            </button>
          </div>
        </fieldset>

        <div className={styles.go}>
          <p className="muted small">Higgsfield’s price for this request shows here once it is connected.</p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          <button type="button" className="btn btn-primary" onClick={generate}>
            <Sparkles size={17} aria-hidden />
            Generate
          </button>
        </div>
      </section>

      <aside className={cx('card card-pad', styles.side)} aria-labelledby="higgsfield-title">
        <div className={styles.sideHead}>
          <h2 id="higgsfield-title" className="card-title">
            Higgsfield
          </h2>
          <span className="pill pill-quiet pill-sm">Not connected</span>
        </div>
        <p className="muted small">Videos are made by Higgsfield, from n8n, with its key kept there. Until then Generate makes nothing and says so.</p>
        <dl className={styles.facts}>
          <div>
            <dt>Models</dt>
            <dd>{VIDEO_MODELS.map((m) => m.name).join(', ')}</dd>
          </div>
          <div>
            <dt>Monthly limit</dt>
            <dd>Set once connected, so nobody runs up a bill</dd>
          </div>
          <div>
            <dt>Costs money</dt>
            <dd>Every video, unlike pictures: only a person’s Generate makes one, never a run</dd>
          </div>
        </dl>
        <p className="muted small">Then: a finished video starts a run as if it were uploaded. The agents write the strategy and three ads over it, and the studio cuts, captions and exports it.</p>
      </aside>

      <section className={styles.library} aria-labelledby="library-title">
        <h2 id="library-title" className="card-title">
          Library
        </h2>
        {videos.length === 0 && asked.length === 0 ? (
          <p className={cx('card card-pad muted', styles.empty)}>
            <Clapperboard size={20} aria-hidden />
            No videos yet. What Higgsfield makes is kept here, to start a run from.
          </p>
        ) : (
          <div className={styles.grid}>
            {asked.map((a) => (
              <article key={a.id} className={cx('card', styles.item)}>
                <div className={cx(styles.frame, styles.frameEmpty)} data-aspect={a.aspect}>
                  <Clapperboard size={26} aria-hidden />
                  <span>Not made: Higgsfield isn’t connected yet</span>
                </div>
                <div className={styles.itemBody}>
                  <p className={styles.itemPrompt}>{a.prompt}</p>
                  <p className="muted small">
                    {modelOf(a.model).name} · {a.seconds} s · {a.aspect}
                    {a.references.length > 0 ? ` · follows ${a.references.map((r) => r.name).join(', ')}` : ''}
                  </p>
                  <div className={styles.itemActions}>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => reuse(a)}>
                      <RotateCcw size={15} aria-hidden />
                      Use the prompt again
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAsked((list) => list.filter((x) => x.id !== a.id))}>
                      <Trash2 size={15} aria-hidden />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {videos.map((v) => (
              <article key={v.id} className={cx('card', styles.item)}>
                <div className={styles.frame} data-aspect={v.aspect}>
                  {v.status === 'ready' && v.url ? (
                    // The sample stands in for a Higgsfield video; it says so below.
                    <video src={v.url} controls muted playsInline preload="metadata" aria-label={v.title} />
                  ) : (
                    <span>{v.status === 'making' ? 'Being made…' : (v.error ?? 'Not made')}</span>
                  )}
                </div>
                <div className={styles.itemBody}>
                  <div className={styles.itemHead}>
                    <h3 className={styles.itemTitle}>{v.title}</h3>
                    {v.sample && <span className="pill pill-quiet pill-sm">Sample video</span>}
                  </div>
                  <p className={styles.itemPrompt}>{v.prompt}</p>
                  <p className="muted small">
                    {modelOf(v.model).name} · {v.seconds} s · {v.aspect} · {shortDay(v.createdAt)}
                    {v.references.length > 0 ? ` · follows ${v.references.map((r) => r.name).join(', ')}` : ''}
                  </p>
                  {v.sample && <p className="muted small">The sample clip, standing in for a video Higgsfield made: no model made it.</p>}
                  <div className={styles.itemActions}>
                    {v.status === 'ready' && (
                      <Link href={`/runs/new?type=custom&video=${encodeURIComponent(v.id)}`} className="btn btn-primary btn-sm">
                        Start a run from it
                        <ArrowRight size={15} aria-hidden />
                      </Link>
                    )}
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => reuse(v)}>
                      <RotateCcw size={15} aria-hidden />
                      Use the prompt again
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
