// AI video, made by Higgsfield from a prompt and, for some models, references.
// A preview until Higgsfield is connected: the page shows how it works, and
// Generate makes nothing and says so (the stand-in, as for pictures).
//
// A video is made first and kept in a library; a run starts from one the team
// has seen, as if the clip were uploaded. A run never waits on a paid
// generation, or fails with one.
//
// What each model takes follows Higgsfield's model pages as of 2026-10
// (docs.higgsfield.ai); check them again when the key goes in. No price is
// shown until Higgsfield says one: none is guessed here.

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const VIDEO_ASPECTS = ['9:16', '1:1', '16:9'] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];

export type VideoModelKey = 'seedance' | 'hailuo' | 'kling';

export interface VideoModel {
  key: VideoModelKey;
  name: string;
  /** What it is good for, in a line. */
  job: string;
  /** Lengths it makes, in seconds. */
  seconds: readonly number[];
  aspects: readonly VideoAspect[];
  /** Pictures it takes as references, and how many it needs at least. */
  images: { min: number; max: number };
  /** Short clips it takes as references. */
  clips: number;
}

export const VIDEO_MODELS: readonly VideoModel[] = [
  {
    key: 'seedance',
    name: 'Seedance 2.0',
    job: 'From a prompt, with pictures or a short clip to follow',
    seconds: [5, 10, 15],
    aspects: ['9:16', '1:1', '16:9'],
    images: { min: 0, max: 4 },
    clips: 1,
  },
  {
    key: 'hailuo',
    name: 'Hailuo 2.3',
    job: 'From a prompt alone, quick and plain',
    seconds: [6, 10],
    aspects: ['9:16', '16:9'],
    images: { min: 0, max: 1 },
    clips: 0,
  },
  {
    key: 'kling',
    name: 'Kling 3.0',
    job: 'Brings a picture to life: the picture is the first frame',
    seconds: [5, 10, 15],
    aspects: ['9:16', '1:1', '16:9'],
    images: { min: 1, max: 1 },
    clips: 0,
  },
];

export const modelOf = (key: VideoModelKey): VideoModel => VIDEO_MODELS.find((m) => m.key === key) ?? VIDEO_MODELS[0]!;

export const MIN_VIDEO_PROMPT = 20;
export const MAX_VIDEO_PROMPT = 2000;
/** A reference clip is something to follow, not footage: short. */
export const MAX_REFERENCE_SECONDS = 15;
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

export interface VideoReference {
  kind: 'image' | 'clip';
  name: string;
  size: number;
  /** A clip's length; a picture has none. */
  seconds?: number | undefined;
}

export interface VideoRequest {
  prompt: string;
  model: VideoModelKey;
  seconds: number;
  aspect: VideoAspect;
  references: VideoReference[];
}

/**
 * The rules a request is held to (rule 4): the server checks with these when
 * Higgsfield is connected, the page only to answer sooner.
 */
export function parseVideoRequest(raw: { prompt?: unknown; model?: unknown; seconds?: unknown; aspect?: unknown; references?: unknown }): Parsed<VideoRequest> {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim() : '';
  if (prompt.length < MIN_VIDEO_PROMPT) return { ok: false, error: `Describe the video in at least ${MIN_VIDEO_PROMPT} characters: what is seen, how it moves, the light.` };
  if (prompt.length > MAX_VIDEO_PROMPT) return { ok: false, error: `Keep the prompt under ${MAX_VIDEO_PROMPT.toLocaleString('en-US')} characters.` };
  const model = VIDEO_MODELS.find((m) => m.key === raw.model);
  if (!model) return { ok: false, error: 'Pick a video model.' };
  if (typeof raw.seconds !== 'number' || !model.seconds.includes(raw.seconds)) return { ok: false, error: `${model.name} makes videos of ${model.seconds.join(', ')} seconds.` };
  if (typeof raw.aspect !== 'string' || !model.aspects.includes(raw.aspect as VideoAspect)) return { ok: false, error: `${model.name} makes ${model.aspects.join(', ')} videos.` };

  const references: VideoReference[] = [];
  for (const r of Array.isArray(raw.references) ? raw.references : []) {
    if (typeof r !== 'object' || r === null) return { ok: false, error: 'A reference is not readable.' };
    const ref = r as Record<string, unknown>;
    const kind = ref.kind === 'image' || ref.kind === 'clip' ? ref.kind : null;
    if (!kind) return { ok: false, error: 'A reference is a picture or a short clip.' };
    const size = typeof ref.size === 'number' && Number.isFinite(ref.size) ? ref.size : 0;
    if (size <= 0 || size > MAX_REFERENCE_BYTES) return { ok: false, error: 'Each reference must be under 20 MB.' };
    const seconds = typeof ref.seconds === 'number' && Number.isFinite(ref.seconds) ? ref.seconds : undefined;
    if (kind === 'clip' && (seconds === undefined || seconds > MAX_REFERENCE_SECONDS)) return { ok: false, error: `A reference clip must be ${MAX_REFERENCE_SECONDS} seconds or less.` };
    const name = (typeof ref.name === 'string' ? ref.name : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) || (kind === 'image' ? 'Picture' : 'Clip');
    references.push({ kind, name, size, ...(seconds !== undefined ? { seconds } : {}) });
  }
  const images = references.filter((r) => r.kind === 'image').length;
  const clips = references.length - images;
  if (images < model.images.min) return { ok: false, error: `${model.name} starts from a picture: add one.` };
  if (images > model.images.max) return { ok: false, error: model.images.max === 0 ? `${model.name} takes no pictures.` : `${model.name} takes ${model.images.max === 1 ? 'one picture' : `up to ${model.images.max} pictures`}.` };
  if (clips > model.clips) return { ok: false, error: model.clips === 0 ? `${model.name} takes no reference clip.` : `${model.name} takes one reference clip.` };

  return { ok: true, value: { prompt, model: model.key, seconds: raw.seconds, aspect: raw.aspect as VideoAspect, references } };
}

/**
 * A request brought into line with another model: the nearest length it
 * makes, a shape it makes, and no more references than it takes. Switching
 * models never leaves a request it would refuse.
 */
export function fitToModel(request: Omit<VideoRequest, 'prompt' | 'references'>, key: VideoModelKey): Omit<VideoRequest, 'prompt' | 'references'> {
  const model = modelOf(key);
  const seconds = [...model.seconds].sort((a, b) => Math.abs(a - request.seconds) - Math.abs(b - request.seconds))[0] ?? model.seconds[0]!;
  const aspect = model.aspects.includes(request.aspect) ? request.aspect : model.aspects[0]!;
  return { model: key, seconds, aspect };
}

/** What a run starting from this video is told: the agents cannot watch it, and an AI video usually has no speech. */
export function notesFor(video: { prompt: string; seconds: number }): string {
  return `An AI-made video (${video.seconds} seconds, no speech) of: ${video.prompt}`;
}
