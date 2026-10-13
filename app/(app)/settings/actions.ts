'use server';

import { getTeamSettings, saveAgentSettings, savePostPages, setPostForReal } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { parseAgentSettings, parsePostPages } from '@/lib/post-input';
import { checkTeam } from '@/lib/session';
import { PLACES } from '@/lib/types';
import type { Place } from '@/lib/types';

export async function saveAgentSettingsAction(settings: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseAgentSettings(settings);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveAgentSettings(parsed.value);
}

/**
 * One agent's switch, from its card on Home. The tracker's switch turns the
 * scan schedule on (weekly, at the day and hour last set) or off.
 */
export async function switchAgentAction(key: unknown, on: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (typeof on !== 'boolean' || (key !== 'tracker' && key !== 'strategist' && key !== 'content')) return { ok: false, status: 400, error: 'That switch is not one of the agents’.' };
  const { pages: _pages, ...current } = await getTeamSettings();
  if (key === 'tracker') return saveAgentSettings({ ...current, scanEvery: on ? (current.scanEvery === 'off' ? 'week' : current.scanEvery) : 'off' });
  return saveAgentSettings({ ...current, [key === 'strategist' ? 'strategistAuto' : 'contentAuto']: on });
}

export async function savePostPagesAction(pages: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parsePostPages(pages);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return savePostPages(parsed.value);
}

/** Whether a place's posts go out for real, or through its stand-in. */
export async function setPostForRealAction(place: unknown, on: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (typeof on !== 'boolean' || !PLACES.includes(place as Place)) return { ok: false, status: 400, error: 'That is not a place posts go to.' };
  return setPostForReal(place as Place, on);
}
