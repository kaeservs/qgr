import type { ReactNode } from 'react';
import styles from '@/components/auth/auth.module.css';

/** Sign-in and no-access: outside the dashboard's shell, beside the brand's arcs. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.auth}>
      <section className={styles.art} aria-hidden>
        <p className={styles.artTitle}>Your AI marketing team</p>
        <p className={styles.artText}>Track competitors. Plan the strategy. Write the ads.</p>
      </section>
      <main className={styles.panel}>{children}</main>
    </div>
  );
}
