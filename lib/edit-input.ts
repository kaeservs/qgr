import type { NewBrandExample, VariantEdit } from './data/source';
import { PLATFORM_OF } from './platforms';
import type { ParseResult } from './run-input';
import { EXAMPLE_PLACES, PLACES, PLATFORMS } from './types';
import type { BrandMemory, BrandProfile, ExamplePlace, Place, Platform, PlatformCopy, ContentRules } from './types';

// What the studio and the settings page may send. Server actions are public
// endpoints, so their input is checked here before it reaches a data source;
// the database checks the same limits again (save_variant,
// save_variant_words, update_brand_profile, update_brand_memory,
// add_brand_example, ask_for_picture), which is the check that counts.

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export const LIMITS = {
  creativeText: 120,
  copyText: 3000,
  headline: 300,
  description: 300,
  cta: 40,
  company: 120,
  website: 200,
  offer: 10000,
  audience: 10000,
  voiceWords: 12,
  voiceWord: 60,
  guardrails: 30,
  guardrail: 1000,
  pageName: 80,
  post: 3000,
  topics: 40,
  topic: 300,
  formatNote: 10000,
  pictureStyle: 4000,
  /** A long picture style is shortened for Cloudflare's 2,048 characters, never for Higgsfield. */
  picturePrompt: 1200,
  example: 10000,
  exampleNote: 2000,
  contentRules: 30,
  contentRule: 1000,
  flagPhrases: 80,
  flagPhrase: 60,
} as const;


/** An id as the dashboard shows them: a uuid, or a sample id like `v-q4-a`. */
export const isRecordId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);

export function parseVariantEdit(body: unknown): ParseResult<VariantEdit> {
  if (!isRecord(body)) return { ok: false, error: 'Nothing to save.' };
  const creativeText = text(body.creativeText);
  if (!creativeText) return { ok: false, error: 'The image needs some words.' };
  if (creativeText.length > LIMITS.creativeText) return { ok: false, error: `Keep the words on the image under ${LIMITS.creativeText} characters.` };
  if (!isRecord(body.copy)) return { ok: false, error: 'The ad has no copy.' };

  const copy: Partial<Record<Platform, PlatformCopy>> = {};
  for (const p of PLATFORMS) {
    const raw = body.copy[p];
    if (raw === undefined) continue;
    if (!isRecord(raw)) return { ok: false, error: 'The copy is not readable.' };
    const entry = { text: text(raw.text), headline: text(raw.headline), description: text(raw.description), cta: text(raw.cta) };
    if (!entry.text || !entry.headline) return { ok: false, error: 'Every ad needs its text and a headline.' };
    if (entry.text.length > LIMITS.copyText || entry.headline.length > LIMITS.headline || entry.description.length > LIMITS.description || entry.cta.length > LIMITS.cta) {
      return { ok: false, error: 'Part of the copy is far too long.' };
    }
    copy[p] = {
      text: entry.text,
      headline: entry.headline,
      ...(typeof raw.description === 'string' ? { description: entry.description } : {}),
      ...(entry.cta ? { cta: entry.cta } : {}),
    };
  }
  if (Object.keys(copy).length === 0) return { ok: false, error: 'The ad has no copy.' };

  // Posts are optional: a place left out goes out with its ad copy.
  const posts: Partial<Record<Place, string>> = {};
  if (body.posts !== undefined) {
    if (!isRecord(body.posts)) return { ok: false, error: 'The posts are not readable.' };
    for (const place of PLACES) {
      const raw = body.posts[place];
      if (raw === undefined) continue;
      if (typeof raw !== 'string') return { ok: false, error: 'The posts are not readable.' };
      const post = raw.trim();
      if (!post) continue;
      if (post.length > LIMITS.post) return { ok: false, error: `Keep each post under ${LIMITS.post.toLocaleString('en-US')} characters.` };
      if (!copy[PLATFORM_OF[place]]) return { ok: false, error: 'A post is for a place this ad does not go to.' };
      posts[place] = post;
    }
  }
  return { ok: true, value: { creativeText, copy, posts } };
}

/** What the team posts about, how it formats posts, how its pictures look. Empty values are dropped. */
export function parseBrandMemory(body: unknown): ParseResult<BrandMemory> {
  if (!isRecord(body)) return { ok: false, error: 'Nothing to save.' };
  const topics = Array.isArray(body.topics) ? [...new Set(body.topics.map(text).filter(Boolean))] : [];
  if (topics.length > LIMITS.topics) return { ok: false, error: `Keep it to ${LIMITS.topics} topics.` };
  if (topics.some((t) => t.length > LIMITS.topic)) return { ok: false, error: `Keep each topic under ${LIMITS.topic} characters.` };
  const postFormats: BrandMemory['postFormats'] = {};
  if (isRecord(body.postFormats)) {
    for (const place of EXAMPLE_PLACES) {
      const note = text(body.postFormats[place]);
      if (!note) continue;
      if (note.length > LIMITS.formatNote) return { ok: false, error: `Keep each format note under ${LIMITS.formatNote.toLocaleString('en-US')} characters.` };
      postFormats[place] = note;
    }
  }
  const pictureStyle = text(body.pictureStyle);
  if (pictureStyle.length > LIMITS.pictureStyle) return { ok: false, error: `Keep the picture style under ${LIMITS.pictureStyle} characters.` };
  return { ok: true, value: { topics, postFormats, pictureStyle } };
}

