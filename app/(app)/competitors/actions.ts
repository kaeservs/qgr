'use server';

import { setCompetitorTracked, startRunFromAds } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId } from '@/lib/edit-input';
import { parseAdsRun } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';

/** Whether a competitor is scanned on the team's schedule. */
export async function setTrackedAction(competitorId: unknown, tracked: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(competitorId) || typeof tracked !== 'boolean') return { ok: false, status: 400, error: 'That competitor no longer exists.' };
  return setCompetitorTracked(competitorId, tracked);
}

/** Starts a run on a few of a report's ads, chosen by a person: it begins at the strategist. */
export async function startFromAdsAction(body: unknown): Promise<Saved<{ id: string }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseAdsRun(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return startRunFromAds(parsed.value);
}
