// "Write it from what's said here": an AI video's prompt, drafted by Claude
// from the transcript around the playhead, for a video that goes into an edit
// (inserted at that point, or over the video for a stretch). n8n ("QGR · AI
// video", its Prompt webhook) asks Claude and records what it spent; the
// person reads the draft, changes it as they like, and sees Higgsfield's price
// before anything is made. Nothing here spends credits.
//
// The lines are the team's own transcript (a long video's, or a clip's), read
// over by them when it was made: the browser sends the few around the point.

import { PIPELINE_SECRET_HEADER } from './supabase/config';
import type { PipelineConfig } from './supabase/config';
import type { TranscriptLine } from './types';
import { VIDEO_ASPECTS } from './ai-video';
import type { VideoAspect } from './ai-video';

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** What is said this many seconds either side of the point is what the video is about. */
export const CONTEXT_SECONDS = 45;
export const MAX_CONTEXT_LINES = 40;
export const MAX_IDEA = 400;
const MAX_LINE = 200;

export const PROMPT_MODES = ['insert', 'cover'] as const;
export type PromptMode = (typeof PROMPT_MODES)[number];

export interface VideoPromptRequest {
  /** The long video whose transcript it is, when it is one: what the call cost is kept against it. */
  longVideoId: string | null;
  /** In the clip's own seconds: where the video goes in, or where the stretch it covers starts. */
  at: number;
  /** How long the AI video runs. */
  seconds: number;
  aspect: VideoAspect;
  mode: PromptMode;
  /** The person's own idea for it, if any: "a student walking on a US campus". */
  idea: string;
  /** What is said around the point, each line with its time. */
  lines: TranscriptLine[];
}

const UUID = /^[0-9a-f-]{36}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The lines said within CONTEXT_SECONDS of `at` (a clip second), the nearest kept when there are too many. */
export function linesAround(transcript: readonly TranscriptLine[], at: number, until = at): TranscriptLine[] {
  const near = transcript.filter((l) => l.end >= at - CONTEXT_SECONDS && l.start <= until + CONTEXT_SECONDS);
  if (near.length <= MAX_CONTEXT_LINES) return near;
  const middle = (at + until) / 2;
  return [...near]
    .sort((a, b) => Math.abs((a.start + a.end) / 2 - middle) - Math.abs((b.start + b.end) / 2 - middle))
    .slice(0, MAX_CONTEXT_LINES)
    .sort((a, b) => a.start - b.start);
}

/** The request as the browser sends it, checked. */
export function parseVideoPromptRequest(raw: unknown): Parsed<VideoPromptRequest> {
  if (!isRecord(raw)) return { ok: false, error: 'The request is not readable.' };
  const longVideoId = typeof raw.longVideoId === 'string' && UUID.test(raw.longVideoId) ? raw.longVideoId : null;
  if (!isNumber(raw.at) || raw.at < 0) return { ok: false, error: 'Say where the video goes.' };
  if (!isNumber(raw.seconds) || raw.seconds < 3 || raw.seconds > 15) return { ok: false, error: 'An AI video runs 3 to 15 seconds.' };
  const aspect = (VIDEO_ASPECTS as readonly unknown[]).includes(raw.aspect) ? (raw.aspect as VideoAspect) : null;
  if (!aspect) return { ok: false, error: 'An AI video is 9:16, 1:1 or 16:9.' };
  const mode = (PROMPT_MODES as readonly unknown[]).includes(raw.mode) ? (raw.mode as PromptMode) : 'insert';
  const idea = clean(raw.idea, MAX_IDEA + 1);
  if (idea.length > MAX_IDEA) return { ok: false, error: `Keep your idea under ${MAX_IDEA} characters.` };
  const list = Array.isArray(raw.lines) ? raw.lines : [];
  if (list.length > MAX_CONTEXT_LINES) return { ok: false, error: 'Too many lines of the transcript.' };
  const lines: TranscriptLine[] = [];
  for (const l of list) {
    if (!isRecord(l) || !isNumber(l.start) || !isNumber(l.end)) return { ok: false, error: 'A line of the transcript is not readable.' };
    const text = clean(l.text, MAX_LINE);
    if (text) lines.push({ start: Math.round(l.start * 10) / 10, end: Math.round(l.end * 10) / 10, text });
  }
  if (lines.length === 0 && !idea) return { ok: false, error: 'Nothing is said here to write from: say what the video should show.' };
  return { ok: true, value: { longVideoId, at: Math.round(raw.at * 10) / 10, seconds: raw.seconds, aspect, mode, idea, lines } };
}

/** What n8n is sent: the request, and the brand's words, picture style and video rules (Brand memory) for the prompt to keep to. */
export interface VideoPromptPayload {
  long_video_id: string | null;
  at: number;
  seconds: number;
  aspect: VideoAspect;
  mode: PromptMode;
  idea: string;
  lines: TranscriptLine[];
  brand: { company: string; offer: string; audience: string; guardrails: string[]; look: string | null; rules: string[]; donts: string[] };
}

export type VideoPrompt = { ok: true; prompt: string; why: string } | { ok: false; error: string };

/** Asks n8n for a prompt. Claude answers in a few seconds; 45 at most. */
export async function askVideoPrompt(config: PipelineConfig, payload: VideoPromptPayload, send: typeof fetch = fetch): Promise<VideoPrompt> {
  let res: Response;
  try {
    res = await send(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [PIPELINE_SECRET_HEADER]: config.secret },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return { ok: false, error: 'n8n did not answer: the prompt could not be written. Write it yourself, or try again.' };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'n8n turned the request away: the webhook secret does not match.' };
  if (res.status === 404) return { ok: false, error: 'n8n has no live workflow at that webhook: publish “QGR · AI video”.' };
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok || !isRecord(body)) return { ok: false, error: `n8n answered ${res.status} without a prompt.` };
  if (body.ok !== true) return { ok: false, error: typeof body.error === 'string' && body.error ? body.error : 'Claude wrote no prompt.' };
  const prompt = clean(body.prompt, 2000);
  if (prompt.length < 20) return { ok: false, error: 'Claude wrote no prompt.' };
  return { ok: true, prompt, why: clean(body.why, 300) };
}
