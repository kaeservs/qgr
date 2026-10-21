// The timeline: a video edit as a sequence of pieces played one after another
// (parts of the run's clip, other videos, pictures, title cards), each with
// its effects and the transition into it, plus text laid over the whole and
// music under it. It is still instructions, never a file: the studio's
// preview and the export both draw every frame from it (lib/video/compose.ts),
// so what is seen is what is made.
//
// An edit made before the timeline (only `keep`) is the same sequence: one
// piece per kept part of the clip, cut straight from one to the next, with no
// effects. So every edit is read through `sequenceOf`, and nothing older
// changes how it looks.
//
// Clocks. A clip piece's `start` and `end` are its source's own seconds.
// Everything laid over the video (overlays, the words' `until`, the cover) is
// in timeline seconds, from the first frame. Captions stay in the run's clip
// seconds, as before, and show while a piece of that clip plays them.
//
// AI videos. A video Higgsfield made (or is making) is a file like any other
// here, named 'ai:<id>': a piece of the sequence (inserted at a point, so
// what follows plays later), or a cutaway: over the video for a stretch,
// while the sequence's sound goes on (B-roll over a talk). Its length and
// size are known before it is made, so the timeline is laid out at once and
// the preview shows it as on its way until the file is there.
//
// Pure, and tested (timeline.test.ts).

import { clampSpot, LOGO, parseSpot, WORDS } from '../spot';
import type { Spot } from '../spot';
import type { Caption, Part, VideoEdit } from './edit';


export const FILTERS = ['none', 'bw', 'warm', 'cool', 'vintage', 'vivid', 'fade', 'dramatic', 'noir', 'golden'] as const;
export type Filter = (typeof FILTERS)[number];
export const FILTER_LABEL: Record<Filter, string> = {
  none: 'None',
  bw: 'Black and white',
  warm: 'Warm',
  cool: 'Cool',
  vintage: 'Vintage',
  vivid: 'Vivid',
  fade: 'Faded',
  dramatic: 'Dramatic',
  noir: 'Noir',
  golden: 'Golden hour',
};

export const MOTIONS = ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down'] as const;
export type Motion = (typeof MOTIONS)[number];
export const MOTION_LABEL: Record<Motion, string> = {
  none: 'Still',
  'zoom-in': 'Slow zoom in',
  'zoom-out': 'Slow zoom out',
  'pan-left': 'Pan left',
  'pan-right': 'Pan right',
  'pan-up': 'Pan up',
  'pan-down': 'Pan down',
};

