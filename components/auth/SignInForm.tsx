'use client';

import { TriangleAlert } from 'lucide-react';
import { useActionState } from 'react';
import { signIn } from '@/app/(auth)/actions';
import type { SignInState } from '@/app/(auth)/actions';
import styles from './auth.module.css';

const START: SignInState = { error: null, email: '' };

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, START);
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span className="label">Email</span>
        <input className="input" type="email" name="email" autoComplete="email" required defaultValue={state.email} />
      </label>
      <label className="field">
        <span className="label">Password</span>
        <input className="input" type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p className="error-text" role="alert">
          <TriangleAlert size={15} aria-hidden />
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
