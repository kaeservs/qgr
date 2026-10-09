'use client';

import { Compass, ImagePlus, LoaderCircle, Radar, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ActivityItem } from '@/lib/types';
import { useDismiss } from '../ui/useDismiss';
import styles from './shell.module.css';

/** How often to ask while something is at work, and while all is quiet. */
const BUSY_MS = 5_000;
const QUIET_MS = 30_000;

const ICON = { tracker: Radar, strategist: Compass, content: Sparkles } as const;
const iconOf = (item: ActivityItem) => (item.kind === 'post' ? Send : item.kind === 'picture' ? ImagePlus : ICON[item.stage ?? 'tracker']);

/** "for 3 min", from when it started to the server's now: the same text on the server and in the browser. */
function lasted(since: string, now: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(now) - Date.parse(since)) / 60_000));
  return minutes < 1 ? 'just started' : `for ${minutes} min`;
}

/**
 * What the agents and n8n are doing right now, on every page: while anything
 * is at work, a turning ring and a count, and behind it the list, each line
 * linking to where it can be followed. It asks every 5 seconds while
 * something works and every 30 while all is quiet, only while the tab is in
 * view. When something finishes, the page re-reads so it shows the result.
 */
export function Working({ initial, now }: { initial: ActivityItem[]; now: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [clock, setClock] = useState(now);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = useRef(items);
  current.current = items;
  useDismiss(wrap, open, () => setOpen(false));

  // A fresh read of the page (after an action, or a page that follows a run) brings a fresh list.
  useEffect(() => {
    setItems(initial);
    setClock(now);
  }, [initial, now]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => void tick(), current.current.length > 0 ? BUSY_MS : QUIET_MS);
    };
    async function tick() {
      if (document.visibilityState === 'visible') {
        const res = await fetch('/api/activity', { cache: 'no-store' }).catch(() => null);
        const body = res?.ok ? ((await res.json().catch(() => null)) as { items: ActivityItem[]; now: string } | null) : null;
        if (body && !stopped) {
          const finished = current.current.some((was) => !body.items.some((item) => item.id === was.id));
          setItems(body.items);
          setClock(body.now);
          if (finished) router.refresh();
        }
      }
      if (!stopped) schedule();
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      void tick();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  if (items.length === 0) return null;
  const summary = `${items.length} at work now`;
  return (
    <div className={styles.popWrap} ref={wrap}>
      <button type="button" className={styles.working} aria-label={`${summary}: see what`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden />
        <span className={styles.workingCount}>{items.length}</span>
        <span className={styles.workingWord}>working</span>
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="At work now">
          <p className={styles.popTitle}>At work now</p>
          <ul>
            {items.map((item) => {
              const Icon = iconOf(item);
              return (
                <li key={item.id}>
                  <Link href={item.href} className={styles.notice} onClick={() => setOpen(false)}>
                    <span className={`${styles.noticeIcon} ${styles.workingIcon}`}>
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className={styles.noticeText}>
                      <span>
                        <strong>{item.label}</strong> · {item.subject}
                      </span>
                      <span className={styles.workingSince}>
                        <LoaderCircle size={12} className="spin" aria-hidden />
                        {lasted(item.since, clock)}
                      </span>
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
