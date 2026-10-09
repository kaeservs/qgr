'use client';

import { CalendarClock, Clapperboard, LoaderCircle, Send, X as Close } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { schedulePostAction } from '@/app/(app)/posts/actions';
import { drawCreative, PICTURE_SIZE } from '@/lib/creative/draw';
import type { CreativePicture, CreativeRatio } from '@/lib/creative/draw';
import type { NewPostTarget } from '@/lib/data/source';
import { MAX_THUMBNAIL, PLACE_LABEL } from '@/lib/post-input';
import { formatInZone, localTime, wallTime, zonedToUtc, zoneLabel } from '@/lib/schedule';
import { PLACES } from '@/lib/types';
import type { Clip, Place, PostPages, Variant } from '@/lib/types';
import { loadFrameFonts, loadMark } from '@/lib/video/draw';
import { ASPECT_INFO, defaultEdit, editedSeconds, frameSize, length } from '@/lib/video/edit';
import { RenderError } from '@/lib/video/errors';
import { removePostFile, UploadError, uploadPostFile } from '@/lib/video/upload';
import { PlaceIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import { downloadClip, makeVariantVideo } from '../video/makeVideo';
import video from '../video/video.module.css';
import styles from './posts.module.css';

/** Meta's feed shows a square; LinkedIn's a 1.91:1 picture, as the studio previews them. */
const RATIO: Record<Place, CreativeRatio> = { facebook: 'square', instagram: 'square', linkedin: 'wide' };
const PLATFORM_OF: Record<Place, 'meta' | 'linkedin'> = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin' };
const INSTAGRAM_TEXT = 2200;
const AHEAD_DAYS = 90;

interface Picture {
  blob: Blob;
  url: string;
  canvas: HTMLCanvasElement;
}

/** A small JPEG of a frame for the Posts list, kept under what the database holds. */
function thumbnailOf(source: HTMLCanvasElement): string | null {
  const scale = Math.min(1, 320 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.72, 0.5, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.startsWith('data:image/jpeg') && url.length <= MAX_THUMBNAIL) return url;
  }
  return null;
}

/**
 * The image model's picture, read so the canvas may be saved: it comes from
 * Storage through a signed link, which allows any origin.
 */
async function loadPicture(url: string): Promise<CreativePicture> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new RenderError('The ad’s picture could not be read. Reload the page to try again.');
  }
  return { image, width: image.naturalWidth, height: image.naturalHeight };
}

async function drawPicture(ratio: CreativeRatio, variant: Variant, brandName: string, mark: CanvasImageSource | null, picture: CreativePicture | null): Promise<Picture> {
  const size = PICTURE_SIZE[ratio];
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new RenderError('This browser can’t draw the picture.');
  drawCreative(ctx, size, { text: variant.creative.text, style: variant.creative.style, ratio }, { name: brandName, mark }, picture);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new RenderError('This browser can’t make the picture.');
  return { blob, url: URL.createObjectURL(blob), canvas };
}

/** The first whole hour at least an hour away, as the team's wall time. */
function suggestedTime(timeZone: string): { date: string; time: string } {
  const at = new Date(Date.now() + 90 * 60_000);
  at.setUTCMinutes(0, 0, 0);
  return wallTime(at.toISOString(), timeZone);
}

/**
 * Sends an approved variant to Facebook, Instagram and LinkedIn, now or at a
 * time in the team's zone. The file that goes out is made here from the
 * variant (its picture, or its video as edited) and shown before it goes:
 * what was approved is what is posted. The publisher in n8n does the posting.
 */
