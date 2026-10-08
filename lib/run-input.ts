import { hostOf } from './format';
import { CUSTOM_SOURCES, GOALS, PLATFORMS } from './types';
import type { Clip, Goal, Platform, RunSource } from './types';
import { length, MAX_CLIP_SECONDS } from './video/edit';

export interface NewRunInput {
  source: RunSource;
  title?: string;
  platforms: Platform[];
  goal: Goal;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_UPLOADS = 10;
export const MIN_EXCERPT = 50;
export const MAX_EXCERPT = 20_000;
/** What is said in a clip: the agents' only way to know, so it can't be a word or two. */
export const MIN_NOTES = 20;
/** Supabase Free's limit for one file. The browser cuts and compresses a clip to fit under it. */
export const MAX_CLIP_BYTES = 50 * 1024 * 1024;
const MAX_TITLE = 120;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Where an uploaded clip is kept: the uploader's own folder, a fresh name, a video extension. */
export const CLIP_PATH = new RegExp(`^uploads/${UUID}/${UUID}\\.(mp4|webm|mov)$`);

/**
 * Accepts what people paste: `horizonvisa.com`, `www.x.com/...` or a full URL.
 * Anything that is not an ordinary public link is refused: another protocol, a
 * host without a dot, a bare IP address, a password in the link or an odd port.
 * The page reader checks again, against the address the name resolves to.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  // `horizonvisa.com:443/x` has a port, not a scheme: only `x://` or a known non-web scheme counts as one.
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) || /^(javascript|data|mailto|tel|file|blob|vbscript|about):/i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.startsWith('[')) return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  return url.toString();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= max;

/** An uploaded clip as the browser describes it. The database checks again that it exists. */
export function parseClip(raw: unknown): ParseResult<Clip> {
  if (!isRecord(raw)) return { ok: false, error: 'Add the clip first.' };
  if (typeof raw.path !== 'string' || !CLIP_PATH.test(raw.path)) return { ok: false, error: 'That clip was not uploaded here.' };
  const { duration } = raw;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return { ok: false, error: 'The clip’s length is not readable.' };
  if (duration > MAX_CLIP_SECONDS) return { ok: false, error: `Cut the clip to ${length(MAX_CLIP_SECONDS)} or less.` };
  if (!isCount(raw.width, 8192) || !isCount(raw.height, 8192)) return { ok: false, error: 'The clip’s size is not readable.' };
  if (!isCount(raw.size, MAX_CLIP_BYTES)) return { ok: false, error: 'The clip is over 50 MB.' };
  // A file name is shown on the run; anything that is not plain text is dropped.
  const name = (typeof raw.name === 'string' ? raw.name : '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) || 'Uploaded clip';
  return { ok: true, value: { path: raw.path, name, duration: Math.round(duration * 1000) / 1000, width: raw.width, height: raw.height, size: raw.size } };
}

function parseSource(raw: unknown): ParseResult<RunSource> {
  if (!isRecord(raw)) return { ok: false, error: 'Say what the run starts from.' };

  if (raw.kind === 'competitor') {
    if (raw.input === 'website' || raw.input === 'ad_link') {
      const url = typeof raw.url === 'string' ? normalizeUrl(raw.url) : null;
      if (!url) return { ok: false, error: 'Paste a full website or ad link, like horizonvisa.com.' };
      return { ok: true, value: { kind: 'competitor', input: raw.input, url } };
    }
    if (raw.input === 'upload') {
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) return { ok: false, error: 'Name the competitor these ads are from.' };
      if (name.length > MAX_TITLE) return { ok: false, error: 'That name is too long.' };
      const files = Array.isArray(raw.files) ? raw.files.filter((f): f is string => typeof f === 'string' && f.trim() !== '') : [];
      if (files.length === 0) return { ok: false, error: 'Add at least one ad to upload.' };
      if (files.length > MAX_UPLOADS) return { ok: false, error: `Upload up to ${MAX_UPLOADS} ads at a time.` };
      return { ok: true, value: { kind: 'competitor', input: 'upload', name, files } };
    }
    return { ok: false, error: 'Unknown competitor input.' };
  }

  if (raw.kind === 'custom') {
    if (!includes(CUSTOM_SOURCES, raw.type)) return { ok: false, error: 'Pick a podcast, blog post, video or text.' };
    if (raw.type === 'text') {
      const excerpt = typeof raw.excerpt === 'string' ? raw.excerpt.trim() : '';
      if (excerpt.length < MIN_EXCERPT) return { ok: false, error: `Paste at least ${MIN_EXCERPT} characters of text.` };
      if (excerpt.length > MAX_EXCERPT) return { ok: false, error: 'That text is too long. Paste the part that matters.' };
      return { ok: true, value: { kind: 'custom', type: 'text', excerpt } };
    }
    if (raw.type === 'video' && raw.clip !== undefined) {
      const clip = parseClip(raw.clip);
      if (!clip.ok) return clip;
      const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
      if (notes.length < MIN_NOTES) return { ok: false, error: `Say what is said in the clip, in at least ${MIN_NOTES} characters: the agents can’t watch it.` };
      if (notes.length > MAX_EXCERPT) return { ok: false, error: 'Those notes are too long. Keep the part that matters.' };
      return { ok: true, value: { kind: 'custom', type: 'video', clip: clip.value, notes } };
    }
    const url = typeof raw.url === 'string' ? normalizeUrl(raw.url) : null;
    if (!url) return { ok: false, error: 'Paste the full link to the episode, post or video.' };
    return { ok: true, value: { kind: 'custom', type: raw.type, url } };
  }

  return { ok: false, error: 'Unknown run type.' };
}

/** Validates a new-run request. The browser checks the same rules first; this is the one that counts. */
export function parseNewRun(body: unknown): ParseResult<NewRunInput> {
  if (!isRecord(body)) return { ok: false, error: 'The request was empty.' };

  const source = parseSource(body.source);
  if (!source.ok) return source;

  const platforms = Array.isArray(body.platforms) ? [...new Set(body.platforms.filter((p) => includes(PLATFORMS, p)))] : [];
  if (platforms.length === 0) return { ok: false, error: 'Pick at least one platform.' };

  if (!includes(GOALS, body.goal)) return { ok: false, error: 'Pick a goal.' };

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length > MAX_TITLE) return { ok: false, error: 'That run name is too long.' };

