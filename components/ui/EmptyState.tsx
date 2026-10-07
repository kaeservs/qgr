import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './ui.module.css';

/** What a list says before it has anything in it: what will appear there, and from where. */
export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className={`card empty ${styles.emptyState}`}>
      <Icon size={28} aria-hidden />
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyText}>{children}</p>
    </div>
  );
}
