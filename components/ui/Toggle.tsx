'use client';

import { cx } from '@/lib/cx';
import styles from './ui.module.css';

/** A switch. While `busy`, its change is being saved: a ring turns in the knob. */
export function Toggle({ checked, onChange, label, busy = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy}
      className={cx(styles.toggle, checked && styles.toggleOn)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}
