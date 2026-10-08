'use client';

import { Download, Pause, Play, Plus, Redo2, RotateCcw, Scissors, Trash2, TriangleAlert, Undo2, Upload, X as Close } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { saveVariantAction, saveVideoEditAction } from '@/app/(app)/content/actions';
import { cx } from '@/lib/cx';
import { LIMITS } from '@/lib/edit-input';
import { describeWarning, guardrailWarnings, videoWarnings } from '@/lib/guardrails';
import type { Clip, Platform, Variant } from '@/lib/types';
import { drawFrame } from '@/lib/video/draw';
import {
  addCaption,
  ASPECT_INFO,
  ASPECTS,
  clock,
  CORNERS,
  defaultEdit,
  END_CARD,
  editedSeconds,
  editedTimeAt,
  frameSize,
  gapAt,
  isUntouched,
  keptSeconds,
  length,
  parseSubtitles,
  partIndexAt,
  removePart,
  restoreGap,
  splitAt,
  TEXT_LIMITS,
  TEXT_PLACES,
} from '@/lib/video/edit';
import type { Caption, Corner, VideoEdit } from '@/lib/video/edit';
import { RenderError } from '@/lib/video/errors';
import { useToast } from '../ui/Toast';
import { editedAt, useMoment, useUndoable } from './player';
import { coverMoment, useEditedVideo } from './useEditedVideo';
import { useFilmstrip } from './useFilmstrip';
import { Timeline } from './Timeline';
import styles from './video.module.css';

type Tab = 'frame' | 'words' | 'captions' | 'end' | 'sound';
const TABS: readonly (readonly [Tab, string])[] = [
  ['frame', 'Frame'],
  ['words', 'Words'],
  ['captions', 'Captions'],
  ['end', 'End card'],
  ['sound', 'Sound'],
];

const CORNER_LABEL: Record<Corner, string> = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right' };
const PLACE_LABEL = { top: 'Top', middle: 'Middle', bottom: 'Bottom' } as const;

const typing = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'video';

/** What the editor hands back when it saves: the variant as the server now holds it. */
export interface SavedVideo {
  videoEdit: VideoEdit | null;
  creativeText: string;
  warnings?: string[];
}

/**
 * The studio's video editor for one variant: cut the run's clip, frame it for
 * a platform, put the variant's words and captions on it, add the mark and an
 * end card, set the sound, and pick the cover. Edits are instructions saved
 * with the variant; Export makes the MP4 in this browser and downloads it.
 */