  return {
    ok: true,
    value: {
      source: source.value,
      platforms: PLATFORMS.filter((p) => platforms.includes(p)),
      goal: body.goal,
      ...(title ? { title } : {}),
    },
  };
}

/**
 * The link a run reads when it starts, if any: a competitor's website, or the
 * page of a podcast, blog post or video. An ad library link is Apify's to read
 * (not connected yet), and text or an upload has nothing to fetch.
 */
export function linkToRead(source: RunSource): string | null {
  if (source.kind === 'competitor') return source.input === 'website' ? source.url : null;
  return 'url' in source ? source.url : null;
}

/** The run's name: the one people gave it, or one made from what it starts from. */
export function runTitle(input: NewRunInput): string {
  if (input.title) return input.title;
  const { source } = input;
  let title: string;
  if (source.kind === 'competitor') {
    if (source.input === 'upload') title = source.name;
    else title = source.input === 'website' ? hostOf(source.url) : `Ad link · ${hostOf(source.url)}`;
  } else if (source.type === 'text') {
    title = `Text: ${source.excerpt.slice(0, 40).trimEnd()}…`;
  } else if ('clip' in source) {
    title = `Video · ${source.clip.name.replace(/\.[a-z0-9]{2,4}$/i, '')}`;
  } else {
    title = `${{ podcast: 'Podcast', blog: 'Blog post', video: 'Video' }[source.type]} · ${hostOf(source.url)}`;
  }
  return title.slice(0, MAX_TITLE);
}

const AD_LIBRARIES = [/facebook\.com\/ads\/library/i, /linkedin\.com\/ad-library/i, /ads\.x\.com/i, /adstransparency\.google\.com/i, /adlibrary\./i];

/** A link into an ad library is an ad link; anything else is the competitor's website. */
export function competitorInputFor(url: string): 'website' | 'ad_link' {
  return AD_LIBRARIES.some((re) => re.test(url)) ? 'ad_link' : 'website';
}
