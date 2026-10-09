'use server';

import { approveVariant, removePicture, requestPicture, saveVariant, saveVideoEdit } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId, parseVariantEdit } from '@/lib/edit-input';
import { checkTeam } from '@/lib/session';
import { parseVideoEdit } from '@/lib/video/edit';

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

/**
 * Saves how a variant uses its run's clip, or puts the whole clip back (null).
 * The clip's length is the database's to check: save_video_edit keeps every
 * kept part inside it.
 */
export async function saveVideoEditAction(variantId: unknown, edit: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId)) return GONE;
  if (edit === null) return saveVideoEdit(variantId, null);
  const parsed = parseVideoEdit(edit);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveVideoEdit(variantId, parsed.value);
}

/** Asks the image model for a picture for a variant, or for another one. */
export async function requestPictureAction(variantId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId)) return GONE;
  return requestPicture(variantId);
}

/** Takes a variant's picture away, or stops one being made: the design is drawn again. */
export async function removePictureAction(variantId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId)) return GONE;
  return removePicture(variantId);
}
