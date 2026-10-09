// A video edit: what a person did to a clip, kept as instructions rather than
// a file. The cutter (before a run starts) and the studio's editor share this
// model, and the same instructions draw the live preview and the exported
// video (lib/video/draw.ts), so what is seen is what is exported. The clip
// itself is never changed.
//
// Two clocks. Times in `keep` and `captions` are the clip's own seconds, so a
// caption stays with the words it shows when the cut changes. `text.until` and
// `cover` are the edited video's seconds, counted from its first frame.

import type { ParseResult } from '../run-input';

/** The longest clip a run takes: ten minutes. The database holds the same limit. */
export const MAX_CLIP_SECONDS = 600;
export const MAX_PARTS = 50;
export const MAX_CAPTIONS = 100;
/** Shorter than this is a flicker, not a part. */
export const MIN_PART = 0.2;
/** How long a new caption stays up. */
export const CAPTION_SECONDS = 2.5;
export const TEXT_LIMITS = { caption: 200, endCard: 80 } as const;
export const END_CARD = { min: 1, max: 8, seconds: 3, text: 'Book your free consultation' } as const;

export const ASPECTS = ['original', '1:1', '4:5', '9:16', '16:9'] as const;
export type Aspect = (typeof ASPECTS)[number];

/** Each shape, and where it is used: the platforms' own recommendations. */
export const ASPECT_INFO: Record<Aspect, { label: string; ratio: number | null; use: string }> = {
  original: { label: 'Original', ratio: null, use: 'As recorded' },
  '1:1': { label: '1:1', ratio: 1, use: 'Any feed' },
  '4:5': { label: '4:5', ratio: 4 / 5, use: 'Meta feed' },
  '9:16': { label: '9:16', ratio: 9 / 16, use: 'Reels and Stories' },
  '16:9': { label: '16:9', ratio: 16 / 9, use: 'LinkedIn and X' },
};

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type Corner = (typeof CORNERS)[number];

export const TEXT_PLACES = ['top', 'middle', 'bottom'] as const;
export type TextPlace = (typeof TEXT_PLACES)[number];

/** A stretch of the clip, in its own seconds. */
export interface Part {
  start: number;
  end: number;
}

export interface Caption {
  start: number;
  end: number;
  text: string;
}

export interface VideoEdit {
  /** The parts of the clip kept, in order. Whatever lies between them is cut. */
  keep: Part[];
  aspect: Aspect;
  /** Fill crops the picture to the frame; fit shows all of it on the brand's indigo. */
  fit: 'fill' | 'fit';
  /** What a crop keeps in view, from 0 (left, top) to 1 (right, bottom). */
  focus: { x: number; y: number };
  /** The variant's words over the video. `until` is when they leave, in edited seconds; null keeps them up. */
  text: { show: boolean; place: TextPlace; until: number | null };
  captions: Caption[];
  logo: Corner | null;
  /** 0 is silent, 1 the clip as recorded. */
  volume: number;
  /** A closing card with the call to action, after the last part. */
  endCard: { text: string; seconds: number } | null;
  /** The frame a feed shows before the video plays, in edited seconds. */
  cover: number;
}

