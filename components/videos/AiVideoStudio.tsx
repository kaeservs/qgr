'use client';

import { ArrowRight, CircleAlert, Clapperboard, ImageIcon, LoaderCircle, RotateCcw, Settings, Sparkles, Trash2, X as Close } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { askForVideoAction, priceVideoAction, removeAiVideoAction } from '@/app/(app)/videos/actions';
import { cheapest, creditsLeft, fitToModel, formatCredits, MAX_VIDEO_PROMPT, MIN_VIDEO_PROMPT, modelOf, parseVideoRequest, PICTURE_TYPES, qualityLabel, VIDEO_MODELS } from '@/lib/ai-video';
import type { VideoRequest } from '@/lib/ai-video';
import { cx } from '@/lib/cx';
import { dayLabel } from '@/lib/schedule';
import type { AiVideo, VideoBudget } from '@/lib/types';
import { removeVideoPicture, uploadVideoPicture, UploadError } from '@/lib/video/upload';
import { LiveRefresh } from '../ui/LiveRefresh';
import { useToast } from '../ui/Toast';
import styles from './videos.module.css';

type Shape = Omit<VideoRequest, 'prompt'>;
type Picture = { name: string; preview: string; state: 'uploading' } | { name: string; preview: string; state: 'ready'; path: string };
type Price = { state: 'idle' } | { state: 'asking' } | { state: 'ready'; credits: number; balance: number | null } | { state: 'failed'; error: string };

const ASPECT_LABEL: Record<Shape['aspect'], string> = { '9:16': '9:16 Reels, Stories', '1:1': '1:1 Feed', '16:9': '16:9 Wide' };
const STATUS: Record<AiVideo['status'], string> = {
  asked: 'Waiting to be sent…',
  making: 'Higgsfield is making it…',
  ready: 'Ready',
  failed: 'Not made',
  unknown: 'Check Higgsfield',
  stand_in: 'Nothing made',
};

const shortDay = (iso: string) => dayLabel(iso.slice(0, 10));
/** What a price depends on: everything but the prompt's words and which picture. */
const priceKey = (shape: Shape) => JSON.stringify({ ...shape, picture: shape.picture !== null });

/**
 * AI video: a prompt, one of three Higgsfield models, a length, a shape, a
 * quality, sound or not, and for two models a first picture. Higgsfield's
 * price shows before Generate (asked through n8n with get_cost, which makes
 * nothing), with the credits left on the plan and this month's limit. n8n
 * sends each ask once; the library keeps what Higgsfield made, to start a run
 * from. While AI video is off in Settings, Generate goes to the stand-in,
 * which makes nothing and costs nothing.
 */