export const TRANSITIONS = ['cut', 'fade', 'dip-black', 'dip-white', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'wipe-left', 'wipe-right', 'zoom', 'circle', 'blur'] as const;
export type TransitionType = (typeof TRANSITIONS)[number];
export const TRANSITION_LABEL: Record<TransitionType, string> = {
  cut: 'Cut',
  fade: 'Cross-fade',
  'dip-black': 'Through black',
  'dip-white': 'Through white',
  'slide-left': 'Slide left',
  'slide-right': 'Slide right',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  'wipe-left': 'Wipe left',
  'wipe-right': 'Wipe right',
  zoom: 'Zoom',
  circle: 'Circle',
  blur: 'Blur',
};

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const TITLE_STYLES = ['brand', 'dark', 'light', 'gold'] as const;
export type TitleStyle = (typeof TITLE_STYLES)[number];
export const OVERLAY_STYLES = ['banner', 'plain', 'outline', 'highlight', 'lower-third'] as const;
export type OverlayStyle = (typeof OVERLAY_STYLES)[number];
export const OVERLAY_STYLE_LABEL: Record<OverlayStyle, string> = { banner: 'Banner', plain: 'Plain', outline: 'Outline', highlight: 'Highlight', 'lower-third': 'Lower third' };
export const ANIMATIONS = ['none', 'fade', 'pop', 'slide-up', 'typewriter'] as const;
export type Animation = (typeof ANIMATIONS)[number];
export const ANIMATION_LABEL: Record<Animation, string> = { none: 'None', fade: 'Fade', pop: 'Pop', 'slide-up': 'Slide up', typewriter: 'Typewriter' };
export const CAPTION_STYLES = ['box', 'bold', 'karaoke', 'minimal'] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export const CAPTION_STYLE_LABEL: Record<CaptionStyle, string> = { box: 'Boxed', bold: 'Bold', karaoke: 'Word by word', minimal: 'Minimal' };
export const TEXT_SIZES = ['small', 'medium', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const PLACES = ['top', 'middle', 'bottom'] as const;
export type Place = (typeof PLACES)[number];

export const MAX_SEGMENTS = 40;
export const MAX_OVERLAYS = 30;
export const MAX_CUTAWAYS = 20;
/** An ad, not a film: the edited video runs ten minutes at most. */
export const MAX_TIMELINE_SECONDS = 600;
export const MIN_PIECE = 0.3;
export const STILL_SECONDS = { min: 0.5, max: 30, default: 3 } as const;
export const TRANSITION_SECONDS = { min: 0.2, max: 2, default: 0.5 } as const;
export const TEXT_MAX = { title: 80, subtext: 120, overlay: 140 } as const;

/** A file the team added to the edit: another video, a picture or music, in Storage (edit-media) or, on the sample data, this tab. */
export interface MediaRef {
  path: string;
  name: string;
  /** A picture's or a video's size; 0 for music. */
  width: number;
  height: number;
  /** A video's or music's length, in its own seconds. */
  duration?: number;
}

export interface Effects {
  filter: Filter;
  /** -0.5 to 0.5: added to the picture's own. */
  brightness: number;
  contrast: number;
  /** -1 (grey) to 1 (twice as strong). */
  saturation: number;
  /** 1 as framed, up to 2: a punch-in. */
  zoom: number;
  motion: Motion;
  flip: boolean;
  /** Around a picture that is fitted rather than cropped: itself, blurred, instead of the brand's indigo. */
  blurFill: boolean;
  vignette: boolean;
  grain: boolean;
}

export interface Transition {
  type: TransitionType;
  seconds: number;
}

interface Base {
  id: string;
  effects: Effects;
  /** Into this piece from the one before; the first piece's is ignored. */
  transition: Transition;
}

export type Segment =
  | (Base & { kind: 'clip'; /** null: the run's own clip. */ media: MediaRef | null; start: number; end: number; speed: number; /** 0 to 1. */ volume: number })
  | (Base & { kind: 'image'; media: MediaRef; seconds: number })
  | (Base & { kind: 'title'; text: string; subtext: string; style: TitleStyle; seconds: number });

export interface Overlay {
  id: string;
  text: string;
  /** Timeline seconds. */
  start: number;
  end: number;
  place: Place;
  style: OverlayStyle;
  animation: Animation;
  size: TextSize;
  /** Where it sits once a person drags it, instead of its place, and its size. */
  spot?: Spot;
}

/**
 * Another video over the sequence for a stretch, its own sound silent: the
 * sequence's sound goes on under it (B-roll over a talk). Cutaways never
 * overlap one another.
 */
export interface Cutaway {
  id: string;
  /** A video: one the team added, or an AI video. */
  media: MediaRef;
  /** The timeline second it comes in at. */
  at: number;
  /** The part of its video that plays, in that video's own seconds. */
  start: number;
  end: number;
}

export interface Look {
  captionStyle: CaptionStyle;
  /** How the variant's words come in. */
  textAnimation: Animation;
  progressBar: boolean;
}

export interface Music {
  media: MediaRef;
  /** 0 to 1. */
  volume: number;
  /** Seconds. */
  fadeIn: number;
  fadeOut: number;
  /** Quieter while a clip with sound plays, so what is said is heard over it. */
  duck: boolean;
}

export const DEFAULT_EFFECTS: Effects = { filter: 'none', brightness: 0, contrast: 0, saturation: 0, zoom: 1, motion: 'none', flip: false, blurFill: false, vignette: false, grain: false };
export const CUT: Transition = { type: 'cut', seconds: 0 };
export const DEFAULT_LOOK: Look = { captionStyle: 'box', textAnimation: 'none', progressBar: false };

const ms = (t: number) => Math.round(t * 1000) / 1000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

let counter = 0;
/** A short id for a new piece or overlay: unique within an edit, which is all it needs. */
export const newId = (prefix = 's') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

// ---------------------------------------------------------------- reading an edit

/** Every edit as a sequence: its own, or one piece per kept part of the clip. */
export function sequenceOf(edit: Pick<VideoEdit, 'keep'> & { sequence?: Segment[] | undefined }): Segment[] {
  if (edit.sequence && edit.sequence.length > 0) return edit.sequence;
  return edit.keep.map((p, i) => ({ id: `k${i}`, kind: 'clip', media: null, start: p.start, end: p.end, speed: 1, volume: 1, effects: DEFAULT_EFFECTS, transition: CUT }));
}

export const lookOf = (edit: { look?: Look | undefined }): Look => edit.look ?? DEFAULT_LOOK;

/** How long a piece plays. */
export const pieceSeconds = (s: Segment): number => (s.kind === 'clip' ? (s.end - s.start) / s.speed : s.seconds);

/** A transition can be no longer than either piece it joins, less a little of each. */
const transitionSeconds = (s: Segment, before: Segment | undefined): number => {
  if (!before || s.transition.type === 'cut') return 0;
  return ms(clamp(s.transition.seconds, 0, Math.min(TRANSITION_SECONDS.max, pieceSeconds(s) - 0.1, pieceSeconds(before) - 0.1)));
};

export interface Placed {
  segment: Segment;
  index: number;
  /** Timeline seconds it starts and ends. */
  at: number;
  until: number;
  /** The transition into it, as long as it really is. */
  overlap: number;
}

/** Where every piece sits: each starts as the one before ends, less its transition, which they share. */
export function layout(sequence: readonly Segment[]): Placed[] {
  const out: Placed[] = [];
  let end = 0;
  sequence.forEach((segment, index) => {
    const overlap = transitionSeconds(segment, sequence[index - 1]);
    const at = ms(Math.max(0, end - overlap));
    const until = ms(at + pieceSeconds(segment));
    out.push({ segment, index, at, until, overlap });
    end = until;
  });
  return out;
}

export const sequenceSeconds = (placed: readonly Placed[]): number => placed[placed.length - 1]?.until ?? 0;

/** How long the edited video runs: the sequence, then the end card. */
export const timelineSeconds = (edit: VideoEdit): number => ms(sequenceSeconds(layout(sequenceOf(edit))) + (edit.endCard?.seconds ?? 0));

/** A piece on screen at a moment: its own second, and its source's (a clip's), or null for a still. */
export interface Showing {
  placed: Placed;
  local: number;
  source: number | null;
}

export interface FrameAt {
  /** The piece coming in, or the only one; null on the end card. */
  current: Showing | null;
  /** The piece going out during a transition. */
  previous: Showing | null;
  /** How far the transition is, 0 to 1; 1 when there is none. */
  progress: number;
  onEndCard: boolean;
}

const showing = (placed: Placed, t: number): Showing => {
  const local = clamp(t - placed.at, 0, placed.until - placed.at);
  const s = placed.segment;
  // A frame shows a clip a hair before its end, never past it.
  const source = s.kind === 'clip' ? Math.min(s.end - 0.001, s.start + local * s.speed) : null;
  return { placed, local, source };
};

/** What is on screen at timeline second `t`. */
export function frameAt(placed: readonly Placed[], t: number): FrameAt {
  const total = sequenceSeconds(placed);
  if (placed.length === 0 || t >= total) return { current: null, previous: null, progress: 1, onEndCard: true };
  let i = placed.findIndex((p) => t < p.until);
  if (i < 0) i = placed.length - 1;
  // The later of two overlapping pieces is the one coming in.
  const next = placed[i + 1];
  if (next && t >= next.at) i += 1;
  const current = placed[i]!;
  const before = placed[i - 1];
  if (before && current.overlap > 0 && t < current.at + current.overlap) {
    return { current: showing(current, t), previous: showing(before, t), progress: clamp((t - current.at) / current.overlap, 0, 1), onEndCard: false };
  }
  return { current: showing(current, t), previous: null, progress: 1, onEndCard: false };
}

/** The run's clip second whose captions show at `t`, or null while no piece of the run's clip plays. */
export function captionClockAt(frame: FrameAt): number | null {
  for (const s of [frame.current, frame.previous]) {
    if (s && s.placed.segment.kind === 'clip' && s.placed.segment.media === null) return s.source;
  }
  return null;
}

/** The kept parts of the run's clip, in order and merged: what the database checks, and what an older reader of the edit understands. */
export function keepOfSequence(sequence: readonly Segment[]): Part[] {
  const parts = sequence
    .filter((s): s is Extract<Segment, { kind: 'clip' }> => s.kind === 'clip' && s.media === null)
    .map((s) => ({ start: s.start, end: s.end }))
    .sort((a, b) => a.start - b.start);
  const merged: Part[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (last && p.start <= last.end) last.end = Math.max(last.end, p.end);
    else merged.push({ ...p });
  }
  return merged.map((p) => ({ start: ms(p.start), end: ms(p.end) }));
}

/** Every file the edit uses besides the run's clip: what has to be signed or downloaded to show or make it. */
export function mediaOf(edit: { sequence?: Segment[] | undefined; cutaways?: Cutaway[] | undefined; music?: Music | null | undefined }): MediaRef[] {
  const out = new Map<string, MediaRef>();
  for (const s of edit.sequence ?? []) if ((s.kind === 'clip' || s.kind === 'image') && s.media) out.set(s.media.path, s.media);
  for (const c of edit.cutaways ?? []) out.set(c.media.path, c.media);
  if (edit.music) out.set(edit.music.media.path, edit.music.media);
  return [...out.values()];
}

/** Whether this edit uses anything the timeline added: then it is saved with its sequence. */
export const isTimeline = (edit: Partial<Pick<VideoEdit, 'sequence' | 'overlays' | 'look' | 'music' | 'cutaways'>>) =>
  Boolean((edit.sequence && edit.sequence.length > 0) || (edit.overlays && edit.overlays.length > 0) || edit.look || edit.music || (edit.cutaways && edit.cutaways.length > 0));

// ---------------------------------------------------------------- AI videos

const AI = /^ai:([0-9a-z-]{1,36})$/;
/** An AI video's path in an edit. */
export const aiPath = (id: string) => `ai:${id}`;
/** The AI video a path names, or null for any other file. */
export const aiVideoOf = (path: string): string | null => AI.exec(path)?.[1] ?? null;
/** The AI videos an edit uses, by id. */
export const aiVideosOf = (edit: Parameters<typeof mediaOf>[0]): string[] =>
  mediaOf(edit)
    .map((m) => aiVideoOf(m.path))
    .filter((id): id is string => id !== null);

// ---------------------------------------------------------------- cutaways

export const cutawaySeconds = (c: Pick<Cutaway, 'start' | 'end'>) => c.end - c.start;

/** The cutaway over timeline second `t`, and the second of its own video showing, or null. */
export function cutawayAt(cutaways: readonly Cutaway[] | undefined, t: number): { cutaway: Cutaway; source: number } | null {
  for (const c of cutaways ?? []) {
    if (t >= c.at && t < c.at + cutawaySeconds(c)) return { cutaway: c, source: Math.min(c.end - 0.001, c.start + (t - c.at)) };
  }
  return null;
}

/**
 * Puts a cutaway in at `at`, as much of it as fits before the next one and
 * the end of the video (at least MIN_PIECE), the list kept in order. The list
 * unchanged when there is no room.
 */
export function addCutaway(cutaways: readonly Cutaway[], next: Cutaway, total: number): Cutaway[] {
  if (cutaways.length >= MAX_CUTAWAYS) return [...cutaways];
  const at = ms(clamp(next.at, 0, total));
  if (cutawayAt(cutaways, at)) return [...cutaways];
  const after = cutaways.filter((c) => c.at > at).reduce((min, c) => Math.min(min, c.at), total);
  const room = after - at;
  if (room < MIN_PIECE) return [...cutaways];
  const end = ms(Math.min(next.end, next.start + room));
  return [...cutaways, { ...next, at, end }].sort((a, b) => a.at - b.at);
}

/** Changes one cutaway, keeping it inside its video, the video and clear of the others. */
export function moveCutaway(cutaways: readonly Cutaway[], id: string, change: Partial<Pick<Cutaway, 'at' | 'start' | 'end'>>, total: number): Cutaway[] {
  const c = cutaways.find((x) => x.id === id);
  if (!c) return [...cutaways];
  const others = cutaways.filter((x) => x.id !== id);
  const length = c.media.duration ?? cutawaySeconds(c);
  const start = ms(clamp(change.start ?? c.start, 0, length - MIN_PIECE));
  let end = ms(clamp(change.end ?? c.end, start + MIN_PIECE, length));
  const before = others.filter((x) => x.at + cutawaySeconds(x) <= c.at + 0.001).reduce((max, x) => Math.max(max, x.at + cutawaySeconds(x)), 0);
  const after = others.filter((x) => x.at >= c.at).reduce((min, x) => Math.min(min, x.at), total);
  // Moved, it keeps its length and stops at its neighbours.
  const at = change.at === undefined ? c.at : ms(clamp(change.at, before, Math.max(before, after - (end - start))));
  end = ms(Math.min(end, start + (after - at)));
  if (end - start < MIN_PIECE - 0.001) return [...cutaways];
  return [...others, { ...c, at, start, end }].sort((a, b) => a.at - b.at);
}

export const removeCutaway = (cutaways: readonly Cutaway[], id: string): Cutaway[] => cutaways.filter((c) => c.id !== id);

/**
 * Puts a piece in at timeline second `t`: between two pieces when `t` is at
 * (or near) a join, otherwise the piece under it is split there and the new
 * one goes between its halves. What follows plays later by the new piece's
 * length.
 */
export function insertAt(sequence: readonly Segment[], piece: Segment, t: number): Segment[] {
  if (sequence.length >= MAX_SEGMENTS) return [...sequence];
  const placed = layout(sequence);
  const under = placed.find((p) => t >= p.at && t < p.until);
  if (!under) return [...sequence, piece];
  const local = t - under.at;
  const id = under.segment.id;
  if (local < MIN_PIECE) {
    const i = under.index;
    return [...sequence.slice(0, i), piece, ...sequence.slice(i)];
  }
  if (under.until - t < MIN_PIECE || sequence.length + 1 >= MAX_SEGMENTS) return insertPiece(sequence, piece, id);
  return insertPiece(splitPiece(sequence, id, local), piece, id);
}

// ---------------------------------------------------------------- changing a sequence

const replace = (sequence: readonly Segment[], id: string, next: (s: Segment) => Segment): Segment[] => sequence.map((s) => (s.id === id ? next(s) : s));

/** Splits a clip piece at its own second `local` into two, the second cut straight on from the first. */
export function splitPiece(sequence: readonly Segment[], id: string, local: number): Segment[] {
  if (sequence.length >= MAX_SEGMENTS) return [...sequence];
  const i = sequence.findIndex((s) => s.id === id);
  const s = sequence[i];
  if (!s) return [...sequence];
  const length = pieceSeconds(s);
  if (local < MIN_PIECE || length - local < MIN_PIECE) return [...sequence];
  let first: Segment;
  let second: Segment;
  if (s.kind === 'clip') {
    const at = ms(s.start + local * s.speed);
    first = { ...s, end: at };
    second = { ...s, id: newId(), start: at, transition: CUT };
  } else {
    first = { ...s, seconds: ms(local) };
    second = { ...s, id: newId(), seconds: ms(length - local), transition: CUT };
  }
  return [...sequence.slice(0, i), first, second, ...sequence.slice(i + 1)];
}

/** Takes a piece out. The last piece of the run's clip cannot go: an ad from a clip keeps some of it. */
export function removePiece(sequence: readonly Segment[], id: string): Segment[] {
  const s = sequence.find((x) => x.id === id);
  if (!s) return [...sequence];
  const ownClip = (x: Segment) => x.kind === 'clip' && x.media === null;
  if (ownClip(s) && sequence.filter(ownClip).length <= 1) return [...sequence];
  return sequence.filter((x) => x.id !== id);
}

/** Moves a piece one place earlier (-1) or later (+1). */
export function movePiece(sequence: readonly Segment[], id: string, by: -1 | 1): Segment[] {
  const i = sequence.findIndex((s) => s.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= sequence.length) return [...sequence];
  const copy = [...sequence];
  [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  return copy;
}

/** Puts a piece in after `afterId` (or at the end), when there is room. */
export function insertPiece(sequence: readonly Segment[], piece: Segment, afterId: string | null): Segment[] {
  if (sequence.length >= MAX_SEGMENTS) return [...sequence];
  const i = afterId === null ? -1 : sequence.findIndex((s) => s.id === afterId);
  if (i < 0) return [...sequence, piece];
  return [...sequence.slice(0, i + 1), piece, ...sequence.slice(i + 1)];
}

/** Moves a clip piece's start or end by `by` of its source's seconds, inside its source and at least MIN_PIECE long. */
export function trimPiece(sequence: readonly Segment[], id: string, edge: 'start' | 'end', to: number, sourceSeconds: number): Segment[] {
  return replace(sequence, id, (s) => {
    if (s.kind !== 'clip') return s;
    if (edge === 'start') return { ...s, start: ms(clamp(to, 0, s.end - MIN_PIECE * s.speed)) };
    return { ...s, end: ms(clamp(to, s.start + MIN_PIECE * s.speed, sourceSeconds)) };
  });
}

// ---------------------------------------------------------------- what a person drags

/** Where the words, the logo or a text sits once dragged; undefined while it keeps its place. */
export function spotIn(edit: VideoEdit, id: string): Spot | undefined {
  if (id === WORDS) return edit.text.spot;
  if (id === LOGO) return edit.logoSpot;
  return edit.overlays?.find((o) => o.id === id)?.spot;
}

/** Puts the words, the logo or a text at `spot`, or back in its place (null). */
export function placeAt(edit: VideoEdit, id: string, spot: Spot | null): VideoEdit {
  const at = spot ? clampSpot(spot) : null;
  if (id === WORDS) {
    const { spot: _was, ...text } = edit.text;
    return { ...edit, text: at ? { ...text, spot: at } : text };
  }
  if (id === LOGO) {
    const { logoSpot: _was, ...rest } = edit;
    return at ? { ...rest, logoSpot: at } : rest;
  }
  if (!edit.overlays?.some((o) => o.id === id)) return edit;
  return {
    ...edit,
    overlays: edit.overlays.map((o) => {
      if (o.id !== id) return o;
      const { spot: _was, ...rest } = o;
      return at ? { ...rest, spot: at } : rest;
    }),
  };
}

export const setEffects = (sequence: readonly Segment[], id: string, effects: Partial<Effects>): Segment[] => replace(sequence, id, (s) => ({ ...s, effects: { ...s.effects, ...effects } }));

export const setTransition = (sequence: readonly Segment[], id: string, transition: Partial<Transition>): Segment[] =>
  replace(sequence, id, (s) => {
    const next = { ...s.transition, ...transition };
    if (next.type === 'cut') return { ...s, transition: CUT };
    return { ...s, transition: { type: next.type, seconds: ms(clamp(next.seconds || TRANSITION_SECONDS.default, TRANSITION_SECONDS.min, TRANSITION_SECONDS.max)) } };
  });

export function setPiece(sequence: readonly Segment[], id: string, change: Partial<{ speed: number; volume: number; seconds: number; text: string; subtext: string; style: TitleStyle }>): Segment[] {
  return replace(sequence, id, (s) => {
    if (s.kind === 'clip') {
      return {
        ...s,
        ...(change.speed !== undefined && (SPEEDS as readonly number[]).includes(change.speed) ? { speed: change.speed } : {}),
        ...(change.volume !== undefined ? { volume: clamp(Math.round(change.volume * 100) / 100, 0, 1) } : {}),
      };
    }
    const seconds = change.seconds !== undefined ? { seconds: ms(clamp(change.seconds, STILL_SECONDS.min, STILL_SECONDS.max)) } : {};
    if (s.kind === 'image') return { ...s, ...seconds };
    return {
      ...s,
      ...seconds,
      ...(change.text !== undefined ? { text: change.text.slice(0, TEXT_MAX.title) } : {}),
      ...(change.subtext !== undefined ? { subtext: change.subtext.slice(0, TEXT_MAX.subtext) } : {}),
      ...(change.style ? { style: change.style } : {}),
    };
  });
}

/** Which piece is at timeline second `t`: the incoming one in a transition. */
export const pieceAt = (placed: readonly Placed[], t: number): Placed | null => frameAt(placed, t).current?.placed ?? null;

// ---------------------------------------------------------------- reading what the browser sends

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const words = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const ID = /^[a-z0-9]{1,24}$/i;
/** Where an added file can be: the team's own folder in edit-media, or (sample data) this tab. */
export const MEDIA_PATH = /^(media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov|mp3|m4a|aac|wav|ogg)|local:[0-9a-f-]{36}|ai:[0-9a-z-]{1,36})$/;

function mediaOfRaw(raw: unknown, kind: 'video' | 'image' | 'audio'): MediaRef | string {
  if (!isRecord(raw) || typeof raw.path !== 'string' || !MEDIA_PATH.test(raw.path)) return 'A file in the edit was not added here.';
  const ext = raw.path.split('.').pop() ?? '';
  const isLocal = raw.path.startsWith('local:');
  const isAi = aiVideoOf(raw.path) !== null;
  if (isAi && kind !== 'video') return 'An AI video can only be a video in the edit.';
  if (!isLocal && !isAi) {
    const ok = kind === 'image' ? ['jpg', 'png', 'webp'] : kind === 'video' ? ['mp4', 'webm', 'mov'] : ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'mp4', 'webm'];
    if (!ok.includes(ext)) return `That file isn’t ${kind === 'image' ? 'a picture' : kind === 'video' ? 'a video' : 'music'}.`;
  }
  const name = words(raw.name, 120) || 'File';
  const width = isNumber(raw.width) ? Math.max(0, Math.round(raw.width)) : 0;
  const height = isNumber(raw.height) ? Math.max(0, Math.round(raw.height)) : 0;
  const duration = isNumber(raw.duration) && raw.duration > 0 ? ms(raw.duration) : undefined;
  if (kind !== 'audio' && (width === 0 || height === 0)) return 'A file in the edit has no size.';
  if (kind !== 'image' && duration === undefined) return 'A file in the edit has no length.';
  return { path: raw.path, name, width, height, ...(duration !== undefined ? { duration } : {}) };
}

