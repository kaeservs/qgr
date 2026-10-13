'use client';

import { Check, ImageOff, ImagePlus, LoaderCircle, RefreshCw, Square, TriangleAlert, X as Close } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { askForPictureAction, removePictureAction, stopPictureAction, usePictureAction } from '@/app/(app)/content/actions';
import { cx } from '@/lib/cx';
import { LIMITS } from '@/lib/edit-input';
import type { PictureChoice, PictureModel, Variant } from '@/lib/types';
import { useToast } from '../ui/Toast';
import video from '../video/video.module.css';
import { Creative } from './Creative';
import styles from './content.module.css';

/** An ask for a picture that has waited this long was lost: the database lets it be asked again. */
export const PICTURE_RETRY_MS = 10 * 60_000;

/** What a person did to a variant's picture, for the studio to show before the page reads it again. */
export type PictureChange =
  | { kind: 'asked'; prompt: string }
  | { kind: 'used'; choice: PictureChoice }
  | { kind: 'stopped' }
  | { kind: 'design' };

/**
 * A variant's picture: what it shows, the prompt to make another from, and
 * every picture made for it, to choose again. The prompt is the scene; the
 * brand's picture style and the rules (no words, real people or flags) are
 * added when the image model is asked, so every picture keeps to brand
 * memory. A new picture, or another one chosen, needs approving again.
 */
