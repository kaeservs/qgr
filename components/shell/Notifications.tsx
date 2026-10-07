'use client';

import { Bell, CircleCheck, Eye, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { timeAgo } from '@/lib/format';
import type { Notice } from '@/lib/types';
import { useDismiss } from '../ui/useDismiss';
import styles from './shell.module.css';

const ICON = { review: Eye, done: CircleCheck, failed: TriangleAlert } as const;

export function Notifications({ notices, now }: { notices: Notice[]; now: string }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, open, () => setOpen(false));

  return (
    <div className={styles.popWrap} ref={wrap}>
      <button
        type="button"
        className="icon-btn"
        aria-label={seen ? 'Notifications' : `Notifications, ${notices.length} new`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setSeen(true);
        }}
      >
        <Bell size={20} strokeWidth={1.8} />
        {!seen && notices.length > 0 && <span className={styles.badgeDot} />}
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Notifications">
          <p className={styles.popTitle}>Updates</p>
          <ul>
            {notices.map((n) => {
              const Icon = ICON[n.tone];
              return (
                <li key={n.id}>
                  <Link href={n.href} className={styles.notice} onClick={() => setOpen(false)}>
                    <span className={`${styles.noticeIcon} ${styles[`notice-${n.tone}`]}`}>
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className={styles.noticeText}>
                      <span>{n.text}</span>
                      <span className="muted small">{timeAgo(n.at, now)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
