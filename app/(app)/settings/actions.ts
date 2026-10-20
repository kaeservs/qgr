'use server';

import { getTeamSettings, pricePicture, saveAgentSettings, savePostPages, setPostForReal, setVideoSettings } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { parseAgentSettings, parsePostPages } from '@/lib/post-input';
import { checkTeam } from '@/lib/session';
import { PICTURE_QUALITIES, PLACES } from '@/lib/types';
import type { Place, PictureQuality } from '@/lib/types';

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

/** Making AI videos for real (they spend the Higgsfield plan's credits), and the month's limit in credits. */
export async function setVideoSettingsAction(live: unknown, cap: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (typeof live !== 'boolean') return { ok: false, status: 400, error: 'Say whether AI video is on.' };
  if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 0 || cap > 100_000) return { ok: false, status: 400, error: 'Set the monthly limit as whole credits, from 0 to 100,000.' };
  return setVideoSettings(live, cap);
}

/** What one Higgsfield picture costs at a quality, and the credits left on the plan: asked of Higgsfield, nothing is made. */
export async function pricePictureAction(quality: unknown): Promise<Saved<{ credits: number; balance: number | null }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!(PICTURE_QUALITIES as readonly unknown[]).includes(quality)) return { ok: false, status: 400, error: 'Higgsfield draws pictures at low, medium or high quality.' };
  return pricePicture(quality as PictureQuality);
}
