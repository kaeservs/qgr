'use server';

import { askMomentsAgain, recordMomentRun, removeLongVideo } from '@/lib/data';
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
