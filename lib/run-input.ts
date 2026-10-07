import { hostOf } from './format';
import { CUSTOM_SOURCES, GOALS, PLATFORMS } from './types';
import type { Goal, Platform, RunSource } from './types';

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
const MAX_TITLE = 120;

/**
 * Accepts what people paste: `horizonvisa.com`, `www.x.com/...` or a full URL.
 * Anything that is not http(s) with a dotted host is refused.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) return null;
  return url.toString();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

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
