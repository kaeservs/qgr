'use client';

import { AudioLines, Download, Film, Image as ImageIcon, Music2, Pause, Play, Plus, Redo2, RotateCcw, Scissors, Trash2, TriangleAlert, Type, Undo2, Upload, X as Close } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { saveVariantAction, saveVideoEditAction } from '@/app/(app)/content/actions';
import { cx } from '@/lib/cx';
import { LIMITS } from '@/lib/edit-input';
import { describeWarning, guardrailWarnings, videoWarnings } from '@/lib/guardrails';
import type { Clip, Platform, Variant } from '@/lib/types';
import { addCaption, captionsFromTranscript, ASPECT_INFO, ASPECTS, clock, CORNERS, defaultEdit, END_CARD, frameSize, isUntouched, length, parseSubtitles, TEXT_LIMITS, TEXT_PLACES } from '@/lib/video/edit';
import type { Caption, Corner, VideoEdit } from '@/lib/video/edit';
import { RenderError } from '@/lib/video/errors';
import {
  CAPTION_STYLE_LABEL,
  CAPTION_STYLES,
  CUT,
  DEFAULT_EFFECTS,
  STILL_SECONDS,
  captionClockAt,
  compactEdit,
  frameAt,
  insertPiece,
  keepOfSequence,
  lookOf,
  mediaOf,
  newId,
  placeAt,
  removePiece,
  sequenceOf,
  splitPiece,
  spotIn,
} from '@/lib/video/timeline';
import type { MediaRef, Placed, Segment } from '@/lib/video/timeline';
import { UploadError, removeEditFile, uploadEditFile } from '@/lib/video/upload';
import { LOGO, SCALE, WORDS } from '@/lib/spot';
import { DragLayer } from '../ui/DragLayer';
import { useToast } from '../ui/Toast';
import { Choices, EffectsPanel, OverlaysPanel, PiecePanel, SoundPanel } from './EditorPanels';
import type { Changes } from './EditorPanels';
import { playableUrl } from './media';
import { useUndoable } from './player';
import { downloadClip, fetchEditMedia, makeVariantVideo } from './makeVideo';
import { Sequence } from './Sequence';
import { useEditedVideo, useTime } from './useEditedVideo';
import { useFilmstrip } from './useFilmstrip';
import { mediaUrls, useMediaUrls } from './useMediaUrls';
import styles from './video.module.css';

type Tab = 'piece' | 'effects' | 'text' | 'captions' | 'frame' | 'sound';
const TABS: readonly (readonly [Tab, string])[] = [
  ['piece', 'Piece'],
  ['effects', 'Effects'],
  ['text', 'Text'],
  ['captions', 'Captions'],
  ['frame', 'Frame'],
  ['sound', 'Sound'],
];

const CORNER_LABEL: Record<Corner, string> = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right' };
const PLACE_LABEL = { top: 'Top', middle: 'Middle', bottom: 'Bottom' } as const;
/** A new piece of another video starts as its first ten seconds, at most. */
const NEW_PIECE_SECONDS = 10;

const typing = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'video';

/** Shown where the ad's words will go, while editing a clip before its run has any. */
const WORDS_TO_COME = 'Each ad’s words show here';

/** What the editor hands back when it saves: the variant as the server now holds it. */
export interface SavedVideo {
  videoEdit: VideoEdit | null;
  creativeText: string;
  warnings?: string[];
}

/** The timeline second a second of the run's clip first plays at, or null when no piece plays it. */
function timeOfClipSecond(placed: readonly Placed[], t: number): number | null {
  for (const p of placed) {
    const s = p.segment;
    if (s.kind === 'clip' && s.media === null && t >= s.start && t < s.end) return p.at + (t - s.start) / s.speed;
  }
  return null;
}

/**
 * The studio's video editor for one variant. The video is a sequence of
 * pieces: parts of the run's clip, other videos, pictures and title cards,
 * each with its look, movement and the transition into it; texts over it,
 * captions in a style, the variant's words, the mark, an end card, and the
 * clips' sound with music under it. Edits are instructions saved with the
 * variant; Export makes the MP4 in this browser and downloads it.
 */