function effectsOf(raw: unknown): Effects {
  if (!isRecord(raw)) return DEFAULT_EFFECTS;
  return {
    filter: isOneOf(FILTERS, raw.filter) ? raw.filter : 'none',
    brightness: isNumber(raw.brightness) ? clamp(Math.round(raw.brightness * 100) / 100, -0.5, 0.5) : 0,
    contrast: isNumber(raw.contrast) ? clamp(Math.round(raw.contrast * 100) / 100, -0.5, 0.5) : 0,
    saturation: isNumber(raw.saturation) ? clamp(Math.round(raw.saturation * 100) / 100, -1, 1) : 0,
    zoom: isNumber(raw.zoom) ? clamp(Math.round(raw.zoom * 100) / 100, 1, 2) : 1,
    motion: isOneOf(MOTIONS, raw.motion) ? raw.motion : 'none',
    flip: raw.flip === true,
    blurFill: raw.blurFill === true,
    vignette: raw.vignette === true,
    grain: raw.grain === true,
  };
}

function transitionOf(raw: unknown): Transition {
  if (!isRecord(raw) || !isOneOf(TRANSITIONS, raw.type) || raw.type === 'cut') return CUT;
  return { type: raw.type, seconds: isNumber(raw.seconds) ? ms(clamp(raw.seconds, TRANSITION_SECONDS.min, TRANSITION_SECONDS.max)) : TRANSITION_SECONDS.default };
}