export function PictureDialog({
  variant,
  pictureStyle,
  model,
  sample,
  waitingToPost,
  onChange,
  onClose,
}: {
  variant: Variant;
  /** The brand's picture style, from brand memory: added to every prompt. */
  pictureStyle: string;
  model: PictureModel;
  /** Sample data: there is no image model to ask, and nothing is kept. */
  sample: boolean;
  /** Waiting to post: its picture, like its words, cannot change. */
  waitingToPost: boolean;
  onChange: (change: PictureChange) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState(variant.picturePrompt ?? '');
  // 'asking', 'stopping', 'design', or the id of the picture being shown.
  const [busy, setBusy] = useState<string | null>(null);
  const making = variant.picture?.status === 'making';
  const stale = making && !!variant.picture?.askedAt && Date.now() - Date.parse(variant.picture.askedAt) > PICTURE_RETRY_MS;
  const pictures = variant.pictures ?? [];
  const tooLong = prompt.trim().length > LIMITS.picturePrompt;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function run(what: string, send: () => Promise<{ ok: true } | { ok: false; error: string }>, change: PictureChange, done: string) {
    setBusy(what);
    const result = await send();
    setBusy(null);
    if (!result.ok) return toast(result.error, 'info');
    onChange(change);
    toast(done);
  }

  const ask = () =>
    run('asking', () => askForPictureAction(variant.id, prompt), { kind: 'asked', prompt: prompt.trim() }, `Making a picture for variant ${variant.label}`);
  const stop = () => run('stopping', () => stopPictureAction(variant.id), { kind: 'stopped' }, 'Stopped. A picture that still arrives joins the others below');
  const design = () =>
    run('design', () => removePictureAction(variant.id), { kind: 'design' }, sample ? 'Back to the design, for this session' : `Variant ${variant.label} is back to the drawn design`);
  const use = (choice: PictureChoice) =>
    run(choice.id, () => usePictureAction(variant.id, choice.id), { kind: 'used', choice }, sample ? 'Shown, for this session' : `Variant ${variant.label} shows that picture: approve it again before it is posted`);

  const locked = waitingToPost || busy !== null;
  return (
    <dialog
      ref={dialog}
      className={cx(video.dialog, styles.pictureDialog)}
      aria-labelledby="picture-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className={video.dialogHead}>
        <div>
          <h2 id="picture-title">Picture for variant {variant.label}</h2>
          <p className="muted small">{variant.angle}</p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={onClose}>
          <Close size={18} aria-hidden />
        </button>
      </header>

      <div className={video.dialogBody}>
        <div className={styles.pictureLayout}>
          <figure className={styles.pictureNow}>
            <Creative text={variant.creative.text} style={variant.creative.style} image={variant.imageUrl} ratio="square" />
            <figcaption className="muted small">{variant.imageUrl ? 'The ad now, with its picture' : 'The ad now: the drawn design, no picture'}</figcaption>
          </figure>

          <div className={styles.pictureForm}>
            <label className="field">
              <span className="label">What to draw</span>
              <textarea
                className="input"
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="The scene only, for example: a family’s front porch at golden hour, warm light, a deep indigo evening sky."
                aria-describedby="picture-prompt-help"
                disabled={waitingToPost}
              />
              <span id="picture-prompt-help" className={cx('small', tooLong ? 'error-text' : 'muted')}>
                {prompt.trim().length.toLocaleString('en-US')} / {LIMITS.picturePrompt.toLocaleString('en-US')} characters
                {variant.picturePrompt && prompt !== variant.picturePrompt && (
                  <>
                    {' · '}
                    <button type="button" className="link small" onClick={() => setPrompt(variant.picturePrompt ?? '')}>
                      Back to the prompt it has
                    </button>
                  </>
                )}
              </span>
            </label>

            <div className={cx('muted small', styles.pictureAdds)}>
              <p>Every picture also keeps to:</p>
              <ul>
                <li>
                  {pictureStyle ? (
                    <>
                      your picture style from{' '}
                      <Link href="/brand" className="link">
                        Brand memory
                      </Link>
                      : “{pictureStyle}”
                    </>
                  ) : (
                    <>
                      your picture style, once you add one in{' '}
                      <Link href="/brand" className="link">
                        Brand memory
                      </Link>
                    </>
                  )}
                </li>
                <li>no words, real people or flags: the ad’s words go over the picture</li>
              </ul>
            </div>

            {making && !stale ? (
              <p className={styles.pictureMaking} role="status">
                <LoaderCircle size={16} className="spin" aria-hidden />
                <span>Making a picture… It shows here when it is ready, usually within a minute.</span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => void stop()} disabled={busy !== null} aria-busy={busy === 'stopping'}>
                  <Square size={13} aria-hidden />
                  Stop
                </button>
              </p>
            ) : variant.picture?.status === 'failed' ? (
              <div className={styles.flags} role="note">
                <TriangleAlert size={15} aria-hidden />
                <p>The last picture could not be made: {variant.picture.note ?? 'the image model did not answer.'}</p>
              </div>
            ) : (
              variant.picture?.note && <p className={cx('muted small', styles.pictureNote)}>{variant.picture.note}</p>
            )}

            {model === 'stand-in' && (
              <p className={cx('small', styles.pictureModel)}>
                {sample ? (
                  'Sample data has no image model to ask.'
                ) : (
                  <>
                    Pictures are set to the stand-in, which makes none.{' '}
                    <Link href="/settings" className="link">
                      Choose Cloudflare Workers AI in Settings
                    </Link>{' '}
                    for free pictures, about 170 a day.
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {pictures.length > 0 && (
          <section className={styles.pictureHistory} aria-labelledby="picture-history-title">
            <h3 id="picture-history-title" className={styles.pictureHistoryTitle}>
              Made for this variant <span className="muted">({pictures.length} of 8 kept)</span>
            </h3>
            <ul className={styles.pictureGrid}>
              {pictures.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cx(styles.pictureChoice, p.shown && styles.pictureChoiceShown)}
                    onClick={() => void use(p)}
                    disabled={locked || (p.shown && !making) || !p.url}
                    aria-busy={busy === p.id}
                    aria-pressed={p.shown}
                    aria-label={p.shown ? `Picture ${pictures.length - i}, shown in the ad` : `Show picture ${pictures.length - i}`}
                    title={p.prompt ?? undefined}
                  >
                    {p.url ? <img src={p.url} alt="" /> : <span className={styles.pictureMissing}>Not available</span>}
                    {p.shown && (
                      <span className={cx('pill pill-sm', styles.pictureShownPill)}>
                        <Check size={12} aria-hidden />
                        Shown
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <p className="muted small">Pick one to show it in the ad. Hover to see what it was drawn from. Past eight, the oldest not shown makes room.</p>
          </section>
        )}
      </div>

      <footer className={video.dialogFoot}>
        <p className={video.footNote}>
          {waitingToPost ? 'Waiting to post: cancel the post on Posts to change its picture.' : 'A new picture, or another one shown, needs approving again before it is posted.'}
        </p>
        {(variant.imageUrl || making) && (
          <button type="button" className="btn btn-quiet" onClick={() => void design()} disabled={locked} aria-busy={busy === 'design'}>
            <ImageOff size={16} aria-hidden />
            Use the design
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => void ask()} disabled={locked || (making && !stale) || !prompt.trim() || tooLong} aria-busy={busy === 'asking'}>
          {variant.imageUrl || stale ? <RefreshCw size={16} aria-hidden /> : <ImagePlus size={16} aria-hidden />}
          {stale ? 'Ask again' : variant.imageUrl ? 'Make another picture' : 'Make a picture'}
        </button>
      </footer>
    </dialog>
  );
}
