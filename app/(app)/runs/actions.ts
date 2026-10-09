'use server';

import { continueRun } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId } from '@/lib/edit-input';
import { checkTeam } from '@/lib/session';
import type { StageKey } from '@/lib/types';

/** Starts the agent a run waits on, or runs a failed one again where it stopped. */
export async function continueRunAction(runId: unknown): Promise<Saved<{ stage: StageKey }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(runId)) return { ok: false, status: 404, error: 'That run no longer exists.' };
  return continueRun(runId);
}