/**
 * The sequence as the studio sends it, checked: every piece readable and
 * inside its source, at least one piece of the run's clip, and the whole no
 * longer than MAX_TIMELINE_SECONDS. A reason when it is not.
 */
export function parseSequence(raw: unknown, clipSeconds: number): Segment[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'The video needs at least one piece.';
  if (raw.length > MAX_SEGMENTS) return `Up to ${MAX_SEGMENTS} pieces in a video.`;
  const out: Segment[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    if (!isRecord(r) || typeof r.id !== 'string' || !ID.test(r.id) || ids.has(r.id)) return 'A piece of the video is not readable.';
    ids.add(r.id);
    const base = { id: r.id, effects: effectsOf(r.effects), transition: transitionOf(r.transition) };
    if (r.kind === 'clip') {
      let media: MediaRef | null = null;
      if (r.media !== null) {
        const m = mediaOfRaw(r.media, 'video');
        if (typeof m === 'string') return m;
        media = m;
      }
      const length = media ? (media.duration ?? 0) : clipSeconds;
      if (!isNumber(r.start) || !isNumber(r.end) || r.start < 0 || r.end > length + 0.5 || r.end - r.start < MIN_PIECE - 0.001) return 'A piece of a clip is outside it.';
      const speed = isNumber(r.speed) && (SPEEDS as readonly number[]).includes(r.speed) ? r.speed : 1;
      const volume = isNumber(r.volume) ? clamp(Math.round(r.volume * 100) / 100, 0, 1) : 1;
      out.push({ ...base, kind: 'clip', media, start: ms(r.start), end: ms(Math.min(r.end, length)), speed, volume });
    } else if (r.kind === 'image') {
      const m = mediaOfRaw(r.media, 'image');
      if (typeof m === 'string') return m;
      if (!isNumber(r.seconds) || r.seconds < STILL_SECONDS.min || r.seconds > STILL_SECONDS.max) return `A picture shows for ${STILL_SECONDS.min} to ${STILL_SECONDS.max} seconds.`;
      out.push({ ...base, kind: 'image', media: m, seconds: ms(r.seconds) });
    } else if (r.kind === 'title') {
      const text = words(r.text, TEXT_MAX.title);
      if (!text) return 'A title card needs some words.';
      if (!isNumber(r.seconds) || r.seconds < STILL_SECONDS.min || r.seconds > STILL_SECONDS.max) return `A title card shows for ${STILL_SECONDS.min} to ${STILL_SECONDS.max} seconds.`;
      out.push({ ...base, kind: 'title', text, subtext: words(r.subtext, TEXT_MAX.subtext), style: isOneOf(TITLE_STYLES, r.style) ? r.style : 'brand', seconds: ms(r.seconds) });
    } else {
      return 'A piece of the video is not readable.';
    }
  }
  if (!out.some((s) => s.kind === 'clip' && s.media === null)) return 'Keep at least one piece of the run’s clip.';
  if (sequenceSeconds(layout(out)) > MAX_TIMELINE_SECONDS + 0.5) return 'Keep the video to ten minutes.';
  return out;
}

