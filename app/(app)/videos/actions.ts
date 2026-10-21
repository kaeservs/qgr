'use server';

import { MIN_VIDEO_PROMPT, parseVideoRequest } from '@/lib/ai-video';
import { askForVideo, askMomentsAgain, getAiVideos, getAiVideosById, getLongVideo, getVideoBudget, priceVideo, recordMomentRun, removeAiVideo, removeLongVideo, removeMoment, saveLongVideoEdit, saveMoment, updateLongVideo, writeVideoPrompt } from '@/lib/data';
import { hookWarnings } from '@/lib/guardrails';
import { parseLongVideoDetails, parseMoment } from '@/lib/long-video';
import type { Saved } from '@/lib/data';
import { checkTeam } from '@/lib/session';
import type { AiVideo, VideoBudget } from '@/lib/types';
import { parseVideoEdit } from '@/lib/video/edit';
import { compactEdit } from '@/lib/video/timeline';
import { parseVideoPromptRequest } from '@/lib/video-prompt';

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isLine = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100_000;

export async function askMomentsAgainAction(id: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isId(id)) return { ok: false, status: 400, error: 'That is not a long video.' };
  return askMomentsAgain(id);
}

export async function removeLongVideoAction(id: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isId(id)) return { ok: false, status: 400, error: 'That is not a long video.' };
  return removeLongVideo(id);
}

/** A long video's name, description and direction, checked here (rule 4) and again by update_long_video. */
export async function updateLongVideoAction(id: unknown, details: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isId(id)) return { ok: false, status: 400, error: 'That is not a long video.' };
  const parsed = parseLongVideoDetails(details);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return updateLongVideo(id, parsed.value);
}

/**
 * A moment's title, description, hook and lines as the team leaves them, or
 * one of their own, kept at once. The hook is flagged here as the Moments
 * agent's are (rule 6: flagged, never changed).
 */
export async function saveMomentAction(id: unknown, moment: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isId(id)) return { ok: false, status: 400, error: 'That is not a long video.' };
  const parsed = parseMoment(moment);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveMoment(id, parsed.value, hookWarnings(parsed.value.hook));
}

export async function removeMomentAction(id: unknown, first: unknown, last: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isId(id) || !isLine(first) || !isLine(last)) return { ok: false, status: 400, error: 'That moment is not readable.' };
  return removeMoment(id, first, last);
}

/** A run started from a clip cut from a moment: kept on the moment. The database checks the lines and the run again. */
export async function recordMomentRunAction(id: unknown, first: unknown, last: unknown, title: unknown, runId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isId(id) || !isId(runId) || !isLine(first) || !isLine(last) || last < first) return { ok: false, status: 400, error: 'That moment is not readable.' };
  const name = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return recordMomentRun(id, first, last, name, runId);
}

/** Higgsfield's price for a request, and the plan's credits left: nothing is made. Checked as an ask is (rule 4). */
export async function priceVideoAction(raw: unknown): Promise<Saved<{ credits: number; balance: number | null }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  // The price does not depend on the prompt's words or which picture: a placeholder stands in for each until the team has written one.
  const parsed = parseVideoRequest({ ...r, prompt: typeof r.prompt === 'string' && r.prompt.trim().length >= MIN_VIDEO_PROMPT ? r.prompt : 'A quiet street at golden hour, the camera moving slowly forward.', picture: null });
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const { picture: _picture, ...request } = parsed.value;
  return priceVideo({ ...request, picture: typeof r.picture === 'string' && r.picture.length > 0 });
}

/**
 * Asks for a video. Switched on, the server asks Higgsfield's price again
 * rather than take the page's, and the database holds it to the month's
 * limit. Off, the stand-in makes nothing and needs no price.
 */
export async function askForVideoAction(raw: unknown): Promise<Saved<{ id: string }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseVideoRequest(typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {});
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const budget = await getVideoBudget();
  if (!budget.live) return askForVideo(parsed.value, null);
  const { picture, ...request } = parsed.value;
  const price = await priceVideo({ ...request, picture: picture !== null });
  if (!price.ok) return price;
  return askForVideo(parsed.value, price.value.credits);
}

export async function removeAiVideoAction(id: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isId(id)) return { ok: false, status: 400, error: 'That is not a video.' };
  return removeAiVideo(id);
}

/** The team's edit of a whole long video, checked against its length (rule 4) and kept; null takes it back to the video as it is. */
export async function saveLongVideoEditAction(id: unknown, edit: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isId(id)) return { ok: false, status: 400, error: 'That is not a long video.' };
  if (edit === null) return saveLongVideoEdit(id, null);
  const video = await getLongVideo(id);
  if (!video) return { ok: false, status: 404, error: 'That long video is gone.' };
  const parsed = parseVideoEdit(edit, video.file.duration);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveLongVideoEdit(id, compactEdit(parsed.value));
}

/** What the editor offers to put in: the library, and AI video's switch and credits. */
export async function aiLibraryAction(): Promise<Saved<{ videos: AiVideo[]; budget: VideoBudget }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const [videos, budget] = await Promise.all([getAiVideos(), getVideoBudget()]);
  return { ok: true, value: { videos, budget }, sample: videos.some((v) => v.sample === true) };
}

/** The AI videos an edit uses, as they stand now: the editor asks again while one is being made. */
export async function editAiVideosAction(ids: unknown): Promise<Saved<AiVideo[]>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!Array.isArray(ids) || ids.length > 60 || !ids.every(isId)) return { ok: false, status: 400, error: 'Those are not AI videos.' };
  return { ok: true, value: await getAiVideosById(ids), sample: false };
}

/** Claude's draft of an AI video's prompt from what is said around the point. Nothing is made or spent on Higgsfield. */
export async function writeVideoPromptAction(raw: unknown): Promise<Saved<{ prompt: string; why: string }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseVideoPromptRequest(raw);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return writeVideoPrompt(parsed.value);
}