export interface Size {
  width: number;
  height: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
/** Times are kept to the millisecond: finer means nothing to a frame and only bloats the JSON. */
const ms = (t: number) => Math.round(t * 1000) / 1000;

// ---------------------------------------------------------------- the clock

export const wholeClip = (duration: number): Part[] => [{ start: 0, end: ms(duration) }];

export const keptSeconds = (keep: readonly Part[]): number => ms(keep.reduce((sum, p) => sum + (p.end - p.start), 0));

/** How long the edited video runs: the parts kept, then the end card. */
export const editedSeconds = (edit: Pick<VideoEdit, 'keep' | 'endCard'>): number => ms(keptSeconds(edit.keep) + (edit.endCard?.seconds ?? 0));

/** The clip's second that an edited second shows, or null past the last part (on the end card). */
export function clipTimeAt(keep: readonly Part[], t: number): number | null {
  let offset = 0;
  for (const part of keep) {
    const length = part.end - part.start;
    if (t < offset + length) return part.start + Math.max(0, t - offset);
    offset += length;
  }
  return null;
}

/** Where a clip second lands in the edited video, or null when that moment is cut. */
export function editedTimeAt(keep: readonly Part[], t: number): number | null {
  let offset = 0;
  for (const part of keep) {
    if (t >= part.start && t < part.end) return offset + (t - part.start);
    offset += part.end - part.start;
  }
  return null;
}

/**
 * For playing the clip with its cuts: null to carry on, the clip second to
 * jump to when playback has reached a cut, or 'end' after the last part.
 * `slack` jumps a frame early, because playback is checked once a frame.
 */
export function nextPlayable(keep: readonly Part[], t: number, slack = 0.03): number | 'end' | null {
  for (const part of keep) {
    if (part.end - slack <= t) continue;
    return t < part.start - slack ? part.start : null;
  }
  return 'end';
}

// ---------------------------------------------------------------- cutting

/** Splits the part under `t` in two. Nothing changes within MIN_PART of an edge. */
export function splitAt(keep: readonly Part[], t: number): Part[] {
  if (keep.length >= MAX_PARTS) return [...keep];
  const i = keep.findIndex((p) => t - p.start >= MIN_PART && p.end - t >= MIN_PART);
  const part = keep[i];
  if (!part) return [...keep];
  const at = ms(t);
  return [...keep.slice(0, i), { start: part.start, end: at }, { start: at, end: part.end }, ...keep.slice(i + 1)];
}

/** Cuts one part out. The last part cannot go: a video needs something in it. */
export function removePart(keep: readonly Part[], index: number): Part[] {
  if (keep.length <= 1 || !keep[index]) return [...keep];
  return keep.filter((_, i) => i !== index);
}

/** Moves one edge of a part, within its neighbours and the clip, keeping it at least MIN_PART long. */
export function moveEdge(keep: readonly Part[], index: number, edge: 'start' | 'end', t: number, duration: number): Part[] {
  const part = keep[index];
  if (!part) return [...keep];
  const before = keep[index - 1];
  const after = keep[index + 1];
  const moved =
    edge === 'start'
      ? { start: ms(clamp(t, before ? before.end : 0, part.end - MIN_PART)), end: part.end }
      : { start: part.start, end: ms(clamp(t, part.start + MIN_PART, after ? after.start : duration)) };
  return keep.map((p, i) => (i === index ? moved : p));
}

/** The cut stretch around `t`: from the part before it (or the clip's start) to the part after (or its end). */
export function gapAt(keep: readonly Part[], t: number, duration: number): Part | null {
  if (t < 0 || t > duration || editedTimeAt(keep, t) !== null) return null;
  let start = 0;
  for (const part of keep) {
    if (t < part.start) return part.start - start >= MIN_PART ? { start, end: part.start } : null;
    start = part.end;
  }
  return duration - start >= MIN_PART ? { start, end: ms(duration) } : null;
}

/** Puts a cut stretch back. */
export function restoreGap(keep: readonly Part[], t: number, duration: number): Part[] {
  const gap = gapAt(keep, t, duration);
  if (!gap || keep.length >= MAX_PARTS) return [...keep];
  return [...keep, gap].sort((a, b) => a.start - b.start);
}

/** Which part a clip second is in, or -1 when it is cut. */
export const partIndexAt = (keep: readonly Part[], t: number): number => keep.findIndex((p) => t >= p.start && t < p.end);

// ---------------------------------------------------------------- captions

const byStart = <T extends { start: number }>(list: readonly T[]): T[] => [...list].sort((a, b) => a.start - b.start);

/** The caption on screen at a clip second. When two overlap, the later one shows. */
export function captionAt(captions: readonly Caption[], t: number): Caption | null {
  let shown: Caption | null = null;
  for (const c of captions) if (t >= c.start && t < c.end) shown = c;
  return shown;
}

/** A new, empty caption at a clip second, ending before the next one so captions never overlap by accident. */
export function addCaption(captions: readonly Caption[], t: number, duration: number): { captions: Caption[]; index: number } {
  if (captions.length >= MAX_CAPTIONS || duration < MIN_PART) return { captions: [...captions], index: -1 };
  const start = ms(clamp(t, 0, duration - MIN_PART));
  const next = captions.find((c) => c.start > start);
  const end = ms(Math.max(start + MIN_PART, Math.min(start + CAPTION_SECONDS, next ? next.start : duration, duration)));
  const caption = { start, end, text: '' };
  const sorted = byStart([...captions, caption]);
  return { captions: sorted, index: sorted.indexOf(caption) };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const CUE = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function cueSeconds(stamp: string): number {
  const [clock = '', fraction = '0'] = stamp.split(/[.,]/);
  const units = clock.split(':').map(Number);
  const seconds = units.reduce((total, n) => total * 60 + n, 0);
  return seconds + Number(fraction.padEnd(3, '0')) / 1000;
}

/**
 * Captions from an SRT or WebVTT file, as video tools export them. Styling
 * tags are dropped and lines of one cue are joined; cues past the limits are
 * left out rather than refused.
 */
export function parseSubtitles(text: string): Caption[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const captions: Caption[] = [];
  for (let i = 0; i < lines.length && captions.length < MAX_CAPTIONS; i++) {
    const cue = CUE.exec(lines[i] ?? '');
    if (!cue?.[1] || !cue[2]) continue;
    const body: string[] = [];
    while (i + 1 < lines.length && (lines[i + 1] ?? '').trim() !== '') body.push(lines[++i] ?? '');
    const words = body
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/&(#\d+|[a-z]+);/gi, (whole, name: string) => (name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? whole)))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, TEXT_LIMITS.caption);
    const start = cueSeconds(cue[1]);
    const end = cueSeconds(cue[2]);
    if (words && end > start) captions.push({ start: ms(start), end: ms(end), text: words });
  }
  return byStart(captions);
}

// ---------------------------------------------------------------- the frame

/** Width over height of the edited video. */
export const aspectRatio = (aspect: Aspect, clip: Size): number => ASPECT_INFO[aspect].ratio ?? clip.width / clip.height;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * The edited video's size: the shape asked for, as sharp as the clip allows
 * and no longer than `longSide` (1080p by default). A fill takes the largest
 * box of that shape inside the picture, a fit the smallest box around it.
 * Sides are even, because H.264 needs them to be.
 */
export function frameSize(edit: Pick<VideoEdit, 'aspect' | 'fit'>, clip: Size, longSide = 1920): Size {
  const ratio = aspectRatio(edit.aspect, clip);
  const narrower = ratio < clip.width / clip.height;
  const byHeight = edit.fit === 'fill' ? narrower : !narrower;
  const width = byHeight ? clip.height * ratio : clip.width;
  const height = byHeight ? clip.height : clip.width / ratio;
  const scale = Math.min(1, longSide / Math.max(width, height));
  return { width: even(width * scale), height: even(height * scale) };
}

/** The part of the picture shown (s*) and the box in the frame it is drawn into (d*). */
export interface Placement {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function placePicture(edit: Pick<VideoEdit, 'fit' | 'focus'>, picture: Size, frame: Size): Placement {
  if (edit.fit === 'fill') {
    const scale = Math.max(frame.width / picture.width, frame.height / picture.height);
    const sw = frame.width / scale;
    const sh = frame.height / scale;
    return { sx: (picture.width - sw) * edit.focus.x, sy: (picture.height - sh) * edit.focus.y, sw, sh, dx: 0, dy: 0, dw: frame.width, dh: frame.height };
  }
  const scale = Math.min(frame.width / picture.width, frame.height / picture.height);
  const dw = picture.width * scale;
  const dh = picture.height * scale;
  return { sx: 0, sy: 0, sw: picture.width, sh: picture.height, dx: (frame.width - dw) / 2, dy: (frame.height - dh) / 2, dw, dh };
}

// ---------------------------------------------------------------- whole edits

/** A variant's video before anyone edits it: the whole clip, the variant's words at the top, the mark in a corner. */
export function defaultEdit(duration: number): VideoEdit {
  return {
    keep: wholeClip(duration),
    aspect: 'original',
    fit: 'fill',
    focus: { x: 0.5, y: 0.5 },
    text: { show: true, place: 'top', until: null },
    captions: [],
    logo: 'top-left',
    volume: 1,
    endCard: null,
    cover: 0,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** The kept parts, checked: in order, inside the clip, none overlapping or too short. A reason when they are not. */
function keepOf(raw: unknown, duration: number): Part[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'Keep at least one part of the clip.';
  if (raw.length > MAX_PARTS) return `Keep up to ${MAX_PARTS} parts.`;
  const keep: Part[] = [];
  for (const p of raw) {
    if (!isRecord(p) || !isNumber(p.start) || !isNumber(p.end)) return 'A kept part is not readable.';
    // Half a second of slack: a browser and the database can measure the same clip a little differently.
    if (p.start < 0 || p.end > duration + 0.5 || p.end - p.start < MIN_PART - 0.001) return 'A kept part is outside the clip.';
    const last = keep[keep.length - 1];
    if (last && p.start < last.end - 0.001) return 'The kept parts overlap.';
    keep.push({ start: ms(p.start), end: ms(Math.min(p.end, duration)) });
  }
  return keep;
}

function captionsOf(raw: unknown, duration: number): Caption[] | string {
  if (!Array.isArray(raw)) return 'The captions are not readable.';
  if (raw.length > MAX_CAPTIONS) return `Up to ${MAX_CAPTIONS} captions.`;
  const captions: Caption[] = [];
  for (const c of raw) {
    if (!isRecord(c) || !isNumber(c.start) || !isNumber(c.end) || typeof c.text !== 'string') return 'A caption is not readable.';
    const words = c.text.replace(/\s+/g, ' ').trim();
    if (words.length > TEXT_LIMITS.caption) return `Keep each caption under ${TEXT_LIMITS.caption} characters.`;
    if (c.start < 0 || c.end > duration + 0.5 || c.end <= c.start) return 'A caption is outside the clip.';
    // An empty caption shows nothing, so it is not kept.
    if (words) captions.push({ start: ms(c.start), end: ms(Math.min(c.end, duration)), text: words });
  }
  return byStart(captions);
}

function endCardOf(raw: unknown): VideoEdit['endCard'] | string {
  if (raw === null) return null;
  if (!isRecord(raw) || typeof raw.text !== 'string' || !isNumber(raw.seconds)) return 'The end card is not readable.';
  const words = raw.text.replace(/\s+/g, ' ').trim();
  if (!words) return 'The end card needs some words.';
  if (words.length > TEXT_LIMITS.endCard) return `Keep the end card under ${TEXT_LIMITS.endCard} characters.`;
  if (raw.seconds < END_CARD.min || raw.seconds > END_CARD.max) return `The end card shows for ${END_CARD.min} to ${END_CARD.max} seconds.`;
  return { text: words, seconds: ms(raw.seconds) };
}

/**
 * Validates an edit as the studio sends it. Server actions are public
 * endpoints, so this is the check that counts in the app; save_video_edit
 * checks what the database must hold true again.
 */
export function parseVideoEdit(raw: unknown, duration: number = MAX_CLIP_SECONDS): ParseResult<VideoEdit> {
  const fail = (error: string): ParseResult<VideoEdit> => ({ ok: false, error });
  if (!isRecord(raw)) return fail('The edit is not readable.');

  const keep = keepOf(raw.keep, duration);
  if (typeof keep === 'string') return fail(keep);

  const { aspect, fit, focus, text, logo, volume, cover } = raw;
  if (!isOneOf(ASPECTS, aspect)) return fail('Pick a shape for the video.');
  if (fit !== 'fill' && fit !== 'fit') return fail('Pick fill or fit.');
  if (!isRecord(focus) || !isNumber(focus.x) || !isNumber(focus.y)) return fail('The crop’s focus is not readable.');

  if (!isRecord(text) || typeof text.show !== 'boolean' || !isOneOf(TEXT_PLACES, text.place)) return fail('The words’ settings are not readable.');
  let until: number | null = null;
  if (text.until !== null) {
    if (!isNumber(text.until) || text.until <= 0) return fail('Say how long the words stay up.');
    until = ms(text.until);
  }

  const captions = captionsOf(raw.captions, duration);
  if (typeof captions === 'string') return fail(captions);

  if (logo !== null && !isOneOf(CORNERS, logo)) return fail('Pick a corner for the logo.');
  if (!isNumber(volume) || volume < 0 || volume > 1) return fail('The volume is not readable.');

  const endCard = endCardOf(raw.endCard);
  if (typeof endCard === 'string') return fail(endCard);

  if (!isNumber(cover) || cover < 0) return fail('The cover frame is not readable.');

  const edit: VideoEdit = {
    keep,
    aspect,
    fit,
    focus: { x: clamp(focus.x, 0, 1), y: clamp(focus.y, 0, 1) },
    text: { show: text.show, place: text.place, until },
    captions,
    logo,
    volume: Math.round(volume * 100) / 100,
    endCard,
    cover: 0,
  };
  // The cover is a frame of the video, so it can't be past its end.
  edit.cover = ms(clamp(cover, 0, Math.max(0, editedSeconds(edit) - 0.05)));
  return { ok: true, value: edit };
}

/** True when the edit is the clip as it is: nothing to save. */
export function isUntouched(edit: VideoEdit, duration: number): boolean {
  return JSON.stringify(edit) === JSON.stringify(defaultEdit(duration));
}

// ---------------------------------------------------------------- words

/** `1:05.3`, for the timeline: minutes, seconds and a tenth. */
export function clock(t: number): string {
  const tenths = Math.round(Math.max(0, t) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = tenths - minutes * 600;
  return `${minutes}:${String(Math.floor(rest / 10)).padStart(2, '0')}.${rest % 10}`;
}

/** `1:05`, for a duration: rounded to the second. */
export function length(t: number): string {
  const seconds = Math.round(Math.max(0, t));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Captions from what is said in the clip (its transcript, in the clip's own
 * seconds): every line that is heard in a kept part, cut to that part. A line
 * said in a cut part is not heard, so it has no caption.
 */
export function captionsFromTranscript(lines: readonly Caption[], keep: readonly Part[]): Caption[] {
  const captions: Caption[] = [];
  for (const line of lines) {
    const text = line.text.replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMITS.caption);
    if (!text) continue;
    for (const part of keep) {
      const start = Math.max(line.start, part.start);
      const end = Math.min(line.end, part.end);
      if (end - start >= 0.2 && captions.length < MAX_CAPTIONS) captions.push({ start: ms(start), end: ms(end), text });
    }
  }
  return byStart(captions);
}
