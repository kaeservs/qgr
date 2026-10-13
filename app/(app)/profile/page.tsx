import type { Metadata } from 'next';
import { EmailForm, PasswordForm, PhotoAndName, SignInPanel } from '@/components/profile/ProfileForms';
import type { ProfileView } from '@/components/profile/ProfileForms';
import styles from '@/components/profile/profile.module.css';
import { getCurrentUser, getTeamSettings, usingSampleData } from '@/lib/data';
import { formatInZone } from '@/lib/schedule';
import { getViewer } from '@/lib/session';
import { getSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your profile' };

/** The signed-in teammate's own account. The sample data has none, so its page shows and saves nothing. */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, user, settings, viewer, supabase] = await Promise.all([searchParams, getCurrentUser(), getTeamSettings(), getViewer(), getSupabase()]);
  const sample = usingSampleData();
  // Only Auth knows when they last signed in and what email waits for its link.
  const account = supabase ? (await supabase.auth.getUser()).data.user : null;
  const profile: ProfileView = {
    name: user.name,
    email: viewer?.email ?? 'you@quantumglobalresidency.com',
    role: user.role || 'Teammate',
    photoUrl: user.photoUrl,
    pendingEmail: account?.new_email ?? null,
    lastSignIn: account?.last_sign_in_at ? formatInZone(account.last_sign_in_at, settings.timeZone) : null,
    sample,
  };
  const confirm = params.confirm;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Your profile</h1>
          <p className="lead">Your photo and name, and how you sign in.</p>
        </div>
      </header>
      {sample && (
        <p className="muted small" role="status">
          The sample data has no accounts, so nothing here can be changed. Connect Supabase to edit your profile.
        </p>
      )}
      {confirm === 'done' && (
        <p className="pill pill-quiet" role="status">
          {profile.pendingEmail ? 'Link followed. Now follow the one sent to your other address too.' : 'Your email address is confirmed.'}
        </p>
      )}
      {confirm === 'failed' && (
        <p className="error-text" role="alert">
          That link didn’t work: it may have been used already or be over a day old. Change the email again for a fresh one.
        </p>
      )}
      <div className={styles.grid}>
        <PhotoAndName profile={profile} />
        <SignInPanel profile={profile} />
        <EmailForm profile={profile} />
        <PasswordForm profile={profile} />
      </div>
    </div>
  );
}