export function VideoEditor({
  variant,
  clip,
  url,
  brand,
  setTitle,
  platforms,
  onClose,
  onSaved,
}: {
  variant: Variant;
  clip: Clip;
  url: string | null;
  brand: { name: string; website: string };
  setTitle: string;
  platforms: Platform[];
  onClose: () => void;
  onSaved: (saved: SavedVideo) => void;
}) {
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const element = useRef<HTMLVideoElement>(null);
  const started = useMemo(() => variant.videoEdit ?? defaultEdit(clip.duration), [variant.videoEdit, clip.duration]);
  const history = useUndoable<VideoEdit>(started);
  const edit = history.value;
  const [words, setWords] = useState(variant.creative.text);
  const [tab, setTab] = useState<Tab>('frame');
  const [caption, setCaption] = useState<number | null>(null);
  const [busy, setBusy] = useState<'saving' | 'exporting' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const clipFile = useRef<Promise<Blob> | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Closing with changes not saved asks first, in the footer.
  const [leaving, setLeaving] = useState(false);
  const exporting = useRef<AbortController | null>(null);
  const subtitles = useRef<HTMLInputElement>(null);

  const size = useMemo(() => frameSize(edit, clip), [edit, clip]);
  // The preview is drawn at up to 720p; the export at full size from the same instructions.
  const previewSize = useMemo(() => frameSize(edit, clip, 720), [edit, clip]);
  const { player, src } = useEditedVideo(canvas, element, url, edit, previewSize, { words, brand });
  const moment = useMoment(player.clock);
  const duration = clip.duration;
  const parts = edit.keep;
  const onCard = moment.tailTime !== null;
  const index = onCard ? -1 : partIndexAt(parts, moment.clipTime);
  const gap = onCard ? null : gapAt(parts, moment.clipTime, duration);
  const canSplit = !onCard && splitAt(parts, moment.clipTime).length !== parts.length;
  const total = editedSeconds(edit);
  const at = editedAt(parts, moment);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  // Open on the cover, as the feed will show it.
  const { showAt } = player;
  useEffect(() => {
    showAt(coverMoment(started));
  }, [showAt, started]);

  useEffect(() => () => exporting.current?.abort(), []);

  const frames = useFilmstrip(src, duration);

  const change = (next: Partial<VideoEdit>) => history.set({ ...edit, ...next });
  const flags = [...guardrailWarnings(words, variant.copy, platforms).filter((f) => f.startsWith('image text')), ...videoWarnings(edit)];
  const changed = JSON.stringify(edit) !== JSON.stringify(started) || words.trim() !== variant.creative.text;

  function close() {
    if (changed && !leaving) return setLeaving(true);
    if (busy === 'exporting') exporting.current?.abort();
    onClose();
  }

  async function save() {
    const text = words.trim();
    if (!text) return setProblem('The video needs some words, or switch them off under Words.');
    if (text.length > LIMITS.creativeText) return setProblem(`Keep the words under ${LIMITS.creativeText} characters.`);
    setProblem(null);
    setBusy('saving');
    let warnings: string[] | undefined;
    if (text !== variant.creative.text) {
      const saved = await saveVariantAction(variant.id, { creativeText: text, copy: variant.copy });
      if (!saved.ok) {
        setBusy(null);
        return setProblem(saved.error);
      }
      warnings = saved.value.warnings;
    }
    const next = isUntouched(edit, duration) ? null : edit;
    const result = await saveVideoEditAction(variant.id, next);
    setBusy(null);
    if (!result.ok) return setProblem(result.error);
    onSaved({ videoEdit: next, creativeText: text, ...(warnings ? { warnings } : {}) });
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
      // The whole clip, once: reading a signed link in ranges needs headers Storage may not show the page.
      clipFile.current ??= fetch(src ?? url).then((r) => {
        if (!r.ok) throw new RenderError('The clip could not be downloaded. Reload the page to try again.');
        return r.blob();
      });
      const file = await clipFile.current.catch((err: unknown) => {
        clipFile.current = null;
        throw err instanceof RenderError ? err : new RenderError('The clip could not be downloaded. Check the connection and try again.');
      });
      if (controller.signal.aborted) return;
      setProgress(0);
      let shown = 0;
      const mark = new Image();
      mark.src = '/brand/qgr-mark.png';
      await mark.decode().catch(() => undefined);
      const frame = { name: brand.name, website: brand.website, mark: mark.complete && mark.naturalWidth > 0 ? mark : null };
      const { render, videoBitrate } = await import('@/lib/video/render');
      const { blob, target } = await render({
        source: file,
        keep: edit.keep,
        tail: edit.endCard?.seconds ?? 0,
        size,
        bitrate: videoBitrate(size, 30),
        volume: edit.volume,
        draw: (ctx, picture, time, clipTime) => drawFrame(ctx, size, picture, { edit, words: words.trim(), brand: frame, time, clipTime }),
        // Every frame reports; the editor redraws only for a new whole percent.
        onProgress: (share) => {
          const pct = Math.floor(share * 100);
          if (pct === shown) return;
          shown = pct;
          setProgress(share);
        },
        signal: controller.signal,
      });
      const name = `qgr-${slug(setTitle)}-${variant.label.toLowerCase()}-${edit.aspect === 'original' ? 'original' : edit.aspect.replace(':', 'x')}.${target.extension}`;
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

  function onKey(e: KeyboardEvent) {
    if (typing(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      player.toggle();
    } else if (!mod && (e.key === 's' || e.key === 'S') && canSplit) {
      e.preventDefault();
      change({ keep: splitAt(parts, moment.clipTime) });
    } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && index !== -1 && parts.length > 1) {
      e.preventDefault();
      change({ keep: removePart(parts, index) });
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
          <h2 id="editor-title">
            Edit video · Variant {variant.label}
          </h2>
          <p className="muted small">
            {variant.angle} · {clip.name}
          </p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={close}>
          <Close size={18} aria-hidden />
        </button>
      </header>

      <div className={styles.dialogBody}>
        <div className={styles.editor}>
          <div className={styles.editorMain}>
            <div className={styles.stage}>
              <video ref={element} className={styles.hiddenVideo} src={src ?? undefined} preload="auto" playsInline aria-hidden tabIndex={-1} onError={() => setProblem('The clip could not be loaded. Reload the page to try again.')} />
              {url ? (
                <canvas
                  ref={canvas}
                  width={previewSize.width}
                  height={previewSize.height}
                  role="img"
                  aria-label={`Preview: ${ASPECT_INFO[edit.aspect].label}, ${length(total)}`}
                  onClick={() => player.toggle()}
                />
              ) : (
                <p className={styles.stageMessage}>Sample data keeps no uploads, so this clip can’t be edited here.</p>
              )}
            </div>

            <div className={styles.controls}>
              <button type="button" className={styles.playButton} aria-label={player.playing ? 'Pause' : 'Play the video'} onClick={() => player.toggle()} disabled={!url}>
                {player.playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
              </button>
              <span className={styles.time}>
                <strong>{at === null ? 'Cut' : clock(at)}</strong> / {clock(total)}
                {onCard ? ' · end card' : ` · clip ${clock(moment.clipTime)}`}
              </span>
              <div className={styles.tools}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ keep: splitAt(parts, moment.clipTime) })} disabled={!canSplit} aria-keyshortcuts="S">
                  <Scissors size={15} aria-hidden />
                  Split
                </button>
                {gap ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ keep: restoreGap(parts, moment.clipTime, duration) })}>
                    <Plus size={15} aria-hidden />
                    Keep this part
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ keep: removePart(parts, index) })} disabled={index === -1 || parts.length < 2} aria-keyshortcuts="Delete">
                    <Trash2 size={15} aria-hidden />
                    Remove part
                  </button>
                )}
                <button type="button" className="icon-btn icon-btn-plain" aria-label="Undo" title="Undo" onClick={history.undo} disabled={!history.canUndo}>
                  <Undo2 size={17} aria-hidden />
                </button>
                <button type="button" className="icon-btn icon-btn-plain" aria-label="Redo" title="Redo" onClick={history.redo} disabled={!history.canRedo}>
                  <Redo2 size={17} aria-hidden />
                </button>
              </div>
            </div>

            <Timeline
              duration={duration}
              keep={parts}
              clock={player.clock}
              frames={frames}
              onSeek={player.seek}
              onKeep={(keep, done) => (done ? history.settle({ ...edit, keep }) : history.preview({ ...edit, keep }))}
              captions={edit.captions}
              selectedCaption={caption}
              onCaption={(i) => {
                setCaption(i);
                setTab('captions');
              }}
            />
            {edit.endCard && (
              <p className={styles.hint}>
                Then the end card for {edit.endCard.seconds} s.{' '}
                <button type="button" className={styles.linkButton} onClick={() => player.showAt({ clipTime: parts[parts.length - 1]?.end ?? 0, tailTime: 0.5 })}>
                  Show it
                </button>
              </p>
            )}
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
                      <span className="muted small">Click where the crop should stay: a face, a product, the words on screen.</span>
                    </div>
                  )}
                  <div className="field">
                    <span className="label">Logo</span>
                    <div className={styles.choices} role="radiogroup" aria-label="Logo">
                      <button type="button" role="radio" aria-checked={edit.logo === null} className={cx(styles.choice, edit.logo === null && styles.choiceOn)} onClick={() => change({ logo: null })}>
                        None
                      </button>
                      {CORNERS.map((c) => (
                        <button key={c} type="button" role="radio" aria-checked={edit.logo === c} className={cx(styles.choice, edit.logo === c && styles.choiceOn)} onClick={() => change({ logo: c })}>
                          {CORNER_LABEL[c]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span className="label">Cover</span>
                    <div className={styles.row}>
                      <span className="muted small">The frame at {clock(edit.cover)} shows before the video plays.</span>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={at === null} onClick={() => at !== null && change({ cover: Math.round(at * 1000) / 1000 })}>
                        Use this frame
                      </button>
                    </div>
                  </div>
                </>
              )}

              {tab === 'words' && (
                <>
                  <label className={styles.row}>
                    <input type="checkbox" checked={edit.text.show} onChange={(e) => change({ text: { ...edit.text, show: e.target.checked } })} />
                    <span>Show the variant’s words on the video</span>
                  </label>
                  <label className="field">
                    <span className="label">Words</span>
                    <input className="input" value={words} onChange={(e) => setWords(e.target.value)} maxLength={LIMITS.creativeText} disabled={!edit.text.show} />
                    <span className="muted small">The same words as the variant’s image, eight words at most reads best.</span>
                  </label>
                  <div className="field">
                    <span className="label">Where</span>
                    <div className={styles.choices} role="radiogroup" aria-label="Where the words go">
                      {TEXT_PLACES.map((p) => (
                        <button key={p} type="button" role="radio" aria-checked={edit.text.place === p} className={cx(styles.choice, edit.text.place === p && styles.choiceOn)} disabled={!edit.text.show} onClick={() => change({ text: { ...edit.text, place: p } })}>
                          {PLACE_LABEL[p]}
                        </button>
                      ))}
                    </div>
                  </div>
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
                </>
              )}

              {tab === 'captions' && (
                <>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={onCard || gap !== null || edit.captions.length >= 100}
                      onClick={() => {
                        const added = addCaption(edit.captions, moment.clipTime, duration);
                        change({ captions: added.captions });
                        setCaption(added.index);
                      }}
                    >
                      <Plus size={15} aria-hidden />
                      Add at the playhead
                    </button>
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
                    <p className="muted small">Captions show what is said, for the many who watch with the sound off. They follow the clip, so a cut takes its captions with it.</p>
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
                                aria-label={`Caption ${i + 1} starts at, in seconds`}
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
                                aria-label={`Caption ${i + 1} ends at, in seconds`}
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
                              if (editedTimeAt(parts, c.start) !== null) player.seek(c.start);
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
                      <button type="button" className="btn btn-quiet btn-sm" disabled={onCard} onClick={() => caption !== null && setCaptionAt(caption, { start: Math.min(Math.round(moment.clipTime * 1000) / 1000, selected.end - 0.1) })}>
                        Start at the playhead
                      </button>
                      <button type="button" className="btn btn-quiet btn-sm" disabled={onCard} onClick={() => caption !== null && setCaptionAt(caption, { end: Math.max(Math.round(moment.clipTime * 1000) / 1000, selected.start + 0.1) })}>
                        End at the playhead
                      </button>
                    </div>
                  )}
                </>
              )}

              {tab === 'end' && (
                <>
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
                      <div className="field">
                        <span className="label">How long</span>
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
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => player.showAt({ clipTime: parts[parts.length - 1]?.end ?? 0, tailTime: 0.5 })}>
                        Show the end card
                      </button>
                    </>
                  )}
                </>
              )}

              {tab === 'sound' && (
                <>
                  <label className={styles.row}>
                    <input type="checkbox" checked={edit.volume === 0} onChange={(e) => change({ volume: e.target.checked ? 0 : 1 })} />
                    <span>No sound</span>
                  </label>
                  <div className="field">
                    <span className="label">Volume</span>
                    <div className={styles.row}>
                      <input
                        className={styles.range}
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(edit.volume * 100)}
                        aria-label="Volume"
                        onChange={(e) => history.preview({ ...edit, volume: Number(e.target.value) / 100 })}
                        onPointerUp={settle}
                        onKeyUp={settle}
                      />
                      <span className="small">{Math.round(edit.volume * 100)}%</span>
                    </div>
                    <span className="muted small">Most people scroll with the sound off: captions carry the words when it is.</span>
                  </div>
                </>
              )}
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
            {progress === null ? 'Fetching the clip…' : `Making the video… ${Math.round(progress * 100)}%`}
            <span className={styles.progress} aria-hidden>
              <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </span>
          </div>
        ) : (
          <p className={styles.footNote} role={problem ? 'alert' : undefined}>
            {problem ?? exported ?? `${ASPECT_INFO[edit.aspect].label} · ${size.width}×${size.height} · ${length(total)}${keptSeconds(parts) < duration - 0.05 ? ` of a ${length(duration)} clip` : ''}`}
          </p>
        )}
        <button type="button" className="btn btn-quiet" onClick={() => history.set(defaultEdit(duration))} disabled={busy !== null || isUntouched(edit, duration)}>
          <RotateCcw size={15} aria-hidden />
          Whole clip, no edits
        </button>
        {busy === 'exporting' ? (
          <button type="button" className="btn btn-ghost" onClick={() => exporting.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => void exportVideo()} disabled={!url || busy !== null}>
            <Download size={16} aria-hidden />
            Export video
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy !== null || !changed}>
          {busy === 'saving' ? 'Saving…' : 'Save'}
        </button>
          </>
        )}
      </footer>
    </dialog>
  );
}

/** The edit a variant has, or the whole clip when it has none, kept as one object while nothing changes. */
export const editOf = (variant: Variant, clip: Clip): VideoEdit => variant.videoEdit ?? defaultEdit(clip.duration);

