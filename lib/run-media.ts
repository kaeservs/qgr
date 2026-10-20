// What a run's ads are made of, asked once Start run is pressed: the drawn
// design (the words on QGR's own artwork, free), an AI picture for every ad, or
// an AI video for every ad; and up to four reference pictures the team gives
// Higgsfield to keep to (the office, a brochure, a look). Every picture and
// video of the run is sent with them, and a run with references has its
// pictures made by Higgsfield whatever the team's image model is: the others
// take none. A run from a clip makes its ads from the clip and is not asked.
//
// These are the app's rules (rule 4); set_run_media holds them again. Prices
// are never worked out here: Higgsfield quotes them (references do not change
// them, measured 2026-10-20), and a run is three ads, so three of each.

import { modelOf } from './ai-video';
import type { AgentSettings, Clip, PictureModel, PictureQuality, RunMedia, RunMediaKind, RunVideo, VariantVideo, VideoBudget } from './types';
import { RUN_MEDIA } from './types';

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Every run writes three ads, so it asks for three pictures or three videos. */
export const ADS_A_RUN = 3;
export const MAX_REFERENCES = 4;
/** The bucket (run-refs) refuses more. */
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
export const MAX_REFERENCE_NOTE = 120;
/** Where a reference picture is kept: the uploader's own folder of run-refs. The database checks the same. */
export const REFERENCE_PATH = /^refs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

/** A video run's ads are made by Higgsfield's budget model, without sound: an ad gets its music in the editor. */
export const RUN_VIDEO_MODEL = 'seedance_2_0_mini';
const MINI = modelOf(RUN_VIDEO_MODEL);
export const RUN_VIDEO_SECONDS: readonly number[] = MINI.seconds;
export const RUN_VIDEO_QUALITIES = ['480p', '720p'] as const;
export const RUN_VIDEO_ASPECTS = ['9:16', '1:1', '16:9'] as const;
/** Where the question starts: the cheapest video (2 credits on 2026-10-20). */
export const CHEAPEST_RUN_VIDEO: RunVideo = { seconds: RUN_VIDEO_SECONDS[0] ?? 4, quality: '480p', aspect: '9:16' };

export interface ReferenceInput {
  path: string;
  note?: string;
}

/** The answer to "what are the ads made of?", as the browser sends it. */
export interface RunMediaInput {
  kind: RunMediaKind;
  references: ReferenceInput[];
  video?: RunVideo;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string | number>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);

