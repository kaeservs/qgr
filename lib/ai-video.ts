// AI video, made by Higgsfield from a prompt and, for some models, a first
// picture. n8n asks Higgsfield through its MCP, signed in with the team's own
// Higgsfield account, so every video spends the plan's credits: a person's
// Generate makes one, never a run, and the team's monthly limit holds it.
//
// A video is made first and kept in a library; a run starts from one the team
// has seen, as if the clip were uploaded. A run never waits on a paid
// generation, or fails with one.
//
// The three models, and what each takes, follow Higgsfield's own catalogue as
// its MCP gave it on 2026-10-20 (models_explore): Seedance 2.0 Mini for cheap
// tries, Kling 3.0, and Seedance 2.5, Higgsfield's general model. A price is
// never guessed here: Higgsfield quotes each request before it is made.

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const VIDEO_ASPECTS = ['9:16', '1:1', '16:9'] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];

export type VideoModelKey = 'seedance_2_0_mini' | 'kling3_0' | 'seedance_2_5';

export interface VideoModel {
  /** Higgsfield's id for it. */
  key: VideoModelKey;
  name: string;
  /** What it is good for, in a line. */
  job: string;
  /** Lengths offered, in seconds. */
  seconds: readonly number[];
  aspects: readonly VideoAspect[];
  /** Its quality settings, cheapest first; Higgsfield's own values. */
  qualities: readonly { key: string; label: string }[];
  /** Whether it can start from a picture (the first frame). */
  picture: boolean;
}

export const VIDEO_MODELS: readonly VideoModel[] = [
  {
    key: 'seedance_2_0_mini',
    name: 'Seedance 2.0 Mini',
    job: 'The budget model: quick tries and drafts',
    seconds: [4, 5, 8, 10, 15],
    aspects: ['9:16', '1:1', '16:9'],
    qualities: [
      { key: '480p', label: '480p' },
      { key: '720p', label: '720p' },
    ],
    picture: true,
  },
  {
    key: 'kling3_0',
    name: 'Kling 3.0',
    job: 'Smooth motion and several shots in one video',
    seconds: [3, 5, 10, 15],
    aspects: ['9:16', '1:1', '16:9'],
    qualities: [
      { key: 'std', label: 'Standard' },
      { key: 'pro', label: 'Pro' },
    ],
    picture: true,
  },
  {
    key: 'seedance_2_5',
    name: 'Seedance 2.5',
    job: 'Higgsfield’s general model: the finest here, and the dearest',
    seconds: [5, 10, 15],
    aspects: ['9:16', '1:1', '16:9'],
    qualities: [
      { key: '480p', label: '480p' },
      { key: '720p', label: '720p' },
      { key: '1080p', label: '1080p' },
    ],
    picture: false,
  },
];

export const modelOf = (key: VideoModelKey): VideoModel => VIDEO_MODELS.find((m) => m.key === key) ?? VIDEO_MODELS[0]!;
export const qualityLabel = (key: VideoModelKey, quality: string): string => modelOf(key).qualities.find((q) => q.key === quality)?.label ?? quality;

export const MIN_VIDEO_PROMPT = 20;
export const MAX_VIDEO_PROMPT = 2000;
/** A first picture: PNG, JPEG or WebP, 10 MB at most, in the video-refs bucket. */
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const PICTURE_PATH = /^refs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

export interface VideoRequest {
  prompt: string;
  model: VideoModelKey;
  seconds: number;
  aspect: VideoAspect;
  quality: string;
  /** Sound made with the video; off costs fewer credits, and an ad gets its music in the editor. */
  sound: boolean;
  /** The first frame, a file in video-refs; only for a model that takes one. */
  picture: string | null;
}

/**
 * The rules a request is held to (rule 4): the server checks with these, the
 * database again, and the page only to answer sooner.
 */
