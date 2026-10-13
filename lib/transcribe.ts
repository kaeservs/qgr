// What is said in an uploaded clip, as caption-sized lines in the clip's own
// seconds. The agents cannot watch a clip, so its words are what they read; a
// person checks them before the run starts, and the editor turns them into
// captions. The words are heard in the browser (lib/speech.ts: Whisper, on
// the team's own computer, free), so nothing here calls a service.

import type { TranscriptLine } from './types';

export const MAX_LINES = 1000;
/** A long video's transcript: three hours of talk is about 6,000 lines. */
export const MAX_LONG_LINES = 8000;
export const MAX_LINE = 200;

/** Short enough to read as a caption: about two seconds of speech, one sentence at most. */
const LINE_CHARS = 42;
/** Speech runs at about fifteen characters a second: the length given a passage that has no end. */
const CHARS_PER_SECOND = 15;

/** A timed passage as Whisper hears it: [start, end] in seconds (the last end can be missing). */
export interface SpeechChunk {
  timestamp: [number, number | null];
  text: string;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** What Whisper writes for a stretch with no speech in it: [Music], (upbeat music), [BLANK_AUDIO]. */
const NOT_SPEECH = /^\s*(?:[[(][^\])]*[\])]\s*)+$/;

/** A passage's words in lines of at most LINE_CHARS, each ending at a sentence's end when one comes. */
function split(text: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > LINE_CHARS) {
      lines.push(line);
      line = '';
    }
    line += `${line ? ' ' : ''}${word}`;
    if (/[.?!]["'”’)]*$/.test(word)) {
      lines.push(line);
      line = '';
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => l.slice(0, MAX_LINE));
}

/**
 * Whisper's timed passages as caption-sized lines: each passage is split into
 * lines of at most 42 characters, ending early at a sentence's end, and its
 * time is shared among them by their length. A passage with no end runs to
 * the next one, or the clip's end, or as long as its words take to say.
 * Nothing runs past the clip's end (its sound can outlast its picture).
 * Bracketed noise ([Music]) and a line said again straight after itself (how
 * Whisper fills a silence) are left out, as is anything malformed.
 */
export function linesFromChunks(chunks: unknown, duration?: number, max = MAX_LINES): TranscriptLine[] {
  if (!Array.isArray(chunks)) return [];
  const passages = chunks.flatMap((c): { start: number; end: number | null; text: string }[] => {
    const chunk = c as Partial<SpeechChunk> | null;
    const ts = chunk?.timestamp;
    const text = typeof chunk?.text === 'string' ? chunk.text.trim() : '';
    if (!Array.isArray(ts) || typeof ts[0] !== 'number' || !Number.isFinite(ts[0]) || ts[0] < 0) return [];
    if (!text || NOT_SPEECH.test(text)) return [];
    if (duration !== undefined && ts[0] >= duration) return [];
    const end = typeof ts[1] === 'number' && Number.isFinite(ts[1]) ? ts[1] : null;
    return [{ start: ts[0], end, text }];
  });

  const lines: TranscriptLine[] = [];
  passages.forEach((p, i) => {
    const next = passages[i + 1]?.start;
    const said = p.start + p.text.length / CHARS_PER_SECOND;
    let end = p.end ?? next ?? (duration !== undefined && duration > p.start ? Math.min(duration, said) : said);
    if (end <= p.start) return;
    if (duration !== undefined && duration > p.start) end = Math.min(end, duration);
    const parts = split(p.text);
    const total = parts.reduce((n, l) => n + l.length, 0);
    let at = p.start;
    for (const text of parts) {
      const until = at + ((end - p.start) * text.length) / total;
      const previous = lines[lines.length - 1];
      if (previous?.text !== text && round(until) > round(at)) lines.push({ start: round(at), end: round(until), text });
      at = until;
    }
  });
  return lines.slice(0, max);
}

/** The words of a transcript as one text, for the run's notes. */
export const transcriptText = (lines: readonly TranscriptLine[]) => lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