/** What a reference shows, as one plain line. */
export function cleanNote(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

export function parseRunMedia(raw: unknown): Parsed<RunMediaInput> {
  if (!isRecord(raw) || !oneOf(RUN_MEDIA, raw.kind)) return { ok: false, error: 'Say whether the ads use the design, AI pictures or AI video.' };
  const kind = raw.kind;

  const list = raw.references === undefined || raw.references === null ? [] : raw.references;
  if (!Array.isArray(list)) return { ok: false, error: 'The reference pictures could not be read.' };
  if (list.length > MAX_REFERENCES) return { ok: false, error: `Add up to ${MAX_REFERENCES} reference pictures.` };
  if (list.length > 0 && kind === 'design') return { ok: false, error: 'Reference pictures are for AI pictures or AI video: the design uses none.' };
  const references: ReferenceInput[] = [];
  for (const r of list) {
    if (!isRecord(r) || typeof r.path !== 'string' || !REFERENCE_PATH.test(r.path)) return { ok: false, error: 'A reference picture was not uploaded here: add it again.' };
    const note = cleanNote(r.note);
    if (note.length > MAX_REFERENCE_NOTE) return { ok: false, error: `Keep what a reference shows under ${MAX_REFERENCE_NOTE} characters.` };
    if (references.some((x) => x.path === r.path)) return { ok: false, error: 'The same reference picture is there twice.' };
    references.push({ path: r.path, ...(note ? { note } : {}) });
  }

  if (kind !== 'video') {
    if (raw.video !== undefined && raw.video !== null) return { ok: false, error: 'Only a video run has video settings.' };
    return { ok: true, value: { kind, references } };
  }
  const video = parseRunVideo(raw.video);
  if (!video.ok) return video;
  return { ok: true, value: { kind, references, video: video.value } };
}

export function parseRunVideo(raw: unknown): Parsed<RunVideo> {
  if (!isRecord(raw)) return { ok: false, error: 'Say how long and how sharp the videos are.' };
  if (!oneOf(RUN_VIDEO_SECONDS, raw.seconds)) return { ok: false, error: `A video is ${RUN_VIDEO_SECONDS.join(', ')} seconds long.` };
  if (!oneOf(RUN_VIDEO_QUALITIES, raw.quality)) return { ok: false, error: 'A video is 480p or 720p.' };
  if (!oneOf(RUN_VIDEO_ASPECTS, raw.aspect)) return { ok: false, error: 'A video is 9:16, 1:1 or 16:9.' };
  return { ok: true, value: { seconds: raw.seconds, quality: raw.quality, aspect: raw.aspect } };
}

/**
 * What Higgsfield is asked to price for one of the run's videos: the model,
 * silent, from no first picture. The prompt is not written yet and does not
 * change the price, so n8n prices a stand-in one.
 */
export const videoPriceRequest = (video: RunVideo) => ({ prompt: '', model: RUN_VIDEO_MODEL, seconds: video.seconds, aspect: video.aspect, quality: video.quality, sound: false, picture: false }) as const;

/** Three of a price, as Higgsfield counts credits (to the hundredth). */
export const forTheRun = (credits: number): number => Math.round(credits * ADS_A_RUN * 100) / 100;

/**
 * A video's size for its shape and quality: the short side is the quality.
 * Higgsfield's file may differ by a few pixels; the editor draws it into the
 * frame either way, so only the shape matters.
 */
export function videoSize(aspect: RunVideo['aspect'], quality: string): { width: number; height: number } {
  const short = quality === '720p' ? 720 : 480;
  const long = Math.round((short * 16) / 9 / 2) * 2;
  if (aspect === '1:1') return { width: short, height: short };
  return aspect === '9:16' ? { width: short, height: long } : { width: long, height: short };
}

/** An ad's made AI video as a clip, so the studio previews, edits and posts it as it does an uploaded one. */
export function clipOfVideo(video: VariantVideo, label: string): Clip | null {
  if (video.status !== 'ready' || !video.path) return null;
  return { path: video.path, name: `Variant ${label} video`, duration: video.seconds, size: 0, ...videoSize(video.aspect, video.quality) };
}

/** The run page's line on what the ads are made of. */
export function mediaSaid(kind: RunMediaKind, video?: RunVideo & { credits: number | null }): string {
  if (kind === 'design') return 'The drawn design: the words on QGR’s own artwork, no AI picture';
  if (kind === 'pictures') return 'An AI picture for every ad';
  if (!video) return 'An AI video for every ad';
  if (video.credits === null) return `An AI video for every ad: ${video.seconds} s, ${video.quality}, ${video.aspect}, silent`;
  const each = `${trimCredits(video.credits)} credit${video.credits === 1 ? '' : 's'}`;
  return `An AI video for every ad: ${video.seconds} s, ${video.quality}, ${video.aspect}, silent; ${each} each, ${trimCredits(forTheRun(video.credits))} for the three`;
}

const trimCredits = (n: number) => String(Math.round(n * 100) / 100);

/** What the question after Start run needs to know: the team's picture switch and model, and AI video's. */
export interface MediaSetup {
  /** A run nobody asked follows the picture switch, so the question starts there. */
  picturesAuto: boolean;
  pictureModel: PictureModel;
  picturesQuality: PictureQuality;
  /** AI video is switched on in Settings. */
  videosLive: boolean;
  /** What this month's Higgsfield limit still allows, in credits. */
  creditsLeft: number;
  /** The sample data prices nothing and keeps no uploads. */
  sample: boolean;
}

export function mediaSetup(settings: Pick<AgentSettings, 'picturesAuto' | 'pictureModel' | 'picturesQuality'>, budget: VideoBudget, sample: boolean): MediaSetup {
  return {
    picturesAuto: settings.picturesAuto,
    pictureModel: settings.pictureModel,
    picturesQuality: settings.picturesQuality,
    videosLive: budget.live,
    creditsLeft: Math.max(0, Math.round((budget.cap - budget.spent) * 100) / 100),
    sample,
  };
}

/**
 * Who makes a run's pictures: Higgsfield whenever the run has references
 * (the other models take none), else the team's image model.
 */
export const picturesBy = (model: PictureModel, references: number): PictureModel => (references > 0 ? 'higgsfield' : model);

/** A run's answer as it was given, for Start over: the same references, the video priced again. */
export function answerOf(media: RunMedia): RunMediaInput {
  const references = media.references.map((r) => ({ path: r.path, ...(r.note ? { note: r.note } : {}) }));
  if (media.kind === 'video' && media.video) {
    const { credits: _, ...video } = media.video;
    return { kind: 'video', references, video };
  }
  return { kind: media.kind === 'video' ? 'design' : media.kind, references: media.kind === 'design' ? [] : references };
}
