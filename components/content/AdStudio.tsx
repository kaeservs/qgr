'use client';

import { ArrowLeft, CalendarClock, Check, Clapperboard, Copy, Lock, MousePointerClick, Pencil, RotateCcw, Send, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { approveVariantAction, saveVariantAction } from '@/app/(app)/content/actions';
import { cx } from '@/lib/cx';
import { describeWarning, guardrailWarnings, videoWarnings } from '@/lib/guardrails';
import { PLATFORM_LABEL } from '@/lib/platforms';
import { formatInZone } from '@/lib/schedule';
import type { AdSet, Clip, Platform, PlatformCopy, Post, PostPages, Strategy, Variant } from '@/lib/types';
import { defaultEdit } from '@/lib/video/edit';
import type { VideoEdit } from '@/lib/video/edit';
import { PublishDialog } from '../posts/PublishDialog';
import { PlatformIcon } from '../ui/PlatformIcon';
import { StatusPill } from '../ui/StatusPill';
import { useToast } from '../ui/Toast';
import { VideoEditor } from '../video/VideoEditor';
import type { SavedVideo } from '../video/VideoEditor';
import { PREVIEW } from './Previews';
import type { AdBrand } from './Previews';
import styles from './content.module.css';

const sameWords = (a: Variant, b: Variant | undefined) => !!b && a.creative.text === b.creative.text && JSON.stringify(a.copy) === JSON.stringify(b.copy);

/** The variant with its video edit replaced, or taken away for the whole clip. */
function withVideo(v: Variant, edit: VideoEdit | null): Variant {
  const { videoEdit: _, ...rest } = v;
  return edit ? { ...rest, videoEdit: edit } : rest;
}

/** What is happening to a variant's posts: one waiting to go out locks it; one that went out is shown. */
function postState(posts: readonly Post[], variantId: string): { waiting: Post | null; posted: boolean } {
  const mine = posts.filter((p) => p.variantId === variantId);
  const waiting = mine
    .filter((p) => p.targets.some((t) => t.status === 'scheduled' || t.status === 'posting'))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
  return { waiting: waiting ?? null, posted: mine.some((p) => p.targets.some((t) => t.status === 'posted')) };
}

function asText(copy: PlatformCopy): string {
  const lines = [copy.text, '', copy.headline];
  if (copy.description) lines.push(copy.description);
  if (copy.cta) lines.push(`[${copy.cta}]`);
  return lines.join('\n');
}

/**
 * Three variants side by side, each drawn as the platform's own post. Selecting
 * one highlights it and makes it editable in place; the others stay as they
 * are, for comparison. Edits are saved when the variant is left (Done, Escape,
 * or picking another) and before it is approved. Guardrail flags are worked
 * out from the words on screen as they change. When the run started from a
 * clip, each variant is a video made from it, edited in the video editor.
 */
export function AdStudio({
  adSet,
  strategy,
  platforms,
  brand,
  clip,
  posts,
  publishing,
}: {
  adSet: AdSet;
  strategy: Strategy | null;
  platforms: Platform[];
  brand: AdBrand;
  /** The run's clip and a link to play it from (null when it can't be played here). */
  clip?: { clip: Clip; url: string | null };
  /** The posts made from this set's variants. */
  posts: Post[];
  /** The team's zone, for posting times, and the Pages posts go to. */
  publishing: { timeZone: string; pages: PostPages };
}) {
  const toast = useToast();
  const router = useRouter();
  const [postOf, setPostOf] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>(platforms[0] ?? 'meta');
  const [variants, setVariants] = useState(adSet.variants);
  // The last version the server holds, for Reset and for knowing what changed.
  const [saved, setSaved] = useState(() => new Map(adSet.variants.map((v) => [v.id, v])));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'saving' | 'approving' | null>(null);
  const [videoOf, setVideoOf] = useState<string | null>(null);
  const selected = variants.find((v) => v.id === selectedId);
  const editingVideo = variants.find((v) => v.id === videoOf);
  const posting = variants.find((v) => v.id === postOf);
  // A variant waiting to post can't change: what goes out is what was approved.
  const locked = selected ? postState(posts, selected.id).waiting : null;
  // One object for every variant with no edit, so previews don't redraw for nothing.
  const wholeClip = useMemo(() => (clip ? defaultEdit(clip.clip.duration) : null), [clip]);
  const frameBrand = useMemo(() => ({ name: brand.name, website: brand.domain }), [brand.name, brand.domain]);

  function videoSaved(id: string, saved: SavedVideo) {
    // A change takes the approval back (save_video_edit does the same): approve it again before it is posted.
    const apply = (v: Variant): Variant => unapproved({ ...withVideo(v, saved.videoEdit), creative: { ...v.creative, text: saved.creativeText }, ...(saved.warnings ? { warnings: saved.warnings } : {}) });
    update(id, apply);
    setSaved((map) => {
      const was = map.get(id);
      return was ? new Map(map).set(id, apply(was)) : map;
    });
  }
  const isDirty = (v: Variant) => !sameWords(v, saved.get(v.id));
  const unapproved = (v: Variant): Variant => {
    const { approved: _, ...rest } = v;
    return rest;
  };
  const anyDirty = variants.some(isDirty);

  const update = (id: string, change: (v: Variant) => Variant) => setVariants((list) => list.map((v) => (v.id === id ? change(v) : v)));

  /** Saves a variant's words if they changed. False when the save failed, so the edit stays open. */
  async function persist(v: Variant): Promise<boolean> {
    if (!isDirty(v)) return true;
    setBusy('saving');
    const result = await saveVariantAction(v.id, { creativeText: v.creative.text, copy: v.copy });
    setBusy(null);
    if (!result.ok) {
      toast(result.error, 'info');
      return false;
    }
    // A change takes the approval back (save_variant does the same): approve it again before it is posted.
    const wasApproved = !!saved.get(v.id)?.approved;
    const kept = unapproved({ ...v, warnings: result.value.warnings });
    setSaved((map) => new Map(map).set(v.id, kept));
    update(v.id, (x) => unapproved({ ...x, warnings: result.value.warnings }));
    toast(result.sample ? 'Saved for this session' : wasApproved ? `Variant ${v.label} saved: approve it again before it is posted` : `Variant ${v.label} saved`);
    return true;
  }

  async function leave() {
    if (selected && !(await persist(selected))) return;
    setSelectedId(null);
  }

  async function pick(id: string) {
    if (busy) return;
    if (selected && !(await persist(selected))) return;
    setSelectedId(id);
  }

  async function approve(v: Variant) {
    if (!(await persist(v))) return;
    setBusy('approving');
    const result = await approveVariantAction(v.id);
    setBusy(null);
    if (!result.ok) return toast(result.error, 'info');
    update(v.id, (x) => ({ ...x, approved: true }));
    setSaved((map) => {
      const was = map.get(v.id);
      return was ? new Map(map).set(v.id, { ...was, approved: true }) : map;
    });
    toast(`Variant ${v.label} approved`);
  }

  // Escape leaves a field first, then the variant (saving it). While the video editor is open, Escape is its own.
  useEffect(() => {
    if (!selectedId || videoOf || postOf) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) active.blur();
      else void leave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Closing the tab with unsaved words asks first.
  useEffect(() => {
    if (!anyDirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [anyDirty]);

  const status = variants.some((v) => v.approved) ? 'approved' : 'review';

  return (
    <div className={cx('page', styles.studio)}>
      <Link href="/content" className="back">
        <ArrowLeft size={16} aria-hidden />
        Content
      </Link>

      <header className="page-head">
        <div>
          <h1 className="display h1">{adSet.title}</h1>
          <p className={styles.meta}>
            {strategy && (
              <Link href={`/strategy/${strategy.id}`} className="link">
                View strategy
              </Link>
            )}
            <span>{variants.length} variants</span>
            <StatusPill status={status} small />
          </p>
        </div>
        {platforms.length > 1 && (
          <div className={styles.platforms} role="radiogroup" aria-label="Preview on">
            {platforms.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={platform === p} className={cx(styles.platformBtn, platform === p && styles.platformBtnOn)} onClick={() => setPlatform(p)}>
                <PlatformIcon platform={p} size={16} decorative />
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className={cx(styles.toolbar, selected && styles.toolbarActive)} aria-live="polite">
        {selected ? (
          <>
            {locked ? (
              <p className={styles.toolbarText}>
                <Lock size={16} aria-hidden />
                <span>
                  <strong>Variant {selected.label}</strong> is waiting to post, {formatInZone(locked.scheduledFor, publishing.timeZone)}.{' '}
                  <Link href="/posts" className="link">
                    Cancel it on Posts
                  </Link>{' '}
                  to change it.
                </span>
              </p>
            ) : (
              <p className={styles.toolbarText}>
                <Pencil size={16} aria-hidden />
                <span>
                  {busy === 'saving' ? (
                    'Saving…'
                  ) : (
                    <>
                      Editing <strong>variant {selected.label}</strong> for {PLATFORM_LABEL[platform]}
                    </>
                  )}
                </span>
              </p>
            )}
            <div className={styles.tools}>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={!isDirty(selected) || busy !== null}
                onClick={() => {
                  const kept = saved.get(selected.id);
                  // Reset drops the changes not saved yet; it never undoes an approval.
                  if (kept) update(selected.id, (v) => (v.approved && !kept.approved ? { ...kept, approved: true } : kept));
                }}
              >
                <RotateCcw size={15} aria-hidden />
                Reset
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!selected.copy[platform]}
                onClick={async () => {
                  const copy = selected.copy[platform];
                  if (!copy) return;
                  try {
                    await navigator.clipboard.writeText(asText(copy));
                    toast('Ad copy copied');
                  } catch {
                    toast('Copying is blocked in this browser', 'info');
                  }
                }}
              >
                <Copy size={15} aria-hidden />
                Copy
              </button>
              {clip && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy !== null || locked !== null}
                  onClick={async () => {
                    // The editor saves the words too, so what is on screen is saved first.
                    if (await persist(selected)) setVideoOf(selected.id);
                  }}
                >
                  <Clapperboard size={15} aria-hidden />
                  Edit video
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void leave()}>
                Done
              </button>
              {selected.approved && !isDirty(selected) ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy !== null || locked !== null}
                  onClick={() => {
                    setPostOf(selected.id);
                  }}
                >
                  <Send size={15} aria-hidden />
                  Post…
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void approve(selected)}>
                  <Check size={15} aria-hidden />
                  {busy === 'approving' ? 'Approving…' : 'Approve'}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className={styles.toolbarText}>
            <MousePointerClick size={16} aria-hidden />
            Pick a variant to edit it.
          </p>
        )}
      </div>

      <div className={styles.variants}>
        {variants.map((v) => {
          const isSelected = v.id === selectedId;
          const Preview = PREVIEW[platform];
          const copy = v.copy[platform];
          const flags = [...guardrailWarnings(v.creative.text, v.copy, platforms), ...videoWarnings(v.videoEdit)];
          const state = postState(posts, v.id);
          return (
            <section key={v.id} className={cx(styles.variant, isSelected && styles.variantSelected)} aria-label={`Variant ${v.label}: ${v.angle}`}>
              <div className={styles.variantHead}>
                <span className={styles.letter}>{v.label}</span>
                <span className={styles.angle}>{v.angle}</span>
                {v.approved && <StatusPill status="approved" small />}
                {state.waiting ? (
                  <span className={cx('pill pill-sm', styles.postPill)} title={`Waiting to post, ${formatInZone(state.waiting.scheduledFor, publishing.timeZone)}`}>
                    <CalendarClock size={13} aria-hidden />
                    {formatInZone(state.waiting.scheduledFor, publishing.timeZone)}
                  </span>
                ) : (
                  state.posted && (
                    <Link href="/posts" className={cx('pill pill-sm', styles.postPill)}>
                      <Send size={13} aria-hidden />
                      Posted
                    </Link>
                  )
                )}
                {isSelected && !v.approved && !state.waiting && <span className={cx('pill pill-sm', styles.editingPill)}>Editing</span>}
              </div>
              {flags.length > 0 && (
                <div className={styles.flags} role="note">
                  <TriangleAlert size={15} aria-hidden />
                  <div>
                    <p className={styles.flagsTitle}>Check before approving</p>
                    <ul>
                      {flags.map((f) => (
                        <li key={f}>{describeWarning(f)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div className={styles.frame}>
                {copy ? (
                  <Preview
                    copy={copy}
                    creative={v.creative}
                    image={v.imageUrl}
                    brand={brand}
                    editable={isSelected && busy === null && !state.waiting}
                    onCopy={(field, value) => update(v.id, (x) => {
                      const current = x.copy[platform];
                      return current ? { ...x, copy: { ...x.copy, [platform]: { ...current, [field]: value } } } : x;
                    })}
                    onCreative={(text) => update(v.id, (x) => ({ ...x, creative: { ...x.creative, text } }))}
                    video={clip && wholeClip ? { clip: clip.clip, url: clip.url, edit: v.videoEdit ?? wholeClip, brand: frameBrand, label: `Variant ${v.label}` } : undefined}
                  />
                ) : (
                  <p className={cx('muted small', styles.noCopy)}>No {PLATFORM_LABEL[platform]} copy in this variant.</p>
                )}
                {!isSelected && (
                  <button type="button" className={styles.pick} onClick={() => void pick(v.id)} aria-label={`Select variant ${v.label} to edit`}>
                    <span className={styles.pickHint}>
                      <Pencil size={14} aria-hidden />
                      Edit
                    </span>
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {posting && (
        <PublishDialog
          variant={posting}
          adSetTitle={adSet.title}
          clip={clip ?? null}
          brand={frameBrand}
          timeZone={publishing.timeZone}
          pages={publishing.pages}
          onClose={() => setPostOf(null)}
          onPosted={() => {
            setPostOf(null);
            router.refresh();
          }}
        />
      )}

      {editingVideo && clip && (
        <VideoEditor
          variant={editingVideo}
          clip={clip.clip}
          url={clip.url}
          brand={frameBrand}
          setTitle={adSet.title}
          platforms={platforms}
          onClose={() => setVideoOf(null)}
          onSaved={(saved) => videoSaved(editingVideo.id, saved)}
        />
      )}
    </div>
  );
}