/** The team's content rules: Do's and Don'ts for the words, pictures and videos, and the phrases to flag, each trimmed, empty ones left out. */
export function parseContentRules(body: unknown): ParseResult<ContentRules> {
  if (!isRecord(body)) return { ok: false, error: 'Nothing to save.' };
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(text).filter(Boolean))] : []);
  const value: ContentRules = {
    copyRules: list(body.copyRules),
    copyDonts: list(body.copyDonts),
    pictureRules: list(body.pictureRules),
    pictureDonts: list(body.pictureDonts),
    videoRules: list(body.videoRules),
    videoDonts: list(body.videoDonts),
    flagPhrases: list(body.flagPhrases),
  };
  for (const rules of [value.copyRules, value.copyDonts, value.pictureRules, value.pictureDonts, value.videoRules, value.videoDonts]) {
    if (rules.length > LIMITS.contentRules) return { ok: false, error: `Keep each list to ${LIMITS.contentRules} rules.` };
    if (rules.some((r) => r.length > LIMITS.contentRule)) return { ok: false, error: `Keep each rule under ${LIMITS.contentRule.toLocaleString('en-US')} characters.` };
  }
  if (value.flagPhrases.length > LIMITS.flagPhrases) return { ok: false, error: `Keep it to ${LIMITS.flagPhrases} phrases to flag.` };
  if (value.flagPhrases.some((p) => p.length < 2 || p.length > LIMITS.flagPhrase)) return { ok: false, error: `Each phrase to flag is 2 to ${LIMITS.flagPhrase} characters.` };
  return { ok: true, value };
}

/** What a person asks the image model to draw: the scene. The brand's picture style goes with it. */
export function parsePicturePrompt(body: unknown): ParseResult<string> {
  const prompt = text(body);
  if (!prompt) return { ok: false, error: 'Describe the picture first.' };
  if (prompt.length > LIMITS.picturePrompt) return { ok: false, error: `Keep the picture prompt under ${LIMITS.picturePrompt.toLocaleString('en-US')} characters.` };
  return { ok: true, value: prompt };
}

const isExamplePlace = (v: unknown): v is ExamplePlace => typeof v === 'string' && (EXAMPLE_PLACES as readonly string[]).includes(v);

/** A post that works, pasted by the team. */
export function parseBrandExample(body: unknown): ParseResult<NewBrandExample> {
  if (!isRecord(body)) return { ok: false, error: 'Nothing to save.' };
  if (!isExamplePlace(body.place)) return { ok: false, error: 'Say where the post ran.' };
  const post = text(body.text);
  if (!post) return { ok: false, error: 'Paste the post.' };
  if (post.length > LIMITS.example) return { ok: false, error: `Keep the post under ${LIMITS.example.toLocaleString('en-US')} characters.` };
  const note = text(body.note);
  if (note.length > LIMITS.exampleNote) return { ok: false, error: `Keep the note under ${LIMITS.exampleNote} characters.` };
  return { ok: true, value: { place: body.place, text: post, ...(note ? { note } : {}) } };
}

export function parseBrandProfile(body: unknown): ParseResult<BrandProfile> {
  if (!isRecord(body)) return { ok: false, error: 'Nothing to save.' };
  const fields = {
    company: text(body.company),
    website: text(body.website),
    offer: text(body.offer),
    audience: text(body.audience),
    pageName: text(body.pageName),
  };
  const required: [keyof typeof fields, string, number][] = [
    ['company', 'the company', LIMITS.company],
    ['website', 'the website', LIMITS.website],
    ['offer', 'what you offer', LIMITS.offer],
    ['audience', 'who it’s for', LIMITS.audience],
    ['pageName', 'the page name', LIMITS.pageName],
  ];
  for (const [key, name, max] of required) {
    if (!fields[key]) return { ok: false, error: `Fill in ${name}.` };
    if (fields[key].length > max) return { ok: false, error: `Shorten ${name} to ${max} characters.` };
  }

  const handle = text(body.xHandle).replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return { ok: false, error: 'The X handle should look like @quantumglobal.' };

  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(text).filter(Boolean))] : []);
  const voice = list(body.voice);
  if (voice.length === 0 || voice.length > LIMITS.voiceWords) return { ok: false, error: `Pick one to ${LIMITS.voiceWords} words for the voice.` };
  if (voice.some((v) => v.length > LIMITS.voiceWord)) return { ok: false, error: 'A voice word is too long.' };
  const guardrails = list(body.guardrails);
  if (guardrails.length > LIMITS.guardrails) return { ok: false, error: `Keep it to ${LIMITS.guardrails} guardrails.` };
  if (guardrails.some((g) => g.length > LIMITS.guardrail)) return { ok: false, error: `Keep each guardrail under ${LIMITS.guardrail} characters.` };

  return { ok: true, value: { ...fields, voice, guardrails, xHandle: `@${handle}` } };
}
