'use server';

import { cancelPost, reschedulePost, retryPost, schedulePost } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId } from '@/lib/edit-input';
import { parseNewPost } from '@/lib/post-input';
import { localTime } from '@/lib/schedule';
import { checkTeam } from '@/lib/session';
import { PLACES } from '@/lib/types';
import type { Place } from '@/lib/types';

/** Sends an approved variant now, or schedules it. The database checks it is approved and copies its words. */
export async function schedulePostAction(post: unknown): Promise<Saved<{ id: string }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseNewPost(post);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return schedulePost(parsed.value);
}

export async function cancelPostAction(postId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(postId)) return { ok: false, status: 404, error: 'That post no longer exists.' };
  return cancelPost(postId);
}

/** Gives a waiting post another time (a wall time in the team's zone), or sends it now (null). */
export async function reschedulePostAction(postId: unknown, at: unknown): Promise<Saved<{ at: string }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(postId)) return { ok: false, status: 404, error: 'That post no longer exists.' };
  let local: string | null = null;
  if (at !== null) {
    const [date = '', time = ''] = typeof at === 'string' ? at.split(' ') : [];
    local = localTime(date, time);
    if (!local) return { ok: false, status: 400, error: 'Pick a date and a time.' };
  }
  return reschedulePost(postId, local);
}

export async function retryPostAction(postId: unknown, place: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(postId) || !PLACES.includes(place as Place)) return { ok: false, status: 404, error: 'That post no longer exists.' };
  return retryPost(postId, place as Place);
}
