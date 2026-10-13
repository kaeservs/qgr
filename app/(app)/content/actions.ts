'use server';

import { approveVariant, askForPicture, removePicture, saveVariant, saveVideoEdit, stopPicture, usePicture } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { isRecordId, parsePicturePrompt, parseVariantEdit } from '@/lib/edit-input';
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

/** Asks the image model for a picture for a variant from a prompt, which becomes the variant's picture prompt. */
export async function askForPictureAction(variantId: unknown, prompt: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId)) return GONE;
  const parsed = parsePicturePrompt(prompt);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return askForPicture(variantId, parsed.value);
}

/** Shows a picture made for the variant before. */
export async function usePictureAction(variantId: unknown, pictureId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId) || !isRecordId(pictureId)) return GONE;
  return usePicture(variantId, pictureId);
}

/** Stops a picture being made; the variant keeps what it shows. */
export async function stopPictureAction(variantId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId)) return GONE;
  return stopPicture(variantId);
}

/** Goes back to the drawn design, stopping any picture being made. The pictures stay to choose again. */
export async function removePictureAction(variantId: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (!isRecordId(variantId)) return GONE;
  return removePicture(variantId);
}
