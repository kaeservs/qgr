import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/auth/SignInForm';
import { safeNext } from '@/lib/safe-next';
import { getViewer } from '@/lib/session';
import { supabaseConfig } from '@/lib/supabase/config';
import styles from '@/components/auth/auth.module.css';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The sample data has no accounts to sign in to.
  if (!supabaseConfig()) redirect('/');
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getViewer()) redirect(next);

  return (
    <div className={styles.card}>
      <Image src="/brand/qgr-logo.png" alt="Quantum Global, Residency and Citizenship" width={132} height={76} priority />
      <div>
        <h1 className="display h2">Sign in</h1>
        <p className="muted">Use the account your team set up for you.</p>
      </div>
      <SignInForm next={next} />
    </div>
  );
}