export function parseOverlays(raw: unknown, total: number): Overlay[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return 'The text on the video is not readable.';
  if (raw.length > MAX_OVERLAYS) return `Up to ${MAX_OVERLAYS} texts on a video.`;
  const out: Overlay[] = [];
  for (const r of raw) {
    if (!isRecord(r) || typeof r.id !== 'string' || !ID.test(r.id) || !isNumber(r.start) || !isNumber(r.end)) return 'A text on the video is not readable.';
    const text = words(r.text, TEXT_MAX.overlay);
    if (!text) continue;
    if (r.start < 0 || r.end <= r.start || r.start > total + 0.5) return 'A text on the video is outside it.';
    out.push({
      id: r.id,
      text,
      start: ms(r.start),
      end: ms(Math.min(r.end, total)),
      place: isOneOf(PLACES, r.place) ? r.place : 'middle',
      style: isOneOf(OVERLAY_STYLES, r.style) ? r.style : 'banner',
      animation: isOneOf(ANIMATIONS, r.animation) ? r.animation : 'fade',
      size: isOneOf(TEXT_SIZES, r.size) ? r.size : 'medium',
      ...(parseSpot(r.spot) ? { spot: parseSpot(r.spot) as Spot } : {}),
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The cutaways as the studio sends them: readable, inside their videos and the video, never overlapping. */
export function parseCutaways(raw: unknown, total: number): Cutaway[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return 'The videos over the video are not readable.';
  if (raw.length > MAX_CUTAWAYS) return `Up to ${MAX_CUTAWAYS} videos over the video.`;
  const out: Cutaway[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    if (!isRecord(r) || typeof r.id !== 'string' || !ID.test(r.id) || ids.has(r.id) || !isNumber(r.at) || !isNumber(r.start) || !isNumber(r.end)) return 'A video over the video is not readable.';
    ids.add(r.id);
    const media = mediaOfRaw(r.media, 'video');
    if (typeof media === 'string') return media;
    const length = media.duration ?? 0;
    if (r.start < 0 || r.end > length + 0.5 || r.end - r.start < MIN_PIECE - 0.001) return 'A video over the video is outside it.';
    if (r.at < 0 || r.at > total - MIN_PIECE + 0.5) return 'A video over the video starts past its end.';
    const at = ms(r.at);
    const end = ms(Math.min(r.end, length, r.start + (total - at)));
    out.push({ id: r.id, media, at, start: ms(r.start), end });
  }
  out.sort((a, b) => a.at - b.at);
  for (let i = 1; i < out.length; i++) {
    const before = out[i - 1]!;
    if (out[i]!.at < before.at + cutawaySeconds(before) - 0.01) return 'Two videos over the video overlap: move one.';
  }
  return out;
}

export function parseLook(raw: unknown): Look | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) return DEFAULT_LOOK;
  return {
    captionStyle: isOneOf(CAPTION_STYLES, raw.captionStyle) ? raw.captionStyle : 'box',
    textAnimation: isOneOf(ANIMATIONS, raw.textAnimation) ? raw.textAnimation : 'none',
    progressBar: raw.progressBar === true,
  };
}

export function parseMusic(raw: unknown): Music | null | string {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) return 'The music is not readable.';
  const media = mediaOfRaw(raw.media, 'audio');
  if (typeof media === 'string') return media;
  return {
    media,
    volume: isNumber(raw.volume) ? clamp(Math.round(raw.volume * 100) / 100, 0, 1) : 0.5,
    fadeIn: isNumber(raw.fadeIn) ? clamp(ms(raw.fadeIn), 0, 5) : 1,
    fadeOut: isNumber(raw.fadeOut) ? clamp(ms(raw.fadeOut), 0, 5) : 2,
    duck: raw.duck !== false,
  };
}

// ---------------------------------------------------------------- moving things on screen

/** Ease in and out, for anything that moves. */
export const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** How a piece's motion frames it at its own second: a zoom and a shift of the focus, both from 0 at its start to all of it at its end. */
export function motionAt(effects: Effects, local: number, length: number): { zoom: number; dx: number; dy: number } {
  const p = length > 0 ? clamp(local / length, 0, 1) : 0;
  const base = effects.zoom;
  switch (effects.motion) {
    case 'zoom-in':
      return { zoom: base * (1 + 0.15 * p), dx: 0, dy: 0 };
    case 'zoom-out':
      return { zoom: base * (1.15 - 0.15 * p), dx: 0, dy: 0 };
    case 'pan-left':
      return { zoom: base * 1.12, dx: 0.5 - p, dy: 0 };
    case 'pan-right':
      return { zoom: base * 1.12, dx: p - 0.5, dy: 0 };
    case 'pan-up':
      return { zoom: base * 1.12, dx: 0, dy: 0.5 - p };
    case 'pan-down':
      return { zoom: base * 1.12, dx: 0, dy: p - 0.5 };
    default:
      return { zoom: base, dx: 0, dy: 0 };
  }
}

/** The CSS filter a canvas draws a piece through: its preset, then its adjustments. */
export function filterOf(effects: Effects): string {
  const preset: Record<Filter, string> = {
    none: '',
    bw: 'grayscale(1)',
    warm: 'sepia(0.25) saturate(1.15) hue-rotate(-8deg)',
    cool: 'saturate(0.9) hue-rotate(12deg) brightness(1.03)',
    vintage: 'sepia(0.45) contrast(0.9) brightness(1.05) saturate(0.8)',
    vivid: 'saturate(1.45) contrast(1.1)',
    fade: 'contrast(0.85) brightness(1.1) saturate(0.8)',
    dramatic: 'contrast(1.35) saturate(0.85) brightness(0.92)',
    noir: 'grayscale(1) contrast(1.4) brightness(0.9)',
    golden: 'sepia(0.3) saturate(1.3) hue-rotate(-12deg) brightness(1.05)',
  };
  const parts = [preset[effects.filter]];
  if (effects.brightness) parts.push(`brightness(${ms(1 + effects.brightness)})`);
  if (effects.contrast) parts.push(`contrast(${ms(1 + effects.contrast)})`);
  if (effects.saturation) parts.push(`saturate(${ms(1 + effects.saturation)})`);
  return parts.filter(Boolean).join(' ') || 'none';
}

/** How much of a text is shown, and how it moves, `t` seconds after it comes in and `left` before it goes. */
export function animate(animation: Animation, t: number, left: number, length: number): { alpha: number; scale: number; dy: number; chars: number } {
  const IN = 0.4;
  const OUT = 0.3;
  const fadeOut = left < OUT ? clamp(left / OUT, 0, 1) : 1;
  const p = clamp(t / IN, 0, 1);
  switch (animation) {
    case 'fade':
      return { alpha: ease(p) * fadeOut, scale: 1, dy: 0, chars: length };
    case 'pop':
      return { alpha: Math.min(1, p * 2) * fadeOut, scale: p < 1 ? 0.6 + 0.5 * ease(p) - 0.1 * Math.sin(p * Math.PI) : 1, dy: 0, chars: length };
    case 'slide-up':
      return { alpha: ease(p) * fadeOut, scale: 1, dy: (1 - ease(p)) * 0.08, chars: length };
    case 'typewriter':
      return { alpha: fadeOut, scale: 1, dy: 0, chars: Math.min(length, Math.ceil(t * 28)) };
    default:
      return { alpha: 1, scale: 1, dy: 0, chars: length };
  }
}

/** The word of a caption being said at clip second `t`, by its share of the caption's time (for word-by-word captions). */
export function wordAt(caption: Caption, t: number): number {
  const count = caption.text.split(/\s+/).filter(Boolean).length;
  if (count === 0) return -1;
  const p = clamp((t - caption.start) / Math.max(0.001, caption.end - caption.start), 0, 0.9999);
  return Math.floor(p * count);
}

// ---------------------------------------------------------------- sound

/** A cut's sound fades over this, so it never clicks. */
const FADE = 0.008;
/** Music under someone speaking plays at this share of its volume. */
export const DUCK = 0.3;
const DUCK_RAMP = 0.3;

/** Whether a piece's own sound is heard: a clip at its own speed. A sped-up or slowed piece plays silent. */
export const hasSound = (s: Segment): s is Extract<Segment, { kind: 'clip' }> => s.kind === 'clip' && s.speed === 1 && s.volume > 0;

/**
 * How loud piece `i` is at timeline second `t`, 0 to 1: its volume and the
 * edit's, rising through the transition into it and falling through the one
 * out of it (a few milliseconds at a cut).
 */
export function pieceGainAt(placed: readonly Placed[], i: number, t: number, volume: number): number {
  const p = placed[i];
  if (!p || !hasSound(p.segment) || t < p.at || t > p.until) return 0;
  const next = placed[i + 1];
  const into = p.overlap > 0 ? p.overlap : FADE;
  const out = next && next.overlap > 0 ? next.overlap : FADE;
  return volume * p.segment.volume * clamp(Math.min((t - p.at) / into, (p.until - t) / out), 0, 1);
}

/** How much someone is speaking at `t`, 0 to 1, eased at the edges of the pieces with sound: what ducking follows. */
function speechAt(placed: readonly Placed[], t: number, volume: number): number {
  if (volume === 0) return 0;
  let most = 0;
  for (const p of placed) {
    if (!hasSound(p.segment) || t < p.at - DUCK_RAMP || t > p.until + DUCK_RAMP) continue;
    const inside = Math.min(t - (p.at - DUCK_RAMP), p.until + DUCK_RAMP - t) / DUCK_RAMP;
    most = Math.max(most, clamp(inside, 0, 1));
  }
  return most;
}

/** How loud the music is at timeline second `t` of a video `total` seconds long: its volume, faded in and out, lower while a clip speaks. */
export function musicGainAt(music: Music, placed: readonly Placed[], t: number, total: number, volume: number): number {
  if (t < 0 || t > total) return 0;
  const fadeIn = music.fadeIn > 0 ? clamp(t / music.fadeIn, 0, 1) : 1;
  const fadeOut = music.fadeOut > 0 ? clamp((total - t) / music.fadeOut, 0, 1) : 1;
  const duck = music.duck ? 1 - (1 - DUCK) * speechAt(placed, t, volume) : 1;
  return music.volume * fadeIn * fadeOut * duck;
}

/** The music's own second at timeline second `t`: it starts with the video and starts again when it runs out. */
export const musicSourceAt = (music: Music, t: number): number => {
  const length = music.media.duration ?? 0;
  return length > 0 ? t % length : t;
};

// ---------------------------------------------------------------- saving

const plainEffects = (e: Effects) => JSON.stringify(e) === JSON.stringify(DEFAULT_EFFECTS);

/**
 * The edit as it is saved: a sequence that is only the run's clip cut
 * straight on, in order, with nothing added, is kept as `keep` alone (what it
 * always was), and texts, look and music are kept only when there are some.
 * So an edit that uses nothing new reads exactly as before, and "no edits"
 * still compares equal to the whole clip.
 */
export function compactEdit(edit: VideoEdit): VideoEdit {
  const { sequence, overlays, look, music, cutaways, ...rest } = edit;
  const out: VideoEdit = { ...rest };
  if (sequence && sequence.length > 0) {
    const plain = sequence.every(
      (s, i) =>
        s.kind === 'clip' &&
        s.media === null &&
        s.speed === 1 &&
        s.volume === 1 &&
        plainEffects(s.effects) &&
        s.transition.type === 'cut' &&
        (i === 0 || (() => {
          const before = sequence[i - 1];
          return before?.kind === 'clip' && s.start >= before.end - 0.001;
        })()),
    );
    if (plain) out.keep = sequence.map((s) => (s.kind === 'clip' ? { start: s.start, end: s.end } : { start: 0, end: 0 }));
    else {
      out.sequence = sequence;
      out.keep = keepOfSequence(sequence);
    }
  }
  if (overlays && overlays.length > 0) out.overlays = overlays;
  if (look && JSON.stringify(look) !== JSON.stringify(DEFAULT_LOOK)) out.look = look;
  if (music) out.music = music;
  if (cutaways && cutaways.length > 0) out.cutaways = cutaways;
  return out;
}

/** A piece as a person names it in a list. */
export function pieceName(s: Segment): string {
  if (s.kind === 'title') return `Title: ${s.text}`;
  if (s.kind === 'image') return `Picture: ${s.media.name}`;
  return s.media ? `Video: ${s.media.name}` : 'Part of the clip';
}
