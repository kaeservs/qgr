'use server';

import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';
import { getSupabase } from '@/lib/supabase/server';

export interface SignInState {
  error: string | null;
  email: string;
}

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and your password.', email };

  const supabase = await getSupabase();
  if (!supabase) redirect('/');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message =
      error.code === 'invalid_credentials'
        ? 'That email and password don’t match an account.'
        : error.code === 'email_not_confirmed'
          ? 'Confirm your email address first, then sign in.'
          : error.status === 429
            ? 'Too many tries. Wait a minute, then try again.'
            : 'Signing in didn’t work just now. Try again in a moment.';
    return { error: message, email };
  }
  redirect(safeNext(form.get('next')));
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect(supabase ? '/sign-in' : '/');
}
