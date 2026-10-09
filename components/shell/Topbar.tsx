'use client';

import { Menu, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ActivityItem, Notice, SearchItem } from '@/lib/types';
import { Notifications } from './Notifications';
import { SearchBox } from './SearchBox';
import { Working } from './Working';
import styles from './shell.module.css';

export function Topbar({
  onMenu,
  searchIndex,
  notices,
  activity,
  now,
  sample,
}: {
  onMenu: () => void;
  searchIndex: SearchItem[];
  notices: Notice[];
  activity: ActivityItem[];
  now: string;
  sample: boolean;
}) {
  return (
    <header className={styles.topbar}>
      <button type="button" className={`icon-btn ${styles.menuBtn}`} onClick={onMenu} aria-label="Open menu">
        <Menu size={20} />
      </button>
      <SearchBox index={searchIndex} />
      <div className={styles.topActions}>
        {sample && (
          <span className={`pill pill-quiet pill-sm ${styles.sampleTag}`} title="Supabase is not connected, so these runs are examples">
            Sample<span className={styles.sampleWord}> data</span>
          </span>
        )}
        <Working initial={activity} now={now} />
        <Notifications notices={notices} now={now} />
        <Link href="/runs/new" className={`btn btn-primary ${styles.newRun}`} aria-label="New run">
          <Plus size={18} strokeWidth={2.2} aria-hidden />
          <span>New run</span>
        </Link>
      </div>
    </header>
  );
}
