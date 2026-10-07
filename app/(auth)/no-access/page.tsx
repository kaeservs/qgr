import { LogOut, UserX } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/session';
import { signOut } from '../actions';
import styles from '@/components/auth/auth.module.css';

export const metadata: Metadata = { title: 'No access yet' };

/** Signed in, but not on the team: the account exists and row level security shows it nothing. */
export default async function NoAccessPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.role) redirect('/');

  return (
    <div className={styles.card}>
      <span className={styles.cardIcon}>
        <UserX size={22} aria-hidden />
      </span>
      <div>
        <h1 className="display h2">You’re not on the team yet</h1>
        <p className="muted">
          You’re signed in as <strong className={styles.email}>{viewer.email}</strong>. Ask an owner to add you, then sign in again.
        </p>
      </div>
      <form action={signOut}>
        <button type="submit" className="btn btn-ghost">
          <LogOut size={16} aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}
