'use server';

import { continueRun, continueWithAds, continueWithAngles, removeRun } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId } from '@/lib/edit-input';
import { MAX_CHOSEN_ADS, parsePicks } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';
import type { StageKey } from '@/lib/types';

/** Deletes a run once a person confirmed it: its posts still waiting are cancelled; the database refuses while an agent works on it. */
export async function removeRunAction(runId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(runId)) return { ok: false, status: 404, error: 'That run no longer exists.' };
  return removeRun(runId);
}

/** Starts the agent a run waits on, or runs a failed one again where it stopped. */
export async function continueRunAction(runId: unknown): Promise<Saved<{ stage: StageKey }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(runId)) return { ok: false, status: 404, error: 'That run no longer exists.' };
  return continueRun(runId);
}

/** Starts a waiting Ad Strategist on the ads picked from the run's report; none is all of them. */
export async function continueWithAdsAction(runId: unknown, adIds: unknown): Promise<Saved<{ stage: StageKey }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(runId)) return { ok: false, status: 404, error: 'That run no longer exists.' };
  const picks = parsePicks(adIds, MAX_CHOSEN_ADS);
  if (!picks.ok) return { ok: false, status: 400, error: picks.error };
  return continueWithAds(runId, picks.value);
}

/** Starts a waiting Content Agent on the angles picked from the run's strategy; none is all of them. */
export async function continueWithAnglesAction(runId: unknown, angleIds: unknown): Promise<Saved<{ stage: StageKey }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(runId)) return { ok: false, status: 404, error: 'That run no longer exists.' };
  const picks = parsePicks(angleIds, 3);
  if (!picks.ok) return { ok: false, status: 400, error: picks.error };
  return continueWithAngles(runId, picks.value);
}
