'use client';

import { Menu, Plus } from 'lucide-react';
import Link from 'next/link';
import type { Notice, SearchItem } from '@/lib/types';
import { Notifications } from './Notifications';
import { SearchBox } from './SearchBox';
import styles from './shell.module.css';

export function Topbar({ onMenu, searchIndex, notices, now }: { onMenu: () => void; searchIndex: SearchItem[]; notices: Notice[]; now: string }) {
  return (
    <header className={styles.topbar}>
      <button type="button" className={`icon-btn ${styles.menuBtn}`} onClick={onMenu} aria-label="Open menu">
        <Menu size={20} />
      </button>
      <SearchBox index={searchIndex} />
      <div className={styles.topActions}>
        <Notifications notices={notices} now={now} />
        <Link href="/runs/new" className={`btn btn-primary ${styles.newRun}`} aria-label="New run">
          <Plus size={18} strokeWidth={2.2} aria-hidden />
          <span>New run</span>
        </Link>
      </div>
    </header>
  );
}