export function VideoEditor({
  variant,
  clip,
  url,
  brand,
  setTitle,
  platforms = [],
  onClose,
  onSaved,
  onApply,
}: {
  /** The ad being edited; absent before the run, while the clip is being uploaded. */
  variant?: Variant | undefined;
  clip: Clip;
  url: string | null;
  brand: { name: string; website: string };
  setTitle: string;
  platforms?: Platform[];
  onClose: () => void;
  onSaved?: (saved: SavedVideo) => void;
  /** Before the run: the edit every ad will start from (null for the clip as it is), handed back rather than saved. */
  onApply?: (edit: VideoEdit | null) => void;
}) {
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const started = useMemo(() => variant?.videoEdit ?? clip.edit ?? defaultEdit(clip.duration), [variant?.videoEdit, clip.edit, clip.duration]);
  const history = useUndoable<VideoEdit>(started);
  const edit = history.value;
  const [words, setWords] = useState(variant?.creative.text ?? '');
  const [tab, setTab] = useState<Tab>('piece');
  const [caption, setCaption] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // The words, the logo or a text picked on the preview, to size or put back.
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [busy, setBusy] = useState<'saving' | 'exporting' | null>(null);
  const [adding, setAdding] = useState<{ label: string; share: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const clipFile = useRef<Promise<Blob> | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Closing with changes not saved asks first, in the footer.
  const [leaving, setLeaving] = useState(false);
  const exporting = useRef<AbortController | null>(null);
  const subtitles = useRef<HTMLInputElement>(null);
  const videoPicker = useRef<HTMLInputElement>(null);
  const picturePicker = useRef<HTMLInputElement>(null);
  const musicPicker = useRef<HTMLInputElement>(null);
  // Files uploaded while this editor is open: those the saved edit leaves out are taken back.
  const uploaded = useRef(new Set<string>());

  const size = useMemo(() => frameSize(edit, clip), [edit, clip]);
  // The preview is drawn at up to 720p; the export at full size from the same instructions.
  const previewSize = useMemo(() => frameSize(edit, clip, 720), [edit, clip]);
  // Before the run there are no ad words yet: the preview shows where each ad's own will go.
  const shownWords = variant ? words : WORDS_TO_COME;
  const { player, total, placed, missing, hits } = useEditedVideo(canvas, host, url, edit, previewSize, { words: shownWords, brand });
  const t = useTime(player.clock);
  const duration = clip.duration;
  const sequence = useMemo(() => sequenceOf(edit), [edit]);
  const sequenceEnd = placed[placed.length - 1]?.until ?? 0;
  const frame = frameAt(placed, t);
  const onCard = frame.onEndCard;
  const clipNow = captionClockAt(frame);
  const urls = useMediaUrls(useMemo(() => mediaOf(edit).map((m) => m.path), [edit]));

  // The piece picked in the strip, or the one under the playhead.
  const piece = placed.find((p) => p.segment.id === picked) ?? frame.current?.placed ?? placed[placed.length - 1] ?? null;
  const onScreen = piece && frame.current?.placed.segment.id === piece.segment.id ? frame.current : piece && frame.previous?.placed.segment.id === piece.segment.id ? frame.previous : null;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  useEffect(() => () => exporting.current?.abort(), []);

  const clipSrc = useMemo(() => (url ? playableUrl(url) : null), [url]);
  const frames = useFilmstrip(clipSrc, duration);

  const change = (next: Partial<VideoEdit>) => history.set({ ...edit, ...next });
  const withSequence = (next: Segment[]): VideoEdit => ({ ...edit, sequence: next, keep: keepOfSequence(next) });
  const changes: Changes = {
    edit,
    sequence,
    placed,
    set: change,
    replace: (next) => history.set(next),
    preview: (next) => history.preview({ ...edit, ...next }),
    settle: () => history.settle(edit),
    setSequence: (next) => history.set(withSequence(next)),
    previewSequence: (next) => history.preview(withSequence(next)),
  };

  // What can be dragged on the preview, by name, for its handle and the picked strip.
  const grabLabels: Record<string, string> = { [WORDS]: variant ? 'the words' : 'where the words go', [LOGO]: 'the logo', ...Object.fromEntries((edit.overlays ?? []).map((o) => [o.id, `“${o.text}”`])) };
  /** Where a thing is now: where it was dragged to, or the middle of where it is drawn. */
  const grabbedAt = (id: string) => {
    const spot = spotIn(edit, id);
    if (spot) return spot;
    const hit = hits.find((h) => h.id === id);
    return hit ? { x: (hit.x + hit.width / 2) / previewSize.width, y: (hit.y + hit.height / 2) / previewSize.height, scale: 1 } : null;
  };

  const flags = [...(variant ? guardrailWarnings(words, variant.copy, platforms).filter((f) => f.startsWith('image text')) : []), ...videoWarnings(edit)];
  const saving = compactEdit(edit);
  const changed = JSON.stringify(saving) !== JSON.stringify(compactEdit(started)) || (variant !== undefined && words.trim() !== variant.creative.text);

  /** Takes back the files uploaded here that `kept` does not use. */
  function tidy(kept: VideoEdit | null) {
    const used = new Set(kept ? mediaOf(kept).map((m) => m.path) : []);
    for (const path of uploaded.current) if (!used.has(path)) void removeEditFile(path);
    uploaded.current.clear();
  }

  function close() {
    if (changed && !leaving) return setLeaving(true);
    if (busy === 'exporting') exporting.current?.abort();
    tidy(variant ? (variant.videoEdit ?? null) : (clip.edit ?? null));
    onClose();
  }

  async function save() {
    if (!variant) {
      // Before the run: the edit goes with the clip, and every ad starts from it.
      const next = isUntouched(saving, duration) ? null : saving;
      tidy(next);
      onApply?.(next);
      toast(next ? 'Every ad from this clip starts from this edit' : 'The ads start from the clip as it is');
      return onClose();
    }
    const text = words.trim();
    if (!text && edit.text.show) return setProblem('The video needs some words, or switch them off under Text.');
    if (text.length > LIMITS.creativeText) return setProblem(`Keep the words under ${LIMITS.creativeText} characters.`);
    setProblem(null);
    setBusy('saving');
    let warnings: string[] | undefined;
    if (text && text !== variant.creative.text) {
      const saved = await saveVariantAction(variant.id, { creativeText: text, copy: variant.copy });
      if (!saved.ok) {
        setBusy(null);
        return setProblem(saved.error);
      }
      warnings = saved.value.warnings;
    }
    // With an edit made at upload, "no edits" is saved as such: saving nothing would bring that edit back.
    const next = isUntouched(saving, duration) && !clip.edit ? null : saving;
    const result = await saveVideoEditAction(variant.id, next);
    setBusy(null);
    if (!result.ok) return setProblem(result.error);
    tidy(next);
    onSaved?.({ videoEdit: next, creativeText: text || variant.creative.text, ...(warnings ? { warnings } : {}) });
    toast(result.sample ? 'Saved for this session' : `Variant ${variant.label} video saved`);
  }

  async function exportVideo() {
    if (!url) return;
    setProblem(null);
    setExported(null);
    setBusy('exporting');
    setProgress(null);
    player.pause();
    const controller = new AbortController();
    exporting.current = controller;
    try {
      clipFile.current ??= downloadClip(clipSrc ?? url);
      const file = await clipFile.current.catch((err: unknown) => {
        clipFile.current = null;
        throw err;
      });
      const links = await mediaUrls(mediaOf(edit).map((m) => m.path));
      const media = await fetchEditMedia(edit, (path) => links[path] ?? null, controller.signal);
      if (controller.signal.aborted) return;
      setProgress(0);
      const { blob, target } = await makeVariantVideo({
        clip: file,
        media,
        edit,
        words: shownWords.trim(),
        brand: { name: brand.name, website: brand.website },
        size,
        onProgress: setProgress,
        signal: controller.signal,
      });
      const name = `qgr-${slug(setTitle)}-${variant ? variant.label.toLowerCase() : 'clip'}-${edit.aspect === 'original' ? 'original' : edit.aspect.replace(':', 'x')}.${target.extension}`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
      const mb = (blob.size / 1024 / 1024).toFixed(1);
      setExported(
        target.container === 'mp4'
          ? `Downloaded ${name}: ${size.width}×${size.height}, ${length(total)}, ${mb} MB.`
          : `Downloaded ${name} (${mb} MB). This browser can only make WebM; LinkedIn and X take MP4, so export those from Chrome, Edge or Safari.`,
      );
    } catch (err) {
      if (!controller.signal.aborted) setProblem(err instanceof RenderError ? err.message : 'The video could not be made in this browser.');
    } finally {
      exporting.current = null;
      setBusy(null);
    }
  }

  /** Puts a new piece after the one picked, picks it and shows its start. */
  function add(next: Segment) {
    if (sequence.length >= 40) return setProblem('Up to 40 pieces in a video.');
    const after = piece?.segment.id ?? null;
    const seq = insertPiece(sequence, next, after);
    history.set(withSequence(seq));
    setPicked(next.id);
    setTab('piece');
    const at = placed.find((p) => p.segment.id === after)?.until ?? sequenceEnd;
    setTimeout(() => player.seek(Math.max(0, at - 0.001) + 0.05), 0);
  }

  async function addFile(file: File | undefined, kind: 'video' | 'image' | 'music') {
    if (!file) return;
    setProblem(null);
    setAdding({ label: `Adding ${file.name}…`, share: 0 });
    try {
      let ref: Omit<MediaRef, 'path'>;
      if (kind === 'image') {
        const bitmap = await createImageBitmap(file).catch(() => Promise.reject(new RenderError('That file can’t be read as a picture. Use a JPEG, PNG or WebP.')));
        ref = { name: file.name, width: bitmap.width, height: bitmap.height };
        bitmap.close();
      } else if (kind === 'video') {
        const { probeClip } = await import('@/lib/video/render');
        const info = await probeClip(file);
        if (!info.canDecode) throw new RenderError('This browser can’t read that video’s format. Try an MP4 or a WebM.');
        ref = { name: file.name, width: info.width, height: info.height, duration: Math.round(info.duration * 1000) / 1000 };
      } else {
        const { probeAudio } = await import('@/lib/video/render');
        ref = { name: file.name, width: 0, height: 0, duration: Math.round((await probeAudio(file)) * 1000) / 1000 };
      }
      const { path } = await uploadEditFile(file, (share) => setAdding({ label: `Uploading ${file.name}…`, share }));
      uploaded.current.add(path);
      const media: MediaRef = { path, ...ref };
      if (kind === 'music') {
        change({ music: { media, volume: 0.5, fadeIn: 1, fadeOut: 2, duck: true } });
        toast(`${file.name} plays under the video`);
      } else if (kind === 'image') {
        add({ id: newId(), kind: 'image', media, seconds: STILL_SECONDS.default, effects: { ...DEFAULT_EFFECTS, motion: 'zoom-in' }, transition: { type: 'fade', seconds: 0.5 } });
      } else {
        add({ id: newId(), kind: 'clip', media, start: 0, end: Math.min(media.duration ?? NEW_PIECE_SECONDS, NEW_PIECE_SECONDS), speed: 1, volume: 1, effects: DEFAULT_EFFECTS, transition: CUT });
      }
    } catch (err) {
      setProblem(err instanceof RenderError || err instanceof UploadError ? err.message : 'The file could not be added.');
    } finally {
      setAdding(null);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (typing(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      player.toggle();
    } else if (!mod && (e.key === 's' || e.key === 'S') && frame.current) {
      e.preventDefault();
      changes.setSequence(splitPiece(sequence, frame.current.placed.segment.id, frame.current.local));
    } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && piece) {
      e.preventDefault();
      changes.setSequence(removePiece(sequence, piece.segment.id));
    } else if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    } else if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      history.redo();
    }
  }

  function setFocus(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  }

  const captionsWith = (i: number, next: Partial<Caption>) => edit.captions.map((c, j) => (j === i ? { ...c, ...next } : c));
  const setCaptionAt = (i: number, next: Partial<Caption>) => change({ captions: captionsWith(i, next) });
  // Typing is one step for undo: previewed while it goes on, recorded when the field is left.
  const typeCaptionAt = (i: number, next: Partial<Caption>) => history.preview({ ...edit, captions: captionsWith(i, next) });
  const settle = () => history.settle(edit);
  const selected = caption !== null ? edit.captions[caption] : undefined;
  const crops = edit.fit === 'fill' && Math.abs(size.width / size.height - clip.width / clip.height) > 0.01;
  const look = lookOf(edit);
  const canSplit = frame.current !== null && splitPiece(sequence, frame.current.placed.segment.id, frame.current.local).length !== sequence.length;

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="editor-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={onKey}
    >
      <header className={styles.dialogHead}>
        <div>
          <h2 id="editor-title">{variant ? `Edit video · Variant ${variant.label}` : 'Edit video'}</h2>
          <p className="muted small">{variant ? `${variant.angle} · ${clip.name}` : `${clip.name} · every ad made from this clip starts from this edit, and each can still be changed in Content`}</p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={close}>
          <Close size={18} aria-hidden />
        </button>
      </header>

      <div className={styles.dialogBody}>
        <div className={styles.editor}>
          <div className={styles.editorMain}>
            <div className={styles.stage}>
              <div ref={host} className={styles.hiddenVideo} aria-hidden />
              {url ? (
                <div className={styles.stageCanvas}>
                  <canvas ref={canvas} width={previewSize.width} height={previewSize.height} role="img" aria-label={`Preview: ${ASPECT_INFO[edit.aspect].label}, ${length(total)}`} onClick={() => player.toggle()} />
                  {/* Paused, the words, the logo and the texts on screen can be dragged where they should sit. */}
                  {!player.playing && (
                    <DragLayer
                      hits={hits}
                      size={previewSize}
                      labels={grabLabels}
                      selected={grabbed}
                      spotOf={(id) => spotIn(edit, id)}
                      onSelect={setGrabbed}
                      onMove={(id, spot) => history.preview(placeAt(edit, id, spot))}
                      onDrop={(id, spot) => history.settle(placeAt(edit, id, spot))}
                      disabled={busy !== null}
                    />
                  )}
                </div>
              ) : (
                <p className={styles.stageMessage}>Sample data keeps no uploads, so this clip can’t be edited here.</p>
              )}
            </div>

            <div className={styles.controls}>
              <button type="button" className={styles.playButton} aria-label={player.playing ? 'Pause' : 'Play the video'} onClick={() => player.toggle()} disabled={!url}>
                {player.playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
              </button>
              <span className={styles.time}>
                <strong>{clock(t)}</strong> / {clock(total)}
                {onCard ? ' · end card' : clipNow !== null ? ` · clip ${clock(clipNow)}` : ''}
              </span>
              <div className={styles.tools}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => frame.current && changes.setSequence(splitPiece(sequence, frame.current.placed.segment.id, frame.current.local))} disabled={!canSplit} aria-keyshortcuts="S">
                  <Scissors size={15} aria-hidden />
                  Split
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => piece && changes.setSequence(removePiece(sequence, piece.segment.id))} disabled={!piece || removePiece(sequence, piece.segment.id).length === sequence.length} aria-keyshortcuts="Delete">
                  <Trash2 size={15} aria-hidden />
                  Remove
                </button>
                <button type="button" className="icon-btn icon-btn-plain" aria-label="Undo" title="Undo" onClick={history.undo} disabled={!history.canUndo}>
                  <Undo2 size={17} aria-hidden />
                </button>
                <button type="button" className="icon-btn icon-btn-plain" aria-label="Redo" title="Redo" onClick={history.redo} disabled={!history.canRedo}>
                  <Redo2 size={17} aria-hidden />
                </button>
              </div>
            </div>

            {grabbed && grabLabels[grabbed] && (
              <div className={styles.grabbed} role="group" aria-label={`Picked: ${grabLabels[grabbed]}`}>
                <span className="small">
                  Picked: <strong>{grabLabels[grabbed]}</strong>
                </span>
                <label className={styles.grabbedSize}>
                  <span className="small">Size {Math.round((spotIn(edit, grabbed)?.scale ?? 1) * 100)}%</span>
                  <input
                    type="range"
                    min={SCALE.min}
                    max={SCALE.max}
                    step={0.05}
                    value={spotIn(edit, grabbed)?.scale ?? 1}
                    onChange={(e) => {
                      const at = grabbedAt(grabbed);
                      if (at) history.preview(placeAt(edit, grabbed, { ...at, scale: Number(e.target.value) }));
                    }}
                    onPointerUp={() => history.settle(edit)}
                    onKeyUp={() => history.settle(edit)}
                    disabled={!grabbedAt(grabbed)}
                  />
                </label>
                <button type="button" className="btn btn-quiet btn-sm" disabled={!spotIn(edit, grabbed)} onClick={() => history.set(placeAt(edit, grabbed, null))}>
                  <RotateCcw size={14} aria-hidden />
                  {grabbed === LOGO ? 'Back in its corner' : 'Back in its place'}
                </button>
                <button type="button" className="icon-btn icon-btn-plain" aria-label="Done with it" onClick={() => setGrabbed(null)}>
                  <Close size={16} aria-hidden />
                </button>
              </div>
            )}

            <div className={styles.addRow} aria-label="Add to the video">
              <span className={styles.addLabel}>Add:</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={adding !== null}
                onClick={() => {
                  const s = piece?.segment;
                  const from = s && s.kind === 'clip' && s.media === null ? s.end : 0;
                  const start = from < duration - 0.5 ? from : 0;
                  add({ id: newId(), kind: 'clip', media: null, start, end: Math.min(duration, start + 5), speed: 1, volume: 1, effects: DEFAULT_EFFECTS, transition: CUT });
                }}
              >
                <Plus size={14} aria-hidden />
                Part of the clip
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={adding !== null} onClick={() => videoPicker.current?.click()}>
                <Film size={14} aria-hidden />
                Another video
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={adding !== null} onClick={() => picturePicker.current?.click()}>
                <ImageIcon size={14} aria-hidden />
                Picture
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={adding !== null}
                onClick={() => add({ id: newId(), kind: 'title', text: 'Your headline', subtext: '', style: 'brand', seconds: STILL_SECONDS.default, effects: DEFAULT_EFFECTS, transition: { type: 'fade', seconds: 0.5 } })}
              >
                <Type size={14} aria-hidden />
                Title card
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={adding !== null}
                onClick={() => {
                  setTab('sound');
                  musicPicker.current?.click();
                }}
              >
                <Music2 size={14} aria-hidden />
                {edit.music ? 'Music ✓' : 'Music'}
              </button>
              <input ref={videoPicker} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { void addFile(e.target.files?.[0], 'video'); e.target.value = ''; }} />
              <input ref={picturePicker} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void addFile(e.target.files?.[0], 'image'); e.target.value = ''; }} />
              <input ref={musicPicker} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" hidden onChange={(e) => { void addFile(e.target.files?.[0], 'music'); e.target.value = ''; }} />
            </div>
            <Sequence
              placed={placed}
              total={total}
              clipSeconds={duration}
              frames={frames}
              urls={urls}
              time={player.clock}
              selected={piece?.segment.id ?? null}
              onSelect={(id) => setPicked(id)}
              onSeek={player.seek}
              onTransition={(id) => {
                setPicked(id);
                setTab('effects');
              }}
              overlays={edit.overlays ?? []}
              selectedOverlay={overlay}
              onOverlay={(id) => {
                setOverlay(id);
                setTab('text');
              }}
            />

            {adding && (
              <div className={styles.footNote} aria-live="polite">
                {adding.label}
                <span className={styles.progress} aria-hidden>
                  <span style={{ width: `${Math.round(adding.share * 100)}%` }} />
                </span>
              </div>
            )}
            {missing > 0 && <p className={styles.hint}>{missing === 1 ? 'A file this video uses can’t be shown here' : `${missing} files this video uses can’t be shown here`}: on the sample data, files added are kept only until the page is reloaded.</p>}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTabs} role="tablist" aria-label="Edit">
              {TABS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} className={cx(styles.panelTab, tab === key && styles.panelTabOn)} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>

            <div className={styles.panelBody} role="tabpanel" aria-label={TABS.find(([key]) => key === tab)?.[1]}>
              {tab === 'piece' && piece && (
                <PiecePanel c={changes} piece={piece} clipSeconds={duration} sourceNow={onScreen?.source ?? null} localNow={onScreen?.local ?? null} onSelect={setPicked} onSeek={player.seek} />
              )}

              {tab === 'effects' && piece && <EffectsPanel c={changes} piece={piece} />}

              {tab === 'text' && (
                <>
                  <div className={styles.section}>
                    <label className={styles.row}>
                      <input type="checkbox" checked={edit.text.show} onChange={(e) => change({ text: { ...edit.text, show: e.target.checked } })} />
                      <span>{variant ? 'Show the variant’s words on the video' : 'Show each ad’s words on the video'}</span>
                    </label>
                    {variant ? (
                      <label className="field">
                        <span className="label">Words</span>
                        <input className="input" value={words} onChange={(e) => setWords(e.target.value)} maxLength={LIMITS.creativeText} disabled={!edit.text.show} />
                        <span className="muted small">The same words as the variant’s image, eight words at most reads best.</span>
                      </label>
                    ) : (
                      <span className="muted small">The agents write each ad’s words; here you choose where and how long they show. Your own words go under Texts on the video.</span>
                    )}
                    <Choices label="Where" options={TEXT_PLACES} value={edit.text.place} name={(p) => PLACE_LABEL[p]} disabled={!edit.text.show} onPick={(p) => history.set({ ...placeAt(edit, WORDS, null), text: { ...placeAt(edit, WORDS, null).text, place: p } })} />
                    <div className="field">
                      <span className="label">How long</span>
                      <div className={styles.choices} role="radiogroup" aria-label="How long the words stay up">
                        <button type="button" role="radio" aria-checked={edit.text.until === null} className={cx(styles.choice, edit.text.until === null && styles.choiceOn)} disabled={!edit.text.show} onClick={() => change({ text: { ...edit.text, until: null } })}>
                          The whole video
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={edit.text.until !== null}
                          className={cx(styles.choice, edit.text.until !== null && styles.choiceOn)}
                          disabled={!edit.text.show}
                          onClick={() => change({ text: { ...edit.text, until: Math.min(3, Math.max(1, Math.floor(total))) } })}
                        >
                          The first seconds
                        </button>
                      </div>
                      {edit.text.until !== null && (
                        <div className={styles.row}>
                          <input
                            className={styles.range}
                            type="range"
                            min={1}
                            max={Math.max(1, Math.ceil(total))}
                            step={0.5}
                            value={edit.text.until}
                            aria-label="Seconds the words stay up"
                            onChange={(e) => history.preview({ ...edit, text: { ...edit.text, until: Number(e.target.value) } })}
                            onPointerUp={settle}
                            onKeyUp={settle}
                          />
                          <span className="small">{edit.text.until} s</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <OverlaysPanel c={changes} total={total} t={t} selected={overlay} onSelect={setOverlay} onSeek={player.seek} />
                </>
              )}

              {tab === 'captions' && (
                <>
                  <Choices label="Style" options={CAPTION_STYLES} value={look.captionStyle} name={(v) => CAPTION_STYLE_LABEL[v]} onPick={(v) => change({ look: { ...look, captionStyle: v } })} />
                  <div className={styles.row}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={clipNow === null || edit.captions.length >= 100}
                      onClick={() => {
                        if (clipNow === null) return;
                        const added = addCaption(edit.captions, clipNow, duration);
                        change({ captions: added.captions });
                        setCaption(added.index);
                      }}
                    >
                      <Plus size={15} aria-hidden />
                      Add at the playhead
                    </button>
                    {clip.transcript && clip.transcript.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => {
                          const found = captionsFromTranscript(clip.transcript ?? [], keepOfSequence(sequence));
                          if (found.length === 0) return setProblem('Nothing said in the parts of the clip used was heard.');
                          setProblem(null);
                          change({ captions: found });
                          setCaption(null);
                          toast(`${found.length} caption${found.length === 1 ? '' : 's'} from the clip’s speech: check them against what is said`);
                        }}
                      >
                        <AudioLines size={15} aria-hidden />
                        From the clip’s speech
                      </button>
                    )}
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => subtitles.current?.click()}>
                      <Upload size={15} aria-hidden />
                      Import SRT or VTT
                    </button>
                    <input
                      ref={subtitles}
                      type="file"
                      accept=".srt,.vtt,text/vtt,application/x-subrip,text/plain"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const found = parseSubtitles(await file.text()).filter((c) => c.start < duration);
                        if (found.length === 0) return setProblem('No captions could be read from that file.');
                        setProblem(null);
                        change({ captions: found.map((c) => ({ ...c, end: Math.min(c.end, duration) })) });
                        setCaption(null);
                        toast(`${found.length} caption${found.length === 1 ? '' : 's'} imported`);
                      }}
                    />
                  </div>
                  {edit.captions.length === 0 ? (
                    <p className="muted small">Captions show what is said, for the many who watch with the sound off. They follow the run’s clip, so they show wherever a piece of it plays, and never over a picture or another video.</p>
                  ) : (
                    <ol className={styles.captionList}>
                      {edit.captions.map((c, i) => (
                        <li key={i} className={cx(styles.captionItem, i === caption && styles.captionItemOn)}>
                          <div className={styles.captionTimes}>
                            <label>
                              From{' '}
                              <input
                                className="input"
                                type="number"
                                min={0}
                                max={duration}
                                step={0.1}
                                value={c.start}
                                aria-label={`Caption ${i + 1} starts at, in seconds of the clip`}
                                onFocus={() => setCaption(i)}
                                onBlur={settle}
                                onChange={(e) => {
                                  const start = Math.min(Math.max(0, Number(e.target.value)), c.end - 0.1);
                                  if (Number.isFinite(start)) typeCaptionAt(i, { start: Math.round(start * 1000) / 1000 });
                                }}
                              />
                            </label>
                            <label>
                              to{' '}
                              <input
                                className="input"
                                type="number"
                                min={0}
                                max={duration}
                                step={0.1}
                                value={c.end}
                                aria-label={`Caption ${i + 1} ends at, in seconds of the clip`}
                                onFocus={() => setCaption(i)}
                                onBlur={settle}
                                onChange={(e) => {
                                  const end = Math.max(Math.min(duration, Number(e.target.value)), c.start + 0.1);
                                  if (Number.isFinite(end)) typeCaptionAt(i, { end: Math.round(end * 1000) / 1000 });
                                }}
                              />
                            </label>
                            <span className="small">s</span>
                            <button type="button" className="icon-btn icon-btn-plain" aria-label={`Remove caption ${i + 1}`} onClick={() => change({ captions: edit.captions.filter((_, j) => j !== i) })}>
                              <Trash2 size={15} aria-hidden />
                            </button>
                          </div>
                          <input
                            className="input"
                            value={c.text}
                            placeholder="What is said"
                            maxLength={TEXT_LIMITS.caption}
                            aria-label={`Caption ${i + 1}`}
                            onFocus={() => {
                              setCaption(i);
                              const at = timeOfClipSecond(placed, c.start);
                              if (at !== null) player.seek(at);
                            }}
                            onBlur={settle}
                            onChange={(e) => typeCaptionAt(i, { text: e.target.value })}
                          />
                        </li>
                      ))}
                    </ol>
                  )}
                  {selected && (
                    <div className={styles.row}>
                      <button type="button" className="btn btn-quiet btn-sm" disabled={clipNow === null} onClick={() => caption !== null && clipNow !== null && setCaptionAt(caption, { start: Math.min(Math.round(clipNow * 1000) / 1000, selected.end - 0.1) })}>
                        Start at the playhead
                      </button>
                      <button type="button" className="btn btn-quiet btn-sm" disabled={clipNow === null} onClick={() => caption !== null && clipNow !== null && setCaptionAt(caption, { end: Math.max(Math.round(clipNow * 1000) / 1000, selected.start + 0.1) })}>
                        End at the playhead
                      </button>
                    </div>
                  )}
                </>
              )}

              {tab === 'frame' && (
                <>
                  <div className="field">
                    <span className="label">Shape</span>
                    <div className={styles.choices} role="radiogroup" aria-label="Shape">
                      {ASPECTS.map((a) => (
                        <button key={a} type="button" role="radio" aria-checked={edit.aspect === a} className={cx(styles.choice, edit.aspect === a && styles.choiceOn)} onClick={() => change({ aspect: a })}>
                          {ASPECT_INFO[a].label}
                          <small>{ASPECT_INFO[a].use}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  {edit.aspect !== 'original' && (
                    <div className="field">
                      <span className="label">Picture</span>
                      <div className={styles.choices} role="radiogroup" aria-label="Picture">
                        <button type="button" role="radio" aria-checked={edit.fit === 'fill'} className={cx(styles.choice, edit.fit === 'fill' && styles.choiceOn)} onClick={() => change({ fit: 'fill' })}>
                          Fill
                          <small>Crop to the shape</small>
                        </button>
                        <button type="button" role="radio" aria-checked={edit.fit === 'fit'} className={cx(styles.choice, edit.fit === 'fit' && styles.choiceOn)} onClick={() => change({ fit: 'fit' })}>
                          Fit
                          <small>All of it, on indigo</small>
                        </button>
                      </div>
                    </div>
                  )}
                  {crops && (
                    <div className="field">
                      <span className="label" id="focus-label">
                        Keep in view
                      </span>
                      <div
                        className={styles.focusPad}
                        style={{ aspectRatio: `${clip.width} / ${clip.height}` }}
                        role="group"
                        aria-labelledby="focus-label"
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          history.preview({ ...edit, focus: setFocus(e) });
                        }}
                        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && history.preview({ ...edit, focus: setFocus(e) })}
                        onPointerUp={(e) => history.settle({ ...edit, focus: setFocus(e) })}
                      >
                        <span className={styles.focusDot} style={{ left: `${edit.focus.x * 100}%`, top: `${edit.focus.y * 100}%` }} />
                      </div>
                      <span className="muted small">Click where the crop of the run’s clip should stay: a face, a product, the words on screen. Other videos and pictures are cropped about their middle.</span>
                    </div>
                  )}
                  <div className="field">
                    <span className="label">Logo</span>
                    <div className={styles.choices} role="radiogroup" aria-label="Logo">
                      <button type="button" role="radio" aria-checked={edit.logo === null} className={cx(styles.choice, edit.logo === null && styles.choiceOn)} onClick={() => change({ logo: null })}>
                        None
                      </button>
                      {CORNERS.map((c) => (
                        <button key={c} type="button" role="radio" aria-checked={edit.logo === c} className={cx(styles.choice, edit.logo === c && styles.choiceOn)} onClick={() => history.set({ ...placeAt(edit, LOGO, null), logo: c })}>
                          {CORNER_LABEL[c]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className={styles.row}>
                    <input type="checkbox" checked={look.progressBar} onChange={(e) => change({ look: { ...look, progressBar: e.target.checked } })} />
                    <span>A progress bar along the bottom</span>
                  </label>
                  <div className="field">
                    <span className="label">Cover</span>
                    <div className={styles.row}>
                      <span className="muted small">The frame at {clock(edit.cover)} shows before the video plays.</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ cover: Math.round(Math.min(t, total - 0.05) * 1000) / 1000 })}>
                        Use this frame
                      </button>
                    </div>
                  </div>
                  <div className={styles.section}>
                    <label className={styles.row}>
                      <input type="checkbox" checked={edit.endCard !== null} onChange={(e) => change({ endCard: e.target.checked ? { text: END_CARD.text, seconds: END_CARD.seconds } : null })} />
                      <span>End on a card with the call to action</span>
                    </label>
                    {edit.endCard && (
                      <>
                        <label className="field">
                          <span className="label">Card words</span>
                          <input
                            className="input"
                            value={edit.endCard.text}
                            maxLength={TEXT_LIMITS.endCard}
                            onBlur={settle}
                            onChange={(e) => history.preview({ ...edit, endCard: { text: e.target.value, seconds: edit.endCard?.seconds ?? END_CARD.seconds } })}
                          />
                          <span className="muted small">Under the mark, with {brand.website} below. Every ad ends on the free consultation.</span>
                        </label>
                        <div className={styles.row}>
                          <input
                            className={styles.range}
                            type="range"
                            min={END_CARD.min}
                            max={END_CARD.max}
                            step={0.5}
                            value={edit.endCard.seconds}
                            aria-label="Seconds the end card shows"
                            onChange={(e) => history.preview({ ...edit, endCard: { text: edit.endCard?.text ?? END_CARD.text, seconds: Number(e.target.value) } })}
                            onPointerUp={settle}
                            onKeyUp={settle}
                          />
                          <span className="small">{edit.endCard.seconds} s</span>
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => player.seek(sequenceEnd + 0.5)}>
                          Show the end card
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {tab === 'sound' && <SoundPanel c={changes} onPickMusic={() => musicPicker.current?.click()} adding={adding !== null} />}
            </div>
          </div>
        </div>

        {flags.length > 0 && (
          <div className={styles.flags} role="note">
            <TriangleAlert size={15} aria-hidden />
            <div>
              <strong>Check before approving</strong>
              <ul>
                {flags.map((f) => (
                  <li key={f}>{describeWarning(f)}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <footer className={styles.dialogFoot}>
        {leaving ? (
          <>
            <p className={styles.footNote} role="alert">
              Close without saving your changes?
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => setLeaving(false)}>
              Keep editing
            </button>
            <button type="button" className="btn btn-primary" onClick={close}>
              Close without saving
            </button>
          </>
        ) : (
          <>
            {busy === 'exporting' ? (
              <div className={styles.footNote} aria-live="polite">
                {progress === null ? 'Fetching the files…' : `Making the video… ${Math.round(progress * 100)}%`}
                <span className={styles.progress} aria-hidden>
                  <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
                </span>
              </div>
            ) : (
              <p className={styles.footNote} role={problem ? 'alert' : undefined}>
                {problem ?? exported ?? `${ASPECT_INFO[edit.aspect].label} · ${size.width}×${size.height} · ${length(total)} · ${sequence.length} piece${sequence.length === 1 ? '' : 's'}`}
              </p>
            )}
            <button type="button" className="btn btn-quiet" onClick={() => history.set(defaultEdit(duration))} disabled={busy !== null || isUntouched(saving, duration)}>
              <RotateCcw size={15} aria-hidden />
              Whole clip, no edits
            </button>
            {busy === 'exporting' ? (
              <button type="button" className="btn btn-ghost" onClick={() => exporting.current?.abort()}>
                Stop
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => void exportVideo()} disabled={!url || busy !== null || adding !== null}>
                <Download size={16} aria-hidden />
                Export video
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy !== null || adding !== null || !changed} aria-busy={busy === 'saving'}>
              {busy === 'saving' ? 'Saving…' : variant ? 'Save' : 'Use this edit'}
            </button>
          </>
        )}
      </footer>
    </dialog>
  );
}

/** The edit a variant has, else the one made as its clip was uploaded, else the whole clip. */
export const editOf = (variant: Variant, clip: Clip): VideoEdit => variant.videoEdit ?? clip.edit ?? defaultEdit(clip.duration);
