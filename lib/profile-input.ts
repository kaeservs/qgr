// What the Profile page accepts (rule 4): the server checks with these, the
// forms only to answer sooner. Supabase Auth checks again.

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Teammates' profile photos, made in the browser and uploaded by the server as them. */
export const PHOTO_BUCKET = 'profile-photos';
export const MAX_NAME = 80;
export const MIN_PASSWORD = 8;
/** The photo the browser makes: a 256-pixel square JPEG, well under this. */
export const MAX_PHOTO_BYTES = 512 * 1024;
export const PHOTO_SIZE = 256;

/** The name the dashboard shows, with control characters and runs of spaces taken out. */
export function parseName(raw: unknown): Parsed<string> {
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!name) return { ok: false, error: 'Enter your name.' };
  if (name.length > MAX_NAME) return { ok: false, error: `Keep your name under ${MAX_NAME} characters.` };
  return { ok: true, value: name };
}

export function parseEmail(raw: unknown): Parsed<string> {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: 'Enter an email address like name@example.com.' };
  return { ok: true, value: email };
}

/** A new password, typed twice, that is not the current one. */
export function parsePasswordChange(raw: { current?: unknown; next?: unknown; again?: unknown }): Parsed<{ current: string; next: string }> {
  const current = typeof raw.current === 'string' ? raw.current : '';
  const next = typeof raw.next === 'string' ? raw.next : '';
  const again = typeof raw.again === 'string' ? raw.again : '';
  if (!current) return { ok: false, error: 'Enter your current password.' };
  if (next.length < MIN_PASSWORD) return { ok: false, error: `Make the new password at least ${MIN_PASSWORD} characters.` };
  if (next.length > 72) return { ok: false, error: 'Keep the new password under 72 characters.' };
  if (next !== again) return { ok: false, error: 'The two new passwords don’t match.' };
  if (next === current) return { ok: false, error: 'The new password is the same as the current one.' };
  return { ok: true, value: { current, next } };
}

/** A photo is a JPEG by its bytes, not by what it says it is. */
export function checkPhoto(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return 'Pick a photo.';
  if (bytes.length > MAX_PHOTO_BYTES) return 'That photo is too large.';
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return 'That file isn’t a photo the dashboard can use.';
  return null;
}

/** Only a path in the person's own folder is theirs to show or take away. */
export const ownPhotoPath = (userId: string, path: unknown): path is string =>
  typeof path === 'string' && new RegExp(`^photos/${userId}/[0-9a-f-]{36}\\.jpg$`).test(path);
