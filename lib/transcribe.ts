// What is said in an uploaded clip, from Deepgram's speech-to-text. The
// agents cannot watch a clip, so its words are what they read; a person
// checks them before the run starts. Deepgram fetches the clip itself from a
// link the server signs for a few minutes, so the file never passes through
// the app. Off until DEEPGRAM_API_KEY is set: then the team types what is said.

import type { TranscriptLine } from './types';

export const MAX_LINES = 1000;
export const MAX_LINE = 200;

/** Short enough to read as a caption: about two seconds of speech, one sentence at most. */
const LINE_CHARS = 42;
const LINE_SECONDS = 4;

export type Transcribed = { ok: true; lines: TranscriptLine[] } | { ok: false; status: number; error: string };

export const transcriptionKey = (): string | null => process.env.DEEPGRAM_API_KEY?.trim() || null;

interface Word {
  word?: unknown;
  punctuated_word?: unknown;
  start?: unknown;
  end?: unknown;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Deepgram's answer as caption-sized lines in the clip's seconds: words are
 * gathered until a sentence ends, the line is long enough to read, or four
 * seconds have passed. Anything malformed is left out.
 */
export function linesFromDeepgram(json: unknown): TranscriptLine[] {
  const words = (json as { results?: { channels?: { alternatives?: { words?: Word[] }[] }[] } } | null)?.results?.channels?.[0]?.alternatives?.[0]?.words;
  if (!Array.isArray(words)) return [];
  const lines: TranscriptLine[] = [];
  let text = '';
  let start = 0;
  let end = 0;
  const flush = () => {
    const t = text.trim();
    if (t && end > start) lines.push({ start: round(start), end: round(end), text: t.slice(0, MAX_LINE) });
    text = '';
  };
  for (const w of words) {
    const said = typeof w.punctuated_word === 'string' ? w.punctuated_word : typeof w.word === 'string' ? w.word : '';
    if (!said || typeof w.start !== 'number' || typeof w.end !== 'number' || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end < w.start) continue;
    if (text && (text.length + said.length + 1 > LINE_CHARS || w.end - start > LINE_SECONDS)) flush();
    if (!text) start = w.start;
    text += `${text ? ' ' : ''}${said}`;
    end = w.end;
    if (/[.?!]$/.test(said)) flush();
    if (lines.length >= MAX_LINES) break;
  }
  flush();
  return lines.slice(0, MAX_LINES);
}

/** The words of a transcript as one text, for the run's notes. */
export const transcriptText = (lines: readonly TranscriptLine[]) => lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Asks Deepgram for the words in the clip at `url`. Model improvement is
 * opted out of: the team's clip is not Deepgram's to learn from.
 */
export async function transcribe(url: string, key: string, send: typeof fetch = fetch): Promise<Transcribed> {
  const query = new URLSearchParams({ model: 'nova-3', smart_format: 'true', detect_language: 'true', mip_opt_out: 'true' });
  let res: Response;
  try {
    res = await send(`https://api.deepgram.com/v1/listen?${query}`, {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return { ok: false, status: 504, error: 'The transcript took too long. Try again, or type what is said.' };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: 'Deepgram turned the key away: check DEEPGRAM_API_KEY.' };
  if (!res.ok) return { ok: false, status: 502, error: `Deepgram could not transcribe the clip (${res.status}).` };
  const lines = linesFromDeepgram(await res.json().catch(() => null));
  if (lines.length === 0) return { ok: false, status: 422, error: 'No speech was heard in the clip. Type what is said instead.' };
  return { ok: true, lines };
}
