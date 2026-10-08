'use server';

import { saveBrandProfile } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { parseBrandProfile } from '@/lib/edit-input';
import { checkTeam } from '@/lib/session';

export async function saveBrandProfileAction(profile: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseBrandProfile(profile);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveBrandProfile(parsed.value);
}
