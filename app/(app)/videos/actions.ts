'use server';

import { MIN_VIDEO_PROMPT, parseVideoRequest } from '@/lib/ai-video';
import { askForVideo, askMomentsAgain, getVideoBudget, priceVideo, recordMomentRun, removeAiVideo, removeLongVideo } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { checkTeam } from '@/lib/session';

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