export function parseVideoRequest(raw: { prompt?: unknown; model?: unknown; seconds?: unknown; aspect?: unknown; quality?: unknown; sound?: unknown; picture?: unknown }): Parsed<VideoRequest> {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim() : '';
  if (prompt.length < MIN_VIDEO_PROMPT) return { ok: false, error: `Describe the video in at least ${MIN_VIDEO_PROMPT} characters: what is seen, how it moves, the light.` };
  if (prompt.length > MAX_VIDEO_PROMPT) return { ok: false, error: `Keep the prompt under ${MAX_VIDEO_PROMPT.toLocaleString('en-US')} characters.` };
  const model = VIDEO_MODELS.find((m) => m.key === raw.model);
  if (!model) return { ok: false, error: 'Pick a video model.' };
  if (typeof raw.seconds !== 'number' || !model.seconds.includes(raw.seconds)) return { ok: false, error: `${model.name} makes videos of ${model.seconds.join(', ')} seconds.` };
  if (typeof raw.aspect !== 'string' || !model.aspects.includes(raw.aspect as VideoAspect)) return { ok: false, error: `${model.name} makes ${model.aspects.join(', ')} videos.` };
  const quality = model.qualities.find((q) => q.key === raw.quality);
  if (!quality) return { ok: false, error: `${model.name} comes in ${model.qualities.map((q) => q.label).join(' or ')}.` };
  const picture = raw.picture === null || raw.picture === undefined || raw.picture === '' ? null : raw.picture;
  if (picture !== null) {
    if (!model.picture) return { ok: false, error: `${model.name} starts from the prompt alone: take the picture away, or pick another model.` };
    if (typeof picture !== 'string' || !PICTURE_PATH.test(picture)) return { ok: false, error: 'The first picture did not upload: add it again.' };
  }
  return { ok: true, value: { prompt, model: model.key, seconds: raw.seconds, aspect: raw.aspect as VideoAspect, quality: quality.key, sound: raw.sound === true, picture } };
}

/**
 * A request brought into line with another model: the nearest length it
 * makes, a shape it makes, the same quality where it has it (else its
 * cheapest), and no picture where it takes none. Switching models never
 * leaves a request it would refuse.
 */
export function fitToModel(request: Omit<VideoRequest, 'prompt'>, key: VideoModelKey): Omit<VideoRequest, 'prompt'> {
  const model = modelOf(key);
  const seconds = [...model.seconds].sort((a, b) => Math.abs(a - request.seconds) - Math.abs(b - request.seconds))[0] ?? model.seconds[0]!;
  const aspect = model.aspects.includes(request.aspect) ? request.aspect : model.aspects[0]!;
  const quality = model.qualities.some((q) => q.key === request.quality) ? request.quality : model.qualities[0]!.key;
  return { model: key, seconds, aspect, quality, sound: request.sound, picture: model.picture ? request.picture : null };
}

/** The cheapest request a model makes: where a team starts, and what a first test should be. */
export const cheapest = (key: VideoModelKey): Omit<VideoRequest, 'prompt'> => {
  const model = modelOf(key);
  return { model: key, seconds: model.seconds[0]!, aspect: '9:16', quality: model.qualities[0]!.key, sound: false, picture: null };
};

/** What this month's AI video may still spend, in credits, against the team's limit. */
export function creditsLeft(budget: { cap: number; spent: number }): number {
  return Math.max(0, Math.round((budget.cap - budget.spent) * 100) / 100);
}

/** Credits as Higgsfield counts them: whole where they are whole, else to a tenth. */
export function formatCredits(credits: number): string {
  const n = Math.round(credits * 10) / 10;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} credit${n === 1 ? '' : 's'}`;
}

/** A video's name in the library: the prompt's first words. */
export function videoTitle(prompt: string): string {
  const words = prompt.replace(/\s+/g, ' ').trim().split(' ');
  const title = words.slice(0, 8).join(' ').replace(/[,.;:!?]+$/, '');
  return words.length > 8 ? `${title}…` : title;
}

/** What a run starting from this video is told: the agents cannot watch it. */
export function notesFor(video: { prompt: string; seconds: number; sound?: boolean }): string {
  return `An AI-made video (${video.seconds} seconds, ${video.sound ? 'with sound but no speech' : 'no speech'}) of: ${video.prompt}`;
}
