// Long videos: what the app accepts when one is kept (rule 4; create_long_video
// checks again), and the arithmetic of moments, all by transcript line. Pure,
// and tested.

import type { LongVideoFile, Moment, TranscriptLine } from './types';

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_LONG_SECONDS = 3 * 3600;
export const MAX_TRANSCRIPT_LINES = 8000;
export const MAX_LONG_TITLE = 120;
export const MAX_LONG_GUIDANCE = 2000;
/** A moment worth an ad: from 8 seconds to two and a half minutes. */
export const MIN_MOMENT_SECONDS = 8;
export const MAX_MOMENT_SECONDS = 150;

export interface NewLongVideo {
  title: string;
  file: LongVideoFile;
  transcript: TranscriptLine[];
  guidance?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim() : '');

/** A title from a file's name: `Q3 webinar (final).mp4` is `Q3 webinar (final)`. */
export const titleFromFile = (name: string) => name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').trim().slice(0, MAX_LONG_TITLE) || 'Long video';

export function parseLongVideo(raw: unknown): Parsed<NewLongVideo> {
  if (!isRecord(raw)) return { ok: false, error: 'Say which video this is.' };
  const title = tidy(raw.title).replace(/\s+/g, ' ');
  if (!title) return { ok: false, error: 'Name the video.' };
  if (title.length > MAX_LONG_TITLE) return { ok: false, error: `Keep the name under ${MAX_LONG_TITLE} characters.` };

  const f = raw.file;
  if (!isRecord(f) || !isNumber(f.duration) || !isNumber(f.size) || typeof f.name !== 'string') return { ok: false, error: 'The video’s file is not described.' };
  if (f.duration <= 0 || f.duration > MAX_LONG_SECONDS + 60) return { ok: false, error: 'A long video can be up to three hours.' };
  const file: LongVideoFile = {
    name: tidy(f.name).slice(0, 200) || 'video',
    size: Math.max(0, Math.round(f.size)),
    duration: Math.round(f.duration * 1000) / 1000,
    width: isNumber(f.width) ? Math.max(0, Math.round(f.width)) : 0,
    height: isNumber(f.height) ? Math.max(0, Math.round(f.height)) : 0,
  };

  if (!Array.isArray(raw.transcript) || raw.transcript.length === 0) return { ok: false, error: 'Nothing was heard in the video yet.' };
  if (raw.transcript.length > MAX_TRANSCRIPT_LINES) return { ok: false, error: 'The transcript is too long.' };
  const transcript: TranscriptLine[] = [];
  let previous = 0;
  for (const l of raw.transcript) {
    if (!isRecord(l) || !isNumber(l.start) || !isNumber(l.end) || typeof l.text !== 'string') return { ok: false, error: 'A transcript line is not readable.' };
    const text = tidy(l.text).replace(/\s+/g, ' ');
    if (!text || text.length > 200) return { ok: false, error: 'A transcript line is empty or too long.' };
    if (l.start < previous - 0.01 || l.end <= l.start || l.end > file.duration + 1) return { ok: false, error: 'A transcript line is outside the video.' };
    transcript.push({ start: l.start, end: l.end, text });
    previous = l.start;
  }

  const guidance = tidy(raw.guidance);
  if (guidance.length > MAX_LONG_GUIDANCE) return { ok: false, error: `Keep the direction under ${MAX_LONG_GUIDANCE.toLocaleString('en-US')} characters.` };
  return { ok: true, value: { title, file, transcript, ...(guidance ? { guidance } : {}) } };
}

/** The same file picked again: the same size to the byte and the same length within a second. */
export const sameFile = (known: LongVideoFile, picked: { size: number; duration: number }) => known.size === picked.size && Math.abs(known.duration - picked.duration) <= 1;