export function PublishDialog({
  variant,
  adSetTitle,
  clip,
  brand,
  timeZone,
  pages,
  onClose,
  onPosted,
}: {
  variant: Variant;
  adSetTitle: string;
  /** The run's clip and a link to it, when every variant is a video made from it. */
  clip: { clip: Clip; url: string | null } | null;
  brand: { name: string; website: string };
  timeZone: string;
  pages: PostPages;
  onClose: () => void;
  onPosted: () => void;
}) {
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const running = useRef<AbortController | null>(null);
  const uploaded = useRef<string[]>([]);
  const available = (place: Place) => !!variant.copy[PLATFORM_OF[place]] && !(place === 'instagram' && (variant.copy.meta?.text.length ?? 0) > INSTAGRAM_TEXT);
  const [chosen, setChosen] = useState<Set<Place>>(() => new Set(PLACES.filter(available)));
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [date, setDate] = useState(() => suggestedTime(timeZone).date);
  const [time, setTime] = useState(() => suggestedTime(timeZone).time);
  const [pictures, setPictures] = useState<Partial<Record<CreativeRatio, Picture>>>({});
  const [step, setStep] = useState<{ label: string; progress: number | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const edit = clip ? (variant.videoEdit ?? defaultEdit(clip.clip.duration)) : null;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  // The pictures, drawn once: the files that go out, shown before they do.
  useEffect(() => {
    if (clip) return;
    let live = true;
    const made: Picture[] = [];
    void (async () => {
      const [mark, under] = await Promise.all([loadMark(), variant.imageUrl ? loadPicture(variant.imageUrl).catch((err: unknown) => err as RenderError) : null, loadFrameFonts()]);
      if (under instanceof RenderError) {
        if (live) setProblem(under.message);
        return;
      }
      for (const ratio of ['square', 'wide'] as const) {
        const picture = await drawPicture(ratio, variant, brand.name, mark, under).catch(() => null);
        if (!picture) continue;
        made.push(picture);
        if (live) setPictures((p) => ({ ...p, [ratio]: picture }));
      }
    })();
    return () => {
      live = false;
      for (const p of made) URL.revokeObjectURL(p.url);
    };
  }, [clip, variant, brand.name]);

  // Leaving takes away any file uploaded for a post that was never made.
  useEffect(
    () => () => {
      running.current?.abort();
      for (const path of uploaded.current) void removePostFile(path);
    },
    [],
  );

  const places = PLACES.filter((p) => chosen.has(p));
  const today = wallTime(new Date().toISOString(), timeZone).date;
  const lastDay = wallTime(new Date(Date.now() + AHEAD_DAYS * 86_400_000).toISOString(), timeZone).date;
  const local = when === 'later' ? localTime(date, time) : null;
  const scheduledAt = local ? zonedToUtc(local, timeZone) : null;
  const working = step !== null;

  function toggle(place: Place, on: boolean) {
    setChosen((set) => {
      const next = new Set(set);
      if (on) next.add(place);
      else next.delete(place);
      return next;
    });
  }

  function close() {
    running.current?.abort();
    onClose();
  }

  async function upload(blob: Blob, label: string, signal: AbortSignal): Promise<string> {
    setStep({ label, progress: 0 });
    const up = await uploadPostFile(blob, (share) => setStep({ label, progress: share }), signal);
    if (!up.sample) uploaded.current.push(up.path);
    return up.path;
  }

  async function post() {
    if (places.length === 0) return setProblem('Pick where to post.');
    if (when === 'later') {
      if (!local || !scheduledAt) return setProblem('Pick a date and a time.');
      if (Date.parse(scheduledAt) < Date.now() - 60_000) return setProblem('Pick a time that has not passed.');
    }
    setProblem(null);
    const controller = new AbortController();
    running.current = controller;
    const { signal } = controller;
    try {
      const targets: NewPostTarget[] = [];
      let thumbnail: string | null = null;
      if (clip && edit) {
        if (!clip.url) throw new RenderError('The clip can’t be read right now. Reload the page to try again.');
        setStep({ label: 'Downloading the clip…', progress: null });
        const file = await downloadClip(clip.url, signal);
        const label = 'Making the video…';
        setStep({ label, progress: 0 });
        const made = await makeVariantVideo({
          clip: file,
          edit,
          words: variant.creative.text,
          brand,
          size: frameSize(edit, clip.clip),
          requireMp4: true,
          signal,
          onProgress: (share) => setStep({ label, progress: share }),
          onFrame: (canvas, at) => {
            if (thumbnail === null && at >= edit.cover) thumbnail = thumbnailOf(canvas);
          },
        });
        const path = await upload(made.blob, 'Uploading the video…', signal);
        for (const place of places) targets.push({ place, media: { path, kind: 'video' } });
      } else {
        const paths: Partial<Record<CreativeRatio, string>> = {};
        for (const place of places) {
          const ratio = RATIO[place];
          const picture = pictures[ratio];
          if (!picture) throw new RenderError('The picture is still being made. Try again in a moment.');
          const path = paths[ratio] ?? (await upload(picture.blob, 'Uploading the picture…', signal));
          paths[ratio] = path;
          targets.push({ place, media: { path, kind: 'image' } });
        }
        const first = pictures[RATIO[places[0] ?? 'facebook']];
        thumbnail = first ? thumbnailOf(first.canvas) : null;
      }

      setStep({ label: when === 'now' ? 'Sending…' : 'Scheduling…', progress: null });
      const result = await schedulePostAction({ variantId: variant.id, targets, at: local, thumbnail });
      if (!result.ok) throw new UploadError(result.error);
      // The post holds its files now: they are no longer this dialog's to remove.
      uploaded.current = [];
      const where = places.map((p) => PLACE_LABEL[p]).join(', ');
      if (result.sample) toast(when === 'now' ? `Sent for this session: sample data posts nothing` : 'Scheduled for this session: sample data posts nothing');
      else toast(when === 'now' ? `Variant ${variant.label} is going out to ${where}` : `Variant ${variant.label} scheduled for ${formatInZone(scheduledAt ?? '', timeZone)}`);
      onPosted();
    } catch (err) {
      if (signal.aborted) return;
      for (const path of uploaded.current) void removePostFile(path);
      uploaded.current = [];
      setProblem(err instanceof RenderError || err instanceof UploadError ? err.message : 'The post could not be made. Try again.');
    } finally {
      running.current = null;
      setStep(null);
    }
  }

  const page = (place: Place) => {
    if (place === 'facebook') return pages.facebook?.name;
    if (place === 'instagram') return pages.instagram ? `@${pages.instagram.username}` : undefined;
    return pages.linkedin?.name;
  };

  return (
    <dialog
      ref={dialog}
      className={`${video.dialog} ${styles.dialog}`}
      aria-labelledby="publish-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className={video.dialogHead}>
        <div>
          <h2 id="publish-title">Post variant {variant.label}</h2>
          <p className="muted small">{adSetTitle}</p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={close}>
          <Close size={18} aria-hidden />
        </button>
      </header>

      <div className={video.dialogBody}>
        <fieldset className={styles.section} disabled={working}>
          <legend className={styles.sectionTitle}>Where</legend>
          <div className={styles.places}>
            {PLACES.map((place) => {
              const can = available(place);
              const reason = !variant.copy[PLATFORM_OF[place]] ? `No ${PLATFORM_OF[place] === 'meta' ? 'Meta' : 'LinkedIn'} copy in this variant` : !can ? 'Over Instagram’s 2,200 characters' : null;
              return (
                <label key={place} className={styles.place}>
                  <input type="checkbox" checked={chosen.has(place)} disabled={!can} onChange={(e) => toggle(place, e.target.checked)} />
                  <PlaceIcon place={place} size={22} decorative />
                  <span className={styles.placeText}>
                    <span className={styles.placeName}>{PLACE_LABEL[place]}</span>
                    <span className={styles.placeWhere}>{reason ?? page(place) ?? 'No Page set in Settings yet'}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {places.length > 0 && (
          <section className={styles.section} aria-labelledby="publish-what">
            <h3 id="publish-what" className={styles.sectionTitle}>
              What goes out
            </h3>
            <div className={styles.previews}>
              {places.map((place) => {
                const picture = pictures[RATIO[place]];
                return (
                  <div key={place} className={styles.preview}>
                    <span className={styles.previewHead}>
                      <PlaceIcon place={place} size={16} decorative />
                      {PLACE_LABEL[place]}
                    </span>
                    {clip && edit ? (
                      <div className={styles.previewVideo}>
                        <span>
                          <Clapperboard size={18} aria-hidden />
                          <br />
                          Video · {length(editedSeconds(edit))} · {ASPECT_INFO[edit.aspect].label}
                          <br />
                          made from your edit when you post
                        </span>
                      </div>
                    ) : picture ? (
                      // A plain img: it shows the very file that goes out.
                      <img className={styles.previewImage} src={picture.url} alt={`The picture for ${PLACE_LABEL[place]}`} width={PICTURE_SIZE[RATIO[place]].width} height={PICTURE_SIZE[RATIO[place]].height} />
                    ) : (
                      <div className={styles.previewVideo}>
                        <LoaderCircle size={18} className="spin" aria-hidden />
                      </div>
                    )}
                    <p className={styles.previewText}>{variant.copy[PLATFORM_OF[place]]?.text}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <fieldset className={styles.section} disabled={working}>
          <legend className={styles.sectionTitle}>When</legend>
          <div className={styles.when}>
            <label className={styles.whenOption}>
              <input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} />
              Post now
            </label>
            <label className={styles.whenOption}>
              <input type="radio" name="when" checked={when === 'later'} onChange={() => setWhen('later')} />
              Schedule
            </label>
            {when === 'later' && (
              <span className={styles.whenFields}>
                <input type="date" aria-label="Date" value={date} min={today} max={lastDay} onChange={(e) => setDate(e.target.value)} />
                <input type="time" aria-label="Time" value={time} step={300} onChange={(e) => setTime(e.target.value)} />
                <span className={styles.zone}>{zoneLabel(timeZone)} time</span>
              </span>
            )}
          </div>
        </fieldset>

        {step && (
          <div className={styles.progress} aria-live="polite">
            <span>
              <LoaderCircle size={15} className="spin" aria-hidden /> {step.label}
              {step.progress !== null && ` ${Math.round(step.progress * 100)}%`}
            </span>
            {step.progress !== null && (
              <span className={styles.bar} aria-hidden>
                <span style={{ width: `${Math.round(step.progress * 100)}%` }} />
              </span>
            )}
          </div>
        )}
        {problem && (
          <p className="error-text" role="alert">
            {problem}
          </p>
        )}
      </div>

      <footer className={video.dialogFoot}>
        <p className={video.footNote}>It goes out exactly as approved. Posts shows how each one went.</p>
        <button type="button" className="btn btn-quiet" onClick={close}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void post()} disabled={working || places.length === 0 || (when === 'later' && !scheduledAt)} aria-busy={working}>
          {when === 'now' ? <Send size={16} aria-hidden /> : <CalendarClock size={16} aria-hidden />}
          {when === 'now' ? 'Post now' : scheduledAt ? `Schedule for ${formatInZone(scheduledAt, timeZone)}` : 'Schedule'}
        </button>
      </footer>
    </dialog>
  );
}
