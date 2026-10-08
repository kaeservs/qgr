'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Notice, SearchItem, User } from '@/lib/types';
import { ToastProvider } from '../ui/Toast';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import styles from './shell.module.css';

export function AppShell({
  user,
  searchIndex,
  notices,
  now,
  sample,
  children,
}: {
  user: User;
  searchIndex: SearchItem[];
  notices: Notice[];
  now: string;
  /** True when Supabase is not configured and the pages show sample data. */
  sample: boolean;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <ToastProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className={styles.shell}>
        <Sidebar user={user} open={navOpen} onClose={() => setNavOpen(false)} canSignOut={!sample} />
        <div className={styles.main}>
          <Topbar onMenu={() => setNavOpen(true)} searchIndex={searchIndex} notices={notices} now={now} sample={sample} />
          <main id="main" className={styles.content}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