export function AiVideoStudio({ videos, budget, sample }: { videos: AiVideo[]; budget: VideoBudget; sample: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [shape, setShape] = useState<Shape>(cheapest('seedance_2_0_mini'));
  const [picture, setPicture] = useState<Picture | null>(null);
  const [quote, setQuote] = useState<{ key: string; price: Price }>({ key: '', price: { state: 'idle' } });
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const model = modelOf(shape.model);
  const left = creditsLeft(budget);
  const working = videos.some((v) => v.status === 'asked' || v.status === 'making');

  // Higgsfield's price for what is chosen now: asked a moment after the last
  // change, never for the sample data. A price is only ever shown for the
  // settings it was asked for, so a change never leaves the last one standing.
  const key = priceKey(shape);
  const price: Price = quote.key === key ? quote.price : { state: 'idle' };
  useEffect(() => {
    if (sample) return;
    const timer = setTimeout(() => {
      setQuote({ key, price: { state: 'asking' } });
      void priceVideoAction({ ...shape, prompt, picture: shape.picture }).then((answer) =>
        setQuote((q) =>
          q.key !== key ? q : { key, price: answer.ok ? { state: 'ready', credits: answer.value.credits, balance: answer.value.balance } : { state: 'failed', error: answer.error } },
        ),
      );
    }, 600);
    return () => clearTimeout(timer);
    // The prompt does not change the price: it is sent, but does not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sample, retry]);

  // The picture's preview lives in this tab only.
  const preview = useRef<string | null>(null);
  useEffect(() => () => void (preview.current && URL.revokeObjectURL(preview.current)), []);

  async function addPicture(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!(PICTURE_TYPES as readonly string[]).includes(file.type)) return setError(`${file.name} isn’t a PNG, JPEG or WebP picture.`);
    const old = picture;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = URL.createObjectURL(file);
    setPicture({ name: file.name, preview: preview.current, state: 'uploading' });
    try {
      const up = await uploadVideoPicture(file, () => undefined);
      setPicture({ name: file.name, preview: preview.current, state: 'ready', path: up.path });
      setShape((s) => ({ ...s, picture: up.path }));
      if (old?.state === 'ready') void removeVideoPicture(old.path);
    } catch (err) {
      setPicture(null);
      setShape((s) => ({ ...s, picture: null }));
      setError(err instanceof UploadError ? err.message : 'The picture could not be uploaded.');
    }
  }

  function dropPicture() {
    if (picture?.state === 'ready') void removeVideoPicture(picture.path);
    setPicture(null);
    setShape((s) => ({ ...s, picture: null }));
  }

  function pickModel(next: Shape['model']) {
    const fitted = fitToModel(shape, next);
    // A model that starts from the prompt alone lets the picture go.
    if (!modelOf(next).picture && picture) dropPicture();
    setShape({ ...fitted, picture: modelOf(next).picture ? shape.picture : null });
  }

  const priced = price.state === 'ready' ? price.credits : null;
  const overLimit = budget.live && priced !== null && priced > left;
  const canGenerate = !sample && picture?.state !== 'uploading' && (!budget.live || (priced !== null && !overLimit));

  async function generate() {
    const parsed = parseVideoRequest({ prompt, ...shape });
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setBusy('generate');
    const answer = await askForVideoAction(parsed.value);
    setBusy(null);
    if (!answer.ok) return setError(answer.error);
    toast(budget.live ? 'Asked for: Higgsfield makes it in a few minutes, and it shows below.' : 'Sent to the stand-in: nothing was made. Switch AI video on in Settings to make it for real.');
    // A picture a video was asked from stays with it; the field starts afresh.
    setPicture(null);
    preview.current = null;
    setShape((s) => ({ ...s, picture: null }));
    router.refresh();
  }

  async function remove(video: AiVideo) {
    setBusy(video.id);
    const answer = await removeAiVideoAction(video.id);
    setBusy(null);
    if (!answer.ok) return toast(answer.error, 'info');
    toast(video.status === 'asked' ? 'Stopped: nothing was sent to Higgsfield' : answer.sample ? 'Taken away, for this session' : 'Taken out of the library');
    router.refresh();
  }

  function reuse(video: AiVideo) {
    setPrompt(video.prompt);
    pickModel(video.model);
    setShape((s) => ({ ...fitToModel({ ...s, seconds: video.seconds, aspect: video.aspect, quality: video.quality, sound: video.sound }, video.model), picture: s.picture }));
    setError(null);
    promptBox.current?.focus();
    promptBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className={styles.studio}>
      <LiveRefresh active={working} />
      <section className={cx('card card-pad', styles.composer)} aria-labelledby="make-title">
        <div>
          <h2 id="make-title" className="card-title">
            Make a video
          </h2>
          <p className="muted small">Say what is seen and how it moves. No identifiable people, no flags, no words in the picture: the ad’s words go over it later, and Higgsfield is told so.</p>
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
              <button key={m.key} type="button" role="radio" aria-checked={shape.model === m.key} className={cx(styles.model, shape.model === m.key && styles.modelOn)} onClick={() => pickModel(m.key)}>
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

        <div className={styles.twoUp}>
          <fieldset className={styles.fieldset}>
            <legend className="label">Quality</legend>
            <div className={styles.segmented} role="radiogroup" aria-label="Quality">
              {model.qualities.map((q) => (
                <button key={q.key} type="button" role="radio" aria-checked={shape.quality === q.key} className={cx(styles.segment, shape.quality === q.key && styles.segmentOn)} onClick={() => setShape((x) => ({ ...x, quality: q.key }))}>
                  {q.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend className="label">Sound</legend>
            <label className={styles.check}>
              <input type="checkbox" checked={shape.sound} onChange={(e) => setShape((x) => ({ ...x, sound: e.target.checked }))} />
              <span>Make sound with it</span>
            </label>
            <span className="muted small">Off costs fewer credits: an ad gets its music in the editor.</span>
          </fieldset>
        </div>

        {model.picture && (
          <fieldset className={styles.fieldset}>
            <legend className="label">First picture (optional)</legend>
            <p className="muted small">{model.name} can start from a picture of yours: it becomes the first frame. PNG, JPEG or WebP, 10 MB at most.</p>
            <input
              ref={picker}
              type="file"
              accept={PICTURE_TYPES.join(',')}
              hidden
              onChange={(e) => {
                void addPicture(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <div className={styles.refs}>
              {picture ? (
                <figure className={styles.ref}>
                  <img src={picture.preview} alt="" />
                  <figcaption>
                    {picture.state === 'uploading' ? <LoaderCircle size={13} className="spin" aria-hidden /> : <ImageIcon size={13} aria-hidden />}
                    <span>{picture.state === 'uploading' ? 'Uploading…' : picture.name}</span>
                  </figcaption>
                  <button type="button" className={styles.refRemove} aria-label={`Remove ${picture.name}`} onClick={dropPicture} disabled={picture.state === 'uploading'}>
                    <Close size={14} aria-hidden />
                  </button>
                </figure>
              ) : (
                <button type="button" className={styles.refAdd} onClick={() => picker.current?.click()}>
                  <ImageIcon size={18} aria-hidden />
                  <span>Add a picture</span>
                </button>
              )}
            </div>
          </fieldset>
        )}

        <div className={styles.go}>
          <PriceLine
            price={price}
            budget={budget}
            left={left}
            sample={sample}
            onRetry={() => {
              setQuote({ key, price: { state: 'asking' } });
              setRetry((n) => n + 1);
            }}
          />
          {overLimit && (
            <p className="error-text" role="alert">
              This takes more than the {formatCredits(left)} left of this month’s limit. Pick a cheaper setting, or raise the limit in Settings.
            </p>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={!canGenerate || busy !== null || prompt.trim().length < MIN_VIDEO_PROMPT} aria-busy={busy === 'generate'}>
            <Sparkles size={17} aria-hidden />
            {sample ? 'Generate' : budget.live ? (priced !== null ? `Generate · ${formatCredits(priced)}` : 'Generate') : 'Generate (stand-in)'}
          </button>
          {prompt.trim().length < MIN_VIDEO_PROMPT && <p className="muted small">Write the prompt first: {MIN_VIDEO_PROMPT} characters at least.</p>}
        </div>
      </section>

      <aside className={cx('card card-pad', styles.side)} aria-labelledby="higgsfield-title">
        <div className={styles.sideHead}>
          <h2 id="higgsfield-title" className="card-title">
            Higgsfield
          </h2>
          <span className={cx('pill pill-sm', budget.live ? 'pill-gold' : 'pill-quiet')}>{sample ? 'Sample data' : budget.live ? 'On' : 'Stand-in'}</span>
        </div>
        <p className="muted small">
          {sample
            ? 'The sample data has no Higgsfield: nothing is priced or made here.'
            : budget.live
              ? 'Videos are made by Higgsfield on the team’s own plan, through n8n: each one spends the credits its price says.'
              : 'AI video is off: Generate goes to the stand-in, which makes nothing and costs nothing. Prices still show, so the team can see what each would cost.'}
        </p>
        <dl className={styles.facts}>
          <div>
            <dt>This month</dt>
            <dd>
              {formatCredits(budget.spent)} of {formatCredits(budget.cap)} used
            </dd>
          </div>
          <div>
            <dt>Costs credits</dt>
            <dd>Every video: only a person’s Generate makes one, never a run, and each is sent once</dd>
          </div>
        </dl>
        <Link href="/settings#ai-video" className="btn btn-quiet btn-sm">
          <Settings size={15} aria-hidden />
          {budget.live ? 'The monthly limit' : 'Switch it on in Settings'}
        </Link>
      </aside>

      <section className={styles.library} aria-labelledby="library-title">
        <h2 id="library-title" className="card-title">
          Library
        </h2>
        {videos.length === 0 ? (
          <p className={cx('card card-pad muted', styles.empty)}>
            <Clapperboard size={20} aria-hidden />
            No videos yet. What Higgsfield makes is kept here, to start a run from.
          </p>
        ) : (
          <div className={styles.grid}>
            {videos.map((v) => (
              <article key={v.id} className={cx('card', styles.item)} aria-labelledby={`video-${v.id}`}>
                <div className={cx(styles.frame, v.status !== 'ready' && styles.frameEmpty)} data-aspect={v.aspect}>
                  {v.status === 'ready' && v.url ? (
                    <video src={v.url} controls muted playsInline preload="metadata" aria-label={v.title} />
                  ) : v.status === 'asked' || v.status === 'making' ? (
                    <>
                      <LoaderCircle size={24} className="spin" aria-hidden />
                      <span>{STATUS[v.status]}</span>
                    </>
                  ) : (
                    <>
                      {v.status === 'unknown' ? <CircleAlert size={24} aria-hidden /> : <Clapperboard size={24} aria-hidden />}
                      <span>{STATUS[v.status]}</span>
                    </>
                  )}
                </div>
                <div className={styles.itemBody}>
                  <div className={styles.itemHead}>
                    <h3 id={`video-${v.id}`} className={styles.itemTitle}>
                      {v.title}
                    </h3>
                    {v.sample && <span className="pill pill-quiet pill-sm">Sample video</span>}
                  </div>
                  <p className={styles.itemPrompt}>{v.prompt}</p>
                  <p className="muted small">
                    {modelOf(v.model).name} · {v.seconds} s · {v.aspect} · {qualityLabel(v.model, v.quality)}
                    {v.sound ? ' · sound' : ''}
                    {v.picture ? ' · from a picture' : ''}
                    {v.credits > 0 ? ` · ${formatCredits(v.credits)}` : ''} · {shortDay(v.createdAt)}
                  </p>
                  {v.sample && <p className="muted small">The sample clip, standing in for a video Higgsfield made: no model made it.</p>}
                  {v.error && (
                    <p className={cx('small', v.status === 'unknown' ? 'error-text' : 'muted')} role={v.status === 'unknown' ? 'note' : undefined}>
                      {v.error}
                    </p>
                  )}
                  {v.status === 'making' && <p className="muted small">Usually one to three minutes. The page shows it as soon as it is stored.</p>}
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
                    {!v.sample && v.status !== 'making' && (
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => void remove(v)} disabled={busy !== null} aria-busy={busy === v.id}>
                        <Trash2 size={15} aria-hidden />
                        {v.status === 'asked' ? 'Stop' : 'Remove'}
                      </button>
                    )}
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

/** Higgsfield's price, the plan's credits left and this month's limit, said in one place. */
function PriceLine({ price, budget, left, sample, onRetry }: { price: Price; budget: VideoBudget; left: number; sample: boolean; onRetry: () => void }) {
  if (sample) return <p className="muted small">Higgsfield’s price shows here once the dashboard is connected: the sample data asks nothing.</p>;
  if (price.state === 'idle' || price.state === 'asking') {
    return (
      <p className={cx('muted small', styles.priceLine)} role="status">
        <LoaderCircle size={14} className="spin" aria-hidden />
        Asking Higgsfield’s price…
      </p>
    );
  }
  if (price.state === 'failed') {
    return (
      <p className={cx('small', styles.priceLine)} role="status">
        <span className="muted">No price yet: {price.error}</span>{' '}
        <button type="button" className="link small" onClick={onRetry}>
          Ask again
        </button>
      </p>
    );
  }
  return (
    <p className={cx('small', styles.priceLine)} role="status">
      <strong>{formatCredits(price.credits)}</strong>
      <span className="muted">
        {price.balance !== null ? ` · ${formatCredits(price.balance)} left on the Higgsfield plan` : ''}
        {budget.live ? ` · ${formatCredits(left)} left of this month’s ${formatCredits(budget.cap)}` : ' · nothing is spent while AI video is off'}
      </span>
    </p>
  );
}
