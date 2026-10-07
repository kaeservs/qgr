'use server';

import { approveVariant, saveVariant } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId, parseVariantEdit } from '@/lib/edit-input';
import { checkTeam } from '@/lib/session';

const GONE = { ok: false, status: 404, error: 'That variant no longer exists.' } as const;

/** Saves a person's edit to one variant and returns the guardrail flags for the new words. */
export async function saveVariantAction(variantId: unknown, edit: unknown): Promise<Saved<{ warnings: string[] }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId)) return GONE;
  const parsed = parseVariantEdit(edit);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveVariant(variantId, parsed.value);
}

export async function approveVariantAction(variantId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId)) return GONE;
  return approveVariant(variantId);
}
