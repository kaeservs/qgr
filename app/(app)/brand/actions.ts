'use server';

import { addBrandExample, removeBrandExample, saveBrandMemory, saveBrandProfile, saveContentRules } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId, parseBrandExample, parseBrandMemory, parseBrandProfile, parseContentRules } from '@/lib/edit-input';
import { checkTeam } from '@/lib/session';

// Brand memory: what every agent reads before it writes. Each change is
// checked here, then again by the database function that makes it.

export async function saveBrandProfileAction(profile: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseBrandProfile(profile);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveBrandProfile(parsed.value);
}

export async function saveBrandMemoryAction(memory: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseBrandMemory(memory);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveBrandMemory(parsed.value);
}

export async function addBrandExampleAction(example: unknown): Promise<Saved<{ id: string }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseBrandExample(example);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return addBrandExample(parsed.value);
}

export async function removeBrandExampleAction(id: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(id)) return { ok: false, status: 404, error: 'That post is not in brand memory.' };
  return removeBrandExample(id);
}

export async function saveContentRulesAction(rules: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseContentRules(rules);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveContentRules(parsed.value);
}
