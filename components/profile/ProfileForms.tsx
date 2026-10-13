'use client';

import { Camera, LogOut, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { signOut } from '@/app/(auth)/actions';
import { changeEmailAction, changePasswordAction, removePhotoAction, saveNameAction, savePhotoAction, signOutEverywhereAction } from '@/app/(app)/profile/actions';
import type { ProfileSaved } from '@/app/(app)/profile/actions';
import { cx } from '@/lib/cx';
import { MAX_NAME, MIN_PASSWORD, PHOTO_SIZE, parseEmail, parseName, parsePasswordChange } from '@/lib/profile-input';
import { Avatar } from '../ui/Avatar';
import { useToast } from '../ui/Toast';
import styles from './profile.module.css';

export interface ProfileView {
  name: string;
  email: string;
  role: string;
  photoUrl?: string | undefined;
  /** A new email address waiting for its confirmation link. */
  pendingEmail: string | null;
  lastSignIn: string | null;
  /** The sample data has no accounts: everything shows, nothing saves. */
  sample: boolean;
}

/** A form's sending, its error and its answer, the same way in every card. */
function useSend() {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (work: () => Promise<ProfileSaved>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await work();
      if (!saved.ok) return setError(saved.error);
      toast(saved.message);
      after?.();
      router.refresh();
    } catch {
      setError('That didn’t go through. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, send };
}

function Card({ id, title, lead, children, onSubmit }: { id: string; title: string; lead: ReactNode; children: ReactNode; onSubmit?: (e: FormEvent<HTMLFormElement>) => void }) {
  const body = (
    <>
      <div>
        <h2 id={id} className="card-title">
          {title}
        </h2>
        <p className="muted small">{lead}</p>
      </div>
      {children}
    </>
  );
  return onSubmit ? (
    <form className={cx('card card-pad', styles.card)} aria-labelledby={id} onSubmit={onSubmit} noValidate>
      {body}
    </form>
  ) : (
    <section className={cx('card card-pad', styles.card)} aria-labelledby={id}>
      {body}
    </section>
  );
}

function Actions({ error, children }: { error: string | null; children: ReactNode }) {
  return (
    <div className={styles.actions}>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}

/** A picked image as a square JPEG, cropped about its middle and made small, so it uploads in a blink. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No JPEG'))), 'image/jpeg', 0.86));
}

export function PhotoAndName({ profile }: { profile: ProfileView }) {
  const [name, setName] = useState(profile.name);
  const photo = useSend();
  const named = useSend();
  const picker = useRef<HTMLInputElement>(null);
  const changed = name.trim() !== profile.name;

  return (
    <Card
      id="profile-you"
      title="Photo and name"
      lead="How you appear in the dashboard."
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseName(name);
        if (!parsed.ok) return named.setError(parsed.error);
        void named.send(() => saveNameAction(parsed.value));
      }}
    >
      <div className={styles.photoRow}>
        <Avatar name={profile.name} size={72} brand src={profile.photoUrl} />
        <div className={styles.photoButtons}>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (!file.type.startsWith('image/')) return photo.setError('Pick an image: a JPEG, PNG or WebP.');
              void photo.send(async () => {
                let jpeg: Blob;
                try {
                  jpeg = await squareJpeg(file);
                } catch {
                  return { ok: false, error: 'This browser couldn’t read that image. Try a JPEG or PNG.' };
                }
                const form = new FormData();
                form.set('photo', jpeg, 'photo.jpg');
                return savePhotoAction(form);
              });
            }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => picker.current?.click()} disabled={profile.sample || photo.busy} aria-busy={photo.busy}>
            <Camera size={16} aria-hidden />
            {profile.photoUrl ? 'Change photo' : 'Add a photo'}
          </button>
          {profile.photoUrl && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void photo.send(removePhotoAction)} disabled={photo.busy}>
              <Trash2 size={16} aria-hidden />
              Remove
            </button>
          )}
          <p className="muted small">A square crop of it is kept, 256 pixels across.</p>
        </div>
      </div>
      {photo.error && (
        <p className="error-text" role="alert">
          {photo.error}
        </p>
      )}

      <label className="field">
        <span className="label">Name</span>
        <input className="input" value={name} maxLength={MAX_NAME} autoComplete="name" onChange={(e) => setName(e.target.value)} disabled={profile.sample} />
      </label>
      <Actions error={named.error}>
        <button type="submit" className="btn btn-primary" disabled={profile.sample || named.busy || !changed} aria-busy={named.busy}>
          {named.busy ? 'Saving…' : 'Save name'}
        </button>
      </Actions>
    </Card>
  );
}

export function EmailForm({ profile }: { profile: ProfileView }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, setError, send } = useSend();

  return (
    <Card
      id="profile-email"
      title="Email"
      lead={
        <>
          You sign in with <strong>{profile.email}</strong>. A new address takes over once you follow the link Supabase emails to it.
        </>
      }
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseEmail(email);
        if (!parsed.ok) return setError(parsed.error);
        if (!password) return setError('Enter your current password.');
        void send(
          () => changeEmailAction({ email: parsed.value, password }),
          () => {
            setEmail('');
            setPassword('');
          },
        );
      }}
    >
      {profile.pendingEmail && (
        <p className={styles.notice} role="status">
          Waiting for <strong>{profile.pendingEmail}</strong> to be confirmed: follow the link in that inbox. Until then you still sign in with {profile.email}.
        </p>
      )}
      <div className={styles.row}>
        <label className="field">
          <span className="label">New email</span>
          <input className="input" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} disabled={profile.sample} />
        </label>
        <label className="field">
          <span className="label">Current password</span>
          <input className="input" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} disabled={profile.sample} />
        </label>
      </div>
      <Actions error={error}>
        <button type="submit" className="btn btn-primary" disabled={profile.sample || busy || !email.trim()} aria-busy={busy}>
          {busy ? 'Sending…' : 'Send the confirmation link'}
        </button>
      </Actions>
    </Card>
  );
}

export function PasswordForm({ profile }: { profile: ProfileView }) {
  const [fields, setFields] = useState({ current: '', next: '', again: '' });
  const { busy, error, setError, send } = useSend();
  const set = (key: keyof typeof fields, value: string) => setFields((f) => ({ ...f, [key]: value }));

  return (
    <Card
      id="profile-password"
      title="Password"
      lead={`At least ${MIN_PASSWORD} characters. Other places you are signed in stay signed in; sign out everywhere below if you need them not to.`}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parsePasswordChange(fields);
        if (!parsed.ok) return setError(parsed.error);
        void send(
          () => changePasswordAction(fields),
          () => setFields({ current: '', next: '', again: '' }),
        );
      }}
    >
      {/* For password managers: the account the password belongs to. */}
      <input type="email" value={profile.email} autoComplete="username" readOnly hidden />
      <label className="field">
        <span className="label">Current password</span>
        <input className="input" type="password" value={fields.current} autoComplete="current-password" onChange={(e) => set('current', e.target.value)} disabled={profile.sample} />
      </label>
      <div className={styles.row}>
        <label className="field">
          <span className="label">New password</span>
          <input className="input" type="password" value={fields.next} autoComplete="new-password" minLength={MIN_PASSWORD} onChange={(e) => set('next', e.target.value)} disabled={profile.sample} />
        </label>
        <label className="field">
          <span className="label">New password again</span>
          <input className="input" type="password" value={fields.again} autoComplete="new-password" onChange={(e) => set('again', e.target.value)} disabled={profile.sample} />
        </label>
      </div>
      <Actions error={error}>
        <button type="submit" className="btn btn-primary" disabled={profile.sample || busy || !fields.current || !fields.next} aria-busy={busy}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </Actions>
    </Card>
  );
}

export function SignInPanel({ profile }: { profile: ProfileView }) {
  const [leaving, setLeaving] = useState<'here' | 'everywhere' | null>(null);
  return (
    <Card id="profile-sign-in" title="Signing in" lead={profile.lastSignIn ? `Last signed in ${profile.lastSignIn}, as ${profile.role.toLowerCase()}.` : `On the team as ${profile.role.toLowerCase()}.`}>
      <div className={styles.signOutRow}>
        <form action={signOut} onSubmit={() => setLeaving('here')}>
          <button type="submit" className="btn btn-ghost" disabled={profile.sample || leaving !== null} aria-busy={leaving === 'here'}>
            <LogOut size={16} aria-hidden />
            Sign out
          </button>
        </form>
        <form action={signOutEverywhereAction} onSubmit={() => setLeaving('everywhere')}>
          <button type="submit" className="btn btn-quiet" disabled={profile.sample || leaving !== null} aria-busy={leaving === 'everywhere'}>
            Sign out everywhere
          </button>
        </form>
      </div>
      <p className="muted small">Sign out everywhere ends every session this account has, on every computer and phone, including this one.</p>
    </Card>
  );
}
