'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PHOTO_BUCKET, checkPhoto, ownPhotoPath, parseEmail, parseName, parsePasswordChange } from '@/lib/profile-input';
import { getViewer } from '@/lib/session';
import type { Viewer } from '@/lib/session';
import { getSupabase } from '@/lib/supabase/server';
import type { Supabase } from '@/lib/supabase/server';

// A teammate's own account: their name and photo, their email and password,
// and where they are signed in. Everything goes through Supabase Auth as them,
// with their session; nothing here can touch another account. Changing the
// email or the password asks for the current password first, so a laptop left
// signed in is not enough to take the account.

export type ProfileSaved = { ok: true; message: string } | { ok: false; error: string };

const SAMPLE: ProfileSaved = { ok: false, error: 'The sample data has no accounts: connect Supabase to change a profile.' };

async function signedIn(): Promise<{ supabase: Supabase; viewer: Viewer } | ProfileSaved> {
  const supabase = await getSupabase();
  if (!supabase) return SAMPLE;
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: 'Sign in first.' };
  if (!viewer.role) return { ok: false, error: 'Only the QGR team can do this.' };
  return { supabase, viewer };
}

/** Auth's refusals, in plain words. */
function said(error: { code?: string | undefined; status?: number | undefined; message: string }, doing: string): ProfileSaved {
  console.error(`Profile: ${doing} failed`, error);
  if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') return { ok: false, error: 'Too many tries. Wait a few minutes, then try again.' };
  if (error.code === 'email_exists') return { ok: false, error: 'Another account already uses that email address.' };
  if (error.code === 'weak_password') return { ok: false, error: 'Supabase finds that password too easy to guess. Try a longer one.' };
  if (error.code === 'same_password') return { ok: false, error: 'The new password is the same as the current one.' };
  if (error.code === 'email_address_invalid') return { ok: false, error: 'Supabase won’t send to that email address. Check it and try again.' };
  return { ok: false, error: `${doing.charAt(0).toUpperCase()}${doing.slice(1)} didn’t work just now. Try again in a moment.` };
}

/** Whether the password is the account's, by signing in with it (which also freshens the session Auth wants for these changes). */
async function passwordHolds(supabase: Supabase, email: string, password: string): Promise<ProfileSaved | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return null;
  if (error.code === 'invalid_credentials') return { ok: false, error: 'That isn’t your current password.' };
  return said(error, 'checking your password');
}

export async function saveNameAction(raw: unknown): Promise<ProfileSaved> {
  const who = await signedIn();
  if ('ok' in who) return who;
  const name = parseName(raw);
  if (!name.ok) return name;
  const { error } = await who.supabase.auth.updateUser({ data: { full_name: name.value } });
  return error ? said(error, 'saving your name') : { ok: true, message: 'Name saved' };
}

/** The photo, as the browser made it: a small square JPEG, under the teammate's own folder. */
export async function savePhotoAction(form: FormData): Promise<ProfileSaved> {
  const who = await signedIn();
  if ('ok' in who) return who;
  const file = form.get('photo');
  if (!(file instanceof Blob)) return { ok: false, error: 'Pick a photo.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = checkPhoto(bytes);
  if (problem) return { ok: false, error: problem };

  const path = `photos/${who.viewer.id}/${crypto.randomUUID()}.jpg`;
  const bucket = who.supabase.storage.from(PHOTO_BUCKET);
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) {
    console.error('Profile: uploading the photo failed', uploadError);
    return { ok: false, error: 'The photo didn’t upload. Try again in a moment.' };
  }
  const { error } = await who.supabase.auth.updateUser({ data: { photo_path: path } });
  if (error) {
    await bucket.remove([path]);
    return said(error, 'saving your photo');
  }
  // The photo before is no one's now.
  if (who.viewer.photoPath && ownPhotoPath(who.viewer.id, who.viewer.photoPath)) await bucket.remove([who.viewer.photoPath]);
  return { ok: true, message: 'Photo saved' };
}

export async function removePhotoAction(): Promise<ProfileSaved> {
  const who = await signedIn();
  if ('ok' in who) return who;
  const { error } = await who.supabase.auth.updateUser({ data: { photo_path: null } });
  if (error) return said(error, 'removing your photo');
  if (who.viewer.photoPath) await who.supabase.storage.from(PHOTO_BUCKET).remove([who.viewer.photoPath]);
  return { ok: true, message: 'Photo removed' };
}

/**
 * A new sign-in email. Supabase sends a link to the new address (and, with
 * secure email change on, to the current one too); the email changes only once
 * it is followed, so a typo cannot lock anyone out.
 */
export async function changeEmailAction(raw: { email?: unknown; password?: unknown }): Promise<ProfileSaved> {
  const who = await signedIn();
  if ('ok' in who) return who;
  const email = parseEmail(raw.email);
  if (!email.ok) return email;
  if (email.value === who.viewer.email.toLowerCase()) return { ok: false, error: 'That is already your email address.' };
  if (typeof raw.password !== 'string' || !raw.password) return { ok: false, error: 'Enter your current password.' };
  const wrong = await passwordHolds(who.supabase, who.viewer.email, raw.password);
  if (wrong) return wrong;

  const origin = (await headers()).get('origin');
  const { error } = await who.supabase.auth.updateUser({ email: email.value }, origin ? { emailRedirectTo: `${origin}/auth/confirm?next=/profile` } : {});
  if (error) return said(error, 'changing your email');
  return { ok: true, message: `Check ${email.value} for a link to confirm it` };
}

export async function changePasswordAction(raw: { current?: unknown; next?: unknown; again?: unknown }): Promise<ProfileSaved> {
  const who = await signedIn();
  if ('ok' in who) return who;
  const change = parsePasswordChange(raw);
  if (!change.ok) return change;
  const wrong = await passwordHolds(who.supabase, who.viewer.email, change.value.current);
  if (wrong) return wrong;
  const { error } = await who.supabase.auth.updateUser({ password: change.value.next });
  return error ? said(error, 'changing your password') : { ok: true, message: 'Password changed' };
}

/** Signs this account out on every computer and phone, this one included. */
export async function signOutEverywhereAction(): Promise<void> {
  const supabase = await getSupabase();
  if (supabase) await supabase.auth.signOut({ scope: 'global' });
  redirect(supabase ? '/sign-in' : '/');
}
