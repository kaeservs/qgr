'use server';

import { setCompetitorTracked } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId } from '@/lib/edit-input';
import { checkTeam } from '@/lib/session';

/** Whether a competitor is scanned on the team's schedule. */
export async function setTrackedAction(competitorId: unknown, tracked: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(competitorId) || typeof tracked !== 'boolean') return { ok: false, status: 400, error: 'That competitor no longer exists.' };
  return setCompetitorTracked(competitorId, tracked);
}