/** A moment's words, as one text. */
export const momentText = (transcript: readonly TranscriptLine[], first: number, last: number) =>
  transcript
    .slice(first, last + 1)
    .map((l) => l.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A moment's lines in the clip's own seconds, as captions for the clip cut from it. */
export const clipTranscript = (transcript: readonly TranscriptLine[], first: number, last: number): TranscriptLine[] => {
  const from = transcript[first]?.start ?? 0;
  const to = transcript[last]?.end ?? from;
  return transcript.slice(first, last + 1).map((l) => ({ start: round(Math.max(0, l.start - from)), end: round(Math.min(to, l.end) - from), text: l.text }));
};

const round = (n: number) => Math.round(n * 100) / 100;

/** A moment's lines with their times, as a moment of the team's own, or after a nudge. */
export function momentOf(transcript: readonly TranscriptLine[], first: number, last: number, from: Partial<Moment> = {}): Moment | null {
  const a = transcript[first];
  const b = transcript[last];
  if (!a || !b || last < first) return null;
  return {
    first,
    last,
    start: a.start,
    end: b.end,
    title: from.title ?? momentText(transcript, first, first).slice(0, 60),
    why: from.why ?? null,
    hook: from.hook ?? null,
    warnings: from.warnings ?? [],
    source: from.source ?? 'team',
    runIds: [],
  };
}

/**
 * A moment moved by a line at one end: `start` or `end`, earlier (-1) or later
 * (+1). It never turns inside out or leaves the transcript, and stays at most
 * MAX_MOMENT_SECONDS long; past that the nudge does nothing.
 */
export function nudge(transcript: readonly TranscriptLine[], moment: Moment, end: 'start' | 'end', by: -1 | 1): Moment {
  const first = end === 'start' ? moment.first + by : moment.first;
  const last = end === 'end' ? moment.last + by : moment.last;
  if (first < 0 || last >= transcript.length || last < first) return moment;
  const next = momentOf(transcript, first, last, moment);
  if (!next || next.end - next.start > MAX_MOMENT_SECONDS) return moment;
  return { ...next, runIds: moment.runIds, source: moment.source };
}

export const momentSeconds = (m: Pick<Moment, 'start' | 'end'>) => m.end - m.start;

/** A clock for a moment's place in the video: 4:05, 1:02:05. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * The sample data's moments, since no agent runs there: the transcript cut into
 * up to five stretches of about 30 to 60 seconds, spread across the video, each
 * named by its first words and marked as a sample.
 */
export function sampleMoments(transcript: readonly TranscriptLine[]): Moment[] {
  const out: Moment[] = [];
  const total = transcript.length;
  if (total === 0) return out;
  const starts = Array.from({ length: 5 }, (_, i) => Math.floor((i * total) / 5));
  for (const first of starts) {
    if (out.some((m) => first <= m.last)) continue;
    let last = first;
    while (last + 1 < total && (transcript[last + 1]!.end - transcript[first]!.start) <= 45) last += 1;
    const m = momentOf(transcript, first, last, { source: 'agent', title: `Sample moment: ${momentText(transcript, first, first).slice(0, 48)}`, why: 'A stretch the sample data picked by its place in the video, not by an agent.', hook: null });
    if (m && momentSeconds(m) >= MIN_MOMENT_SECONDS) out.push(m);
  }
  return out;
}

/**
 * What is said in an edit of the whole video, in the edited video's seconds:
 * each line of the transcript where a piece of the video plays it (a line cut
 * through is kept for the part that plays, if it is most of it), so the run
 * made from the edited file has its captions and notes.
 */
export function transcriptThroughEdit(transcript: readonly TranscriptLine[], placed: readonly { at: number; segment: { kind: string; media?: unknown; start?: number; end?: number; speed?: number } }[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const p of placed) {
    const s = p.segment;
    if (s.kind !== 'clip' || s.media !== null || s.start === undefined || s.end === undefined) continue;
    const speed = s.speed ?? 1;
    for (const l of transcript) {
      const from = Math.max(l.start, s.start);
      const to = Math.min(l.end, s.end);
      if (to - from < (l.end - l.start) / 2) continue;
      out.push({ start: Math.round((p.at + (from - s.start) / speed) * 100) / 100, end: Math.round((p.at + (to - s.start) / speed) * 100) / 100, text: l.text });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
